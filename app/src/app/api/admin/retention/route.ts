import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { logApiError } from '@/lib/api-log';

/**
 * Data-retention purge — driven monthly by the scheduled-jobs workflow.
 *
 * Enforces what the privacy policy promises (/privacy §5):
 *   - analytics rows (site_visits, site_events) older than 13 months
 *   - ephemeral operational rows: expired rate-limit windows and consumed/
 *     expired operator nonces older than 24 h
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` — same fail-closed posture as
 * the other scheduled endpoints. Deletes are idempotent; response reports
 * per-table counts for the workflow log.
 */

const ANALYTICS_RETENTION_DAYS = 396; // 13 months
const EPHEMERAL_RETENTION_HOURS = 24;

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  const analyticsCutoff = new Date(Date.now() - ANALYTICS_RETENTION_DAYS * 86_400_000).toISOString();
  const ephemeralCutoff = new Date(Date.now() - EPHEMERAL_RETENTION_HOURS * 3_600_000).toISOString();

  const purged: Record<string, number> = {};

  const jobs: { table: string; run: () => PromiseLike<{ error: { code?: string } | null; count: number | null }> }[] = [
    {
      table: 'site_visits',
      run: () => supabase.from('site_visits').delete({ count: 'exact' }).lt('created_at', analyticsCutoff),
    },
    {
      table: 'site_events',
      run: () => supabase.from('site_events').delete({ count: 'exact' }).lt('created_at', analyticsCutoff),
    },
    {
      table: 'kyb_rate_limit_windows',
      run: () => supabase.from('kyb_rate_limit_windows').delete({ count: 'exact' }).lt('window_end', ephemeralCutoff),
    },
    {
      table: 'kyb_operator_nonces',
      run: () => supabase.from('kyb_operator_nonces').delete({ count: 'exact' }).lt('expires_at', ephemeralCutoff),
    },
  ];

  for (const job of jobs) {
    const { error, count } = await job.run();
    if (error) {
      logApiError('admin/retention', 'purge_failed', { code: error.code ?? 'unknown' });
      return NextResponse.json({ error: `purge failed on ${job.table}`, purged }, { status: 502 });
    }
    purged[job.table] = count ?? 0;
  }

  return NextResponse.json({ ok: true, purged, analyticsCutoff, ephemeralCutoff });
}
