import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyOfferingCurator } from '@/lib/offering/auth';
import {
  validateOfferingTerms,
  parseTermsRow,
  type OfferingTermsInput,
} from '@/lib/offering/terms';

/**
 * Vault offering terms.
 *
 *   GET  → public list of all terms (no PII: manager name, strategy, risk
 *          grade, illustrative APY range — content shown verbatim in the UI).
 *   PUT  → upsert one row. Curator-gated: EIP-191 signature over
 *          `offering-terms:put:<vaultAddress>` + on-chain
 *          UNDERWRITING_CURATOR/OWNER role check. The action string binds
 *          the signature to the target vault, so a captured signature cannot
 *          be replayed against a different vault.
 *
 * Fail-closed: without the service-role client both verbs return 503.
 */

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'storage unavailable' }, { status: 503 });
  }
  const { data, error } = await supabase
    .from('vault_offering_terms')
    .select('vault_address, manager_name, strategy_statement, risk_grade, target_apy_min_bps, target_apy_max_bps, updated_by, updated_at');
  if (error) {
    return NextResponse.json({ error: 'query failed' }, { status: 502 });
  }
  const terms = (data ?? [])
    .map((row) => parseTermsRow(row as Record<string, unknown>))
    .filter((t) => t !== null);
  return NextResponse.json({ terms });
}

interface PutBody {
  terms: OfferingTermsInput;
  auth: { address: `0x${string}`; timestamp: number; signature: `0x${string}` };
}

export async function PUT(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'storage unavailable' }, { status: 503 });
  }

  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || !body.terms || !body.auth) {
    return NextResponse.json({ error: 'terms and auth are required' }, { status: 400 });
  }

  const validated = validateOfferingTerms(body.terms);
  if (!validated.ok) {
    return NextResponse.json({ error: 'validation failed', details: validated.errors }, { status: 422 });
  }
  const terms = validated.value;

  const authResult = await verifyOfferingCurator(`offering-terms:put:${terms.vaultAddress}`, body.auth);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const { error } = await supabase.from('vault_offering_terms').upsert(
    {
      vault_address: terms.vaultAddress,
      manager_name: terms.managerName,
      strategy_statement: terms.strategyStatement,
      risk_grade: terms.riskGrade,
      target_apy_min_bps: terms.targetApyMinBps,
      target_apy_max_bps: terms.targetApyMaxBps,
      updated_by: authResult.address.toLowerCase(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'vault_address' },
  );
  if (error) {
    return NextResponse.json({ error: 'write failed' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, vaultAddress: terms.vaultAddress });
}
