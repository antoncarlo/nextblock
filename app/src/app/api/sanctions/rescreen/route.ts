import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyCronSecret } from '@/lib/notifications/auth';
import { getSanctionsProvider } from '@/lib/sanctions/provider';
import { logApiError } from '@/lib/api-log';

/**
 * Monthly sanctions re-screening cron.
 *
 * Walks every kyb_application with status='approved' and runs them through
 * the configured sanctions provider. Each call appends a row in
 * `sanctions_screening_runs` (audit-of-record); any NEW match becomes a
 * `pending_sentinel` row in `sanctions_matches` for the Sentinel queue.
 *
 * Why monthly: sanctions lists update continuously; a previously clean
 * entity can become OFAC/EU-listed at any time. Monthly is a sensible
 * default tradeoff between cost (CA bills per search) and freshness. If
 * a sentinel-grade incident requires faster re-screening they can curl
 * this endpoint on demand with the same CRON_SECRET.
 *
 * Auth: shared CRON_SECRET (reused from /api/notifications/refresh and
 * /api/audit/claims/refresh — no new env var). Fail-closed when unset.
 */

const PAGE_SIZE = 100;

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  let provider;
  try {
    provider = getSanctionsProvider();
  } catch (err) {
    logApiError('sanctions/rescreen', 'provider_misconfigured', {
      code: err instanceof Error ? err.name : 'unknown',
    });
    return NextResponse.json({ error: 'provider misconfigured' }, { status: 503 });
  }

  let totalScanned = 0;
  let totalNewMatches = 0;
  let offset = 0;
  // Bounded loop: a single cron invocation handles up to PAGE_SIZE * 20
  // applications (2000). At pilot scale (<100 approved entities) one pass
  // covers everything; for larger production we'll move to a queue.
  for (let page = 0; page < 20; page += 1) {
    const { data: apps, error } = await supabase
      .from('kyb_applications')
      .select('id, company_name, jurisdiction')
      .eq('status', 'approved')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      logApiError('sanctions/rescreen', 'list_failed', { code: error.code ?? 'unknown' });
      break;
    }
    if (!apps || apps.length === 0) break;

    for (const app of apps) {
      totalScanned += 1;
      const subject = {
        kybApplicationUuid: app.id as string,
        kind: 'entity' as const,
        name: app.company_name as string,
        country:
          typeof app.jurisdiction === 'string' ? app.jurisdiction.slice(0, 2).toUpperCase() : undefined,
      };
      const result = await provider.screen(subject);

      const { data: runRow, error: runErr } = await supabase
        .from('sanctions_screening_runs')
        .insert({
          kyb_application_id: app.id,
          subject_kind: subject.kind,
          subject_name: subject.name,
          subject_country: subject.country ?? null,
          provider: result.provider,
          provider_search_id: result.providerSearchId ?? null,
          result_code: result.resultCode,
          match_count: result.matches.length,
          raw_response: result.rawResponse ?? null,
        })
        .select('id')
        .single();
      if (runErr || !runRow) {
        logApiError('sanctions/rescreen', 'run_insert_failed', { code: runErr?.code ?? 'unknown' });
        continue;
      }

      if (result.resultCode === 'match' && result.matches.length > 0) {
        // Only insert matches we haven't already seen for this application.
        const { data: existing } = await supabase
          .from('sanctions_matches')
          .select('provider_match_id')
          .eq('kyb_application_id', app.id);
        const known = new Set((existing ?? []).map((r) => r.provider_match_id));
        const fresh = result.matches.filter((m) => !known.has(m.providerMatchId));
        if (fresh.length === 0) continue;

        const rows = fresh.map((m) => ({
          run_id: runRow.id,
          kyb_application_id: app.id,
          provider_match_id: m.providerMatchId,
          matched_name: m.matchedName,
          sanctions_list: m.sanctionsList,
          severity: m.severity,
          match_score: m.matchScore ?? null,
          evidence: m.evidence ?? null,
        }));
        const { error: insErr } = await supabase.from('sanctions_matches').insert(rows);
        if (insErr) {
          logApiError('sanctions/rescreen', 'match_insert_failed', { code: insErr.code ?? 'unknown' });
        } else {
          totalNewMatches += fresh.length;
        }
      }
    }

    if (apps.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return NextResponse.json({ scanned: totalScanned, newMatches: totalNewMatches });
}
