import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyCronSecret } from '@/lib/notifications/auth';
import { diffClaimStatus, normalizeAddress } from '@/lib/notifications/derive';
import { NEXTBLOCK_ADDRESSES } from '@/config/generated/addressBook';
import { logApiError } from '@/lib/api-log';
import { getEmailProvider } from '@/lib/email/provider';
import { renderNotificationEmail } from '@/lib/email/templates';

/**
 * Notification refresh — server-cron entrypoint.
 *
 * Walks every on-chain claim (lens dashboard), looks up each recipient's last
 * known status from `notification_state`, and inserts a row in `notifications`
 * for every transition (plus the high-water mark in `notification_state`).
 *
 * Recipient set per claim:
 *   - the claimant (always)
 *   - every address in REVIEWER_ADDRESSES (env, comma-separated lowercase
 *     hex addresses). These are the Sentinel / Committee / Owner wallets the
 *     operator wants notified about every claim transition. Empty / unset =
 *     no reviewer broadcast (back-compat with the original single-recipient
 *     behavior).
 *
 * `diffClaimStatus` is per-(claim, recipient), so each recipient has its own
 * high-water mark in `notification_state` — a newly added reviewer doesn't
 * get spammed with the full history of pre-existing claims (the diff function
 * suppresses first-sight of settled claims by design).
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`. Fail-closed when unset, so this
 * route is unreachable until the operator wires the env var (Vercel Cron
 * automatically attaches the project's CRON_SECRET).
 */

function reviewerAddresses(): `0x${string}`[] {
  const raw = process.env.REVIEWER_ADDRESSES ?? '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^0x[0-9a-f]{40}$/.test(s)) as `0x${string}`[];
}

const GET_CLAIM_COUNT_ABI = [
  {
    type: 'function',
    name: 'getClaimCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const GET_CLAIM_DASHBOARD_ABI = [
  {
    type: 'function',
    name: 'getClaimDashboard',
    stateMutability: 'view',
    inputs: [{ name: 'claimId', type: 'uint256' }],
    outputs: [
      {
        name: 'v',
        type: 'tuple',
        components: [
          { name: 'schemaVersion', type: 'uint8' },
          { name: 'status', type: 'uint8' }, // DataStatus: 1 = AVAILABLE
          {
            name: 'claim',
            type: 'tuple',
            components: [
              { name: 'claimId', type: 'uint256' },
              { name: 'portfolioId', type: 'uint256' },
              { name: 'vault', type: 'address' },
              { name: 'claimant', type: 'address' },
              { name: 'requestedAmount', type: 'uint256' },
              { name: 'approvedAmount', type: 'uint256' },
              { name: 'claimType', type: 'uint8' },
              { name: 'status', type: 'uint8' },
              { name: 'evidenceHash', type: 'bytes32' },
              { name: 'submittedAt', type: 'uint64' },
              { name: 'challengeDeadline', type: 'uint64' },
              { name: 'frozen', type: 'bool' },
              { name: 'receiptId', type: 'uint256' },
            ],
          },
        ],
      },
    ],
  },
] as const;

const DATA_STATUS_AVAILABLE = 1;

function rpcUrl(): string {
  return process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org';
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'notifications backend unavailable' }, { status: 503 });

  const lens = NEXTBLOCK_ADDRESSES.lens as `0x${string}`;
  const claimManager = NEXTBLOCK_ADDRESSES.claimManager as `0x${string}`;
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl()) });

  let total: bigint;
  try {
    total = await client.readContract({
      address: claimManager,
      abi: GET_CLAIM_COUNT_ABI,
      functionName: 'getClaimCount',
    });
  } catch {
    logApiError('notifications/refresh', 'claim_count_failed');
    return NextResponse.json({ error: 'on-chain read unavailable' }, { status: 502 });
  }

  let scanned = 0;
  let inserted = 0;
  const cap = Number(total);
  const reviewers = reviewerAddresses();

  for (let i = 0; i < cap; i += 1) {
    let v: {
      status: number;
      claim: {
        claimId: bigint;
        portfolioId: bigint;
        vault: `0x${string}`;
        claimant: `0x${string}`;
        requestedAmount: bigint;
        approvedAmount: bigint;
        claimType: number;
        status: number;
        evidenceHash: `0x${string}`;
        submittedAt: bigint;
        challengeDeadline: bigint;
        frozen: boolean;
        receiptId: bigint;
      };
    };
    try {
      v = (await client.readContract({
        address: lens,
        abi: GET_CLAIM_DASHBOARD_ABI,
        functionName: 'getClaimDashboard',
        args: [BigInt(i)],
      })) as typeof v;
    } catch {
      continue;
    }
    if (v.status !== DATA_STATUS_AVAILABLE) continue;
    scanned += 1;

    const claimant = normalizeAddress(v.claim.claimant);
    const claimId = Number(v.claim.claimId);

    // Recipient set: claimant + reviewer addresses (deduped). The claimant
    // already being a reviewer is a non-issue — the Set keeps a single entry.
    const recipients = new Set<`0x${string}`>([claimant, ...reviewers]);

    for (const recipient of recipients) {
      const { data: stateRow } = await supabase
        .from('notification_state')
        .select('last_status')
        .eq('claim_id', claimId)
        .eq('recipient_addr', recipient)
        .maybeSingle();
      const last = stateRow ? Number(stateRow.last_status) : null;

      const draft = diffClaimStatus(
        {
          claimId: v.claim.claimId,
          vault: v.claim.vault,
          portfolioId: v.claim.portfolioId,
          requestedAmount: v.claim.requestedAmount,
          status: v.claim.status,
          submittedAt: v.claim.submittedAt,
          challengeDeadline: v.claim.challengeDeadline,
          frozen: v.claim.frozen,
          disputeWindowElapsed: false,
          hasAssessment: false,
          anomalous: false,
          assessmentAnomalyBps: 0,
        },
        recipient,
        last,
      );

      if (draft) {
        const { error: insErr } = await supabase.from('notifications').insert({
          recipient_addr: draft.recipientAddr,
          claim_id: Number(draft.claimId),
          vault: draft.vault,
          kind: draft.kind,
          from_status: draft.fromStatus,
          to_status: draft.toStatus,
          message: draft.message,
        });
        if (insErr) {
          logApiError('notifications/refresh', 'insert_failed', { code: insErr.code ?? 'unknown' });
        } else {
          inserted += 1;
        }

      // Optional email fan-out — only when the recipient has explicitly
      // opted in (privacy-by-default). Failures here are non-fatal: the
      // in-app row is the source of truth, email is best-effort.
      const { data: prefs } = await supabase
        .from('notification_prefs')
        .select('email_enabled, email')
        .eq('address', draft.recipientAddr)
        .maybeSingle();
      if (prefs?.email_enabled && prefs.email) {
        try {
          const email = renderNotificationEmail({
            claimId: Number(draft.claimId),
            kind: draft.kind,
            message: draft.message,
            vault: draft.vault,
            appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://nextblock.finance',
          });
          const provider = getEmailProvider();
          await provider.send({
            to: prefs.email,
            subject: email.subject,
            text: email.text,
            html: email.html,
          });
        } catch (err) {
          logApiError('notifications/refresh', 'email_send_failed', {
            code: err instanceof Error ? err.name : 'unknown',
          });
          // continue — we already persisted the in-app notification
        }
      }
      }

      // Upsert the high-water mark even when no draft (first-sight-settled
      // case), so we don't re-scan the same claim against the same recipient
      // forever.
      const { error: stateErr } = await supabase.from('notification_state').upsert(
        {
          claim_id: claimId,
          recipient_addr: recipient,
          last_status: v.claim.status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'claim_id,recipient_addr' },
      );
      if (stateErr) {
        logApiError('notifications/refresh', 'state_upsert_failed', { code: stateErr.code ?? 'unknown' });
      }
    }
  }

  return NextResponse.json({ scanned, inserted, total: cap, reviewers: reviewers.length });
}
