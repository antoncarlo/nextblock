import { NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { NEXTBLOCK_CHAIN_ID } from '@/config/generated/addressBook';

/**
 * Detailed health endpoint for external uptime monitors (BetterStack,
 * UptimeRobot, Pingdom, ...).
 *
 * Unlike `/api/health` which is a 5-line "I'm up" probe, this endpoint
 * also tests the critical downstream dependencies:
 *   - Supabase service-role reachability (read-only count probe)
 *   - RPC reachability + latency (bounded 3s)
 *
 * The endpoint is intentionally PUBLIC (no auth) because uptime monitors
 * can't authenticate, and the response carries no PII. Status code reflects
 * aggregate health: 200 when everything is up, 503 when any critical
 * dependency is down. Monitors page on non-2xx.
 */
export async function GET() {
  const checks: Array<{ name: string; ok: boolean; ms: number; error?: string | null }> = [];

  // 1. Supabase reachability.
  const supabase = getSupabaseServerClient();
  const supabaseStart = performance.now();
  let supabaseOk = false;
  let supabaseError: string | null = null;
  if (supabase) {
    try {
      const { error } = await supabase.from('kyb_applications').select('id', { count: 'exact', head: true }).limit(1);
      supabaseOk = !error;
      if (error) supabaseError = error.code ?? 'unknown';
    } catch (err) {
      supabaseError = err instanceof Error ? err.name : 'unknown';
    }
  } else {
    supabaseError = 'service-role client missing';
  }
  checks.push({
    name: 'supabase',
    ok: supabaseOk,
    ms: Math.round(performance.now() - supabaseStart),
    error: supabaseError,
  });

  // 2. RPC reachability + latency.
  const rpc = process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org';
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
  const rpcStart = performance.now();
  let rpcOk = false;
  let rpcError: string | null = null;
  try {
    await Promise.race<bigint>([
      client.getBlockNumber(),
      new Promise<bigint>((_, rej) => setTimeout(() => rej(new Error('rpc_timeout_3s')), 3000)),
    ]);
    rpcOk = true;
  } catch (err) {
    rpcError = err instanceof Error ? err.message.slice(0, 120) : 'rpc_error';
  }
  checks.push({
    name: 'rpc',
    ok: rpcOk,
    ms: Math.round(performance.now() - rpcStart),
    error: rpcError,
  });

  // 3. Required configuration. A route that 503s on demand is quiet until
  //    someone hits it; the uptime monitor hitting THIS endpoint makes a
  //    missing critical env var loud within minutes of a bad deploy. Names
  //    only — never values.
  const requiredEnv = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'CRON_SECRET',
    'PINATA_JWT',
  ];
  const missingEnv = requiredEnv.filter((name) => !process.env[name]);
  checks.push({
    name: 'env',
    ok: missingEnv.length === 0,
    ms: 0,
    error: missingEnv.length > 0 ? `missing: ${missingEnv.join(', ')}` : null,
  });

  const allOk = checks.every((c) => c.ok);
  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? 'unknown',
      chain: 'base-sepolia',
      chainId: NEXTBLOCK_CHAIN_ID,
      checks,
      at: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 },
  );
}
