import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyClaimReviewer, type EvidenceAuthInput } from '@/lib/evidence/auth';
import { NEXTBLOCK_CHAIN_ID } from '@/config/generated/addressBook';

/**
 * Admin system status — single endpoint that surfaces:
 *   - which off-chain provider is configured for each pluggable surface
 *     (sanctions, AI, email, wallet screening) — env-derived, no secret
 *     leakage (only mode + key-present flag)
 *   - which env vars the server expects, with present/missing state
 *   - the configured RPC's latency + latest block (probe)
 *   - Supabase service-role reachability
 *   - the deploy version (Vercel-attached env)
 *
 * Reviewer-auth (verifyClaimReviewer) — same surface as the rest of the
 * admin pages. Returns 401/403 if the signer lacks Committee/Sentinel/Owner.
 *
 * NEVER returns the actual value of any secret; only `present: true|false`.
 */

interface ProviderConfig {
  surface: 'sanctions' | 'ai' | 'email' | 'wallet';
  selected: string;
  isMock: boolean;
  /** Whether the keys required by the selected provider are present. */
  keysReady: boolean;
  /** Free-form list of required env vars (present?). */
  requiredVars: Array<{ name: string; present: boolean }>;
}

function isPresent(v: string | undefined): boolean {
  return typeof v === 'string' && v.length > 0;
}

function readProviders(env: NodeJS.ProcessEnv): ProviderConfig[] {
  const sanctionsSelected = (env.SANCTIONS_PROVIDER ?? 'mock').toLowerCase();
  const aiSelected = (env.AI_ASSESSOR_PROVIDER ?? 'mock').toLowerCase();
  const emailSelected = (env.EMAIL_PROVIDER ?? 'mock').toLowerCase();
  const walletSelected = (env.WALLET_SCREENING_PROVIDER ?? 'mock').toLowerCase();

  const sanctions: ProviderConfig = {
    surface: 'sanctions',
    selected: sanctionsSelected,
    isMock: sanctionsSelected === 'mock',
    requiredVars:
      sanctionsSelected === 'complyadvantage'
        ? [{ name: 'COMPLY_ADVANTAGE_API_KEY', present: isPresent(env.COMPLY_ADVANTAGE_API_KEY) }]
        : [],
    keysReady:
      sanctionsSelected === 'mock' ? true : isPresent(env.COMPLY_ADVANTAGE_API_KEY),
  };
  const ai: ProviderConfig = {
    surface: 'ai',
    selected: aiSelected,
    isMock: aiSelected === 'mock',
    requiredVars:
      aiSelected === 'braino'
        ? [{ name: 'BRAINO_API_KEY', present: isPresent(env.BRAINO_API_KEY) }]
        : [],
    keysReady: aiSelected === 'mock' ? true : false, // placeholder until Braino client lands
  };
  const email: ProviderConfig = {
    surface: 'email',
    selected: emailSelected,
    isMock: emailSelected === 'mock',
    requiredVars:
      emailSelected === 'resend'
        ? [
            { name: 'RESEND_API_KEY', present: isPresent(env.RESEND_API_KEY) },
            { name: 'EMAIL_FROM', present: isPresent(env.EMAIL_FROM) },
          ]
        : [],
    keysReady:
      emailSelected === 'mock'
        ? true
        : isPresent(env.RESEND_API_KEY) && isPresent(env.EMAIL_FROM),
  };
  const wallet: ProviderConfig = {
    surface: 'wallet',
    selected: walletSelected,
    isMock: walletSelected === 'mock',
    requiredVars:
      walletSelected === 'mock'
        ? []
        : [{ name: 'WALLET_SCREENING_API_KEY', present: isPresent(env.WALLET_SCREENING_API_KEY) }],
    keysReady:
      walletSelected === 'mock' ? true : isPresent(env.WALLET_SCREENING_API_KEY),
  };

  return [sanctions, ai, email, wallet];
}

function readPlatformEnv(env: NodeJS.ProcessEnv): Array<{ name: string; present: boolean; required: boolean }> {
  return [
    { name: 'SUPABASE_SERVICE_ROLE_KEY', required: true, present: isPresent(env.SUPABASE_SERVICE_ROLE_KEY) },
    { name: 'NEXT_PUBLIC_SUPABASE_URL', required: true, present: isPresent(env.NEXT_PUBLIC_SUPABASE_URL) },
    {
      name: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY',
      required: true,
      present: isPresent(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) || isPresent(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    },
    { name: 'CRON_SECRET', required: true, present: isPresent(env.CRON_SECRET) },
    { name: 'BASE_SEPOLIA_RPC_URL', required: false, present: isPresent(env.BASE_SEPOLIA_RPC_URL) },
    { name: 'NEXT_PUBLIC_APP_URL', required: false, present: isPresent(env.NEXT_PUBLIC_APP_URL) },
    { name: 'REVIEWER_ADDRESSES', required: false, present: isPresent(env.REVIEWER_ADDRESSES) },
  ];
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const address = sp.get('address');
  const timestamp = sp.get('timestamp');
  const signature = sp.get('signature');
  if (!address || !timestamp || !signature || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: 'missing auth params' }, { status: 400 });
  }
  const auth: EvidenceAuthInput = {
    address: address as `0x${string}`,
    timestamp: Number(timestamp),
    signature: signature as `0x${string}`,
  };
  const v = await verifyClaimReviewer('admin:system-status', auth);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });

  // RPC probe — latency + latest block, with a hard timeout via Promise.race
  // so a hanging RPC doesn't stall the whole status response.
  const rpc = process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org';
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
  const start = performance.now();
  let blockNumber: bigint | null = null;
  let rpcError: string | null = null;
  try {
    blockNumber = await Promise.race<bigint>([
      client.getBlockNumber(),
      new Promise<bigint>((_, rej) => setTimeout(() => rej(new Error('rpc_timeout_3s')), 3000)),
    ]);
  } catch (err) {
    rpcError = err instanceof Error ? err.message.slice(0, 120) : 'rpc_error';
  }
  const rpcLatencyMs = Math.round(performance.now() - start);

  // Supabase service-role reachability — a trivial select against a known table.
  const supabase = getSupabaseServerClient();
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

  // Vercel auto-injects VERCEL_GIT_COMMIT_SHA / VERCEL_DEPLOYMENT_ID at build.
  const deploy = {
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    environment: process.env.VERCEL_ENV ?? 'unknown',
    region: process.env.VERCEL_REGION ?? null,
  };

  return NextResponse.json({
    providers: readProviders(process.env),
    platformEnv: readPlatformEnv(process.env),
    rpc: {
      url: rpc.replace(/(\/\/)([^@]+@)?(.+)$/, '$1$3'), // strip basic-auth credentials if present
      chainId: NEXTBLOCK_CHAIN_ID,
      latestBlock: blockNumber !== null ? blockNumber.toString() : null,
      latencyMs: rpcLatencyMs,
      error: rpcError,
    },
    supabase: { ok: supabaseOk, error: supabaseError },
    deploy,
    nowIso: new Date().toISOString(),
  });
}
