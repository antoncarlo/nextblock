import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem, type Log } from 'viem';
import { baseSepolia } from 'viem/chains';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyCronSecret } from '@/lib/notifications/auth';
import {
  decodeClaimManagerLog,
  decodeClaimReceiptLog,
  buildReceiptLink,
  type AuditRecord,
} from '@/lib/audit/decode';
import { NEXTBLOCK_ADDRESSES, NEXTBLOCK_CHAIN_ID } from '@/config/generated/addressBook';
import { logApiError } from '@/lib/api-log';

/**
 * Claim audit-trail refresh — server-cron entrypoint.
 *
 * For each indexed contract (ClaimManager, ClaimReceipt):
 *   1. read the (chain_id, contract_addr) cursor from `audit_cursor`
 *   2. eth_getLogs(from = last_block + 1, to = latest - REORG_SAFETY)
 *   3. decode every log via the pure decoder
 *   4. batch insert into `claim_audit_trail` with onConflict on (tx_hash,
 *      log_index) so re-runs / overlapping schedules are idempotent
 *   5. upsert the cursor to the highest scanned block
 *
 * The REORG_SAFETY margin (5 blocks on Base Sepolia) trades a small ingestion
 * delay for not having to delete + re-write rows on reorg. ClaimReceipt logs
 * are decoded using a receipt→claim map built from rows already in the audit
 * trail (ClaimApproved/ClaimPaid carry both ids); a receipt event with no
 * known link is skipped rather than invented.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`. Fail-closed when unset (no
 * env var → no scan). Vercel Cron auto-attaches the project's CRON_SECRET.
 */

const REORG_SAFETY = 5n;
const MAX_BLOCK_RANGE_PER_RUN = 5_000n; // RPC providers cap eth_getLogs; chunk if behind.

function rpcUrl(): string {
  return process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org';
}

interface IndexedRecord {
  claim_id: number;
  event_name: string;
  block_number: number;
  log_index: number;
  tx_hash: string;
  contract_addr: string;
  actor: string | null;
  data: Record<string, unknown>;
}

function toRow(r: AuditRecord): IndexedRecord {
  return {
    claim_id: Number(r.claimId),
    event_name: r.eventName,
    block_number: Number(r.blockNumber),
    log_index: r.logIndex,
    tx_hash: r.txHash,
    contract_addr: r.contractAddr,
    actor: r.actor,
    data: r.data,
  };
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'audit backend unavailable' }, { status: 503 });

  const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl()) });
  const chainId = NEXTBLOCK_CHAIN_ID;
  const claimManager = NEXTBLOCK_ADDRESSES.claimManager.toLowerCase() as `0x${string}`;
  const claimReceipt = NEXTBLOCK_ADDRESSES.claimReceipt.toLowerCase() as `0x${string}`;

  let latest: bigint;
  try {
    latest = await client.getBlockNumber();
  } catch (err) {
    logApiError('audit/claims/refresh', 'block_number_failed');
    return NextResponse.json({ error: 'rpc unavailable' }, { status: 502 });
  }
  const safeTo = latest > REORG_SAFETY ? latest - REORG_SAFETY : 0n;

  // Build a receipt→claim link from rows ALREADY in the audit trail. The
  // refresh job needs this to attach receipt events to their originating
  // claim. We pull recent ClaimApproved/ClaimPaid rows; older claims that
  // never got an evidence/receipt event are harmless to omit.
  const { data: linkRows } = await supabase
    .from('claim_audit_trail')
    .select('claim_id, data')
    .in('event_name', ['ClaimApproved', 'ClaimPaid'])
    .order('block_number', { ascending: false })
    .limit(500);
  const link = buildReceiptLink(
    (linkRows ?? [])
      .map((r) => {
        const receiptId = (r.data as { receiptId?: string }).receiptId;
        if (!receiptId) return null;
        return { receiptId: BigInt(receiptId), claimId: BigInt(r.claim_id) };
      })
      .filter((x): x is { receiptId: bigint; claimId: bigint } => x !== null),
  );

  let totalInserted = 0;
  let totalScanned = 0;

  const targets: Array<{ addr: `0x${string}`; kind: 'claimManager' | 'claimReceipt' }> = [
    { addr: claimManager, kind: 'claimManager' },
    { addr: claimReceipt, kind: 'claimReceipt' },
  ];
  for (const { addr, kind } of targets) {
    const { data: cur } = await supabase
      .from('audit_cursor')
      .select('last_block')
      .eq('chain_id', chainId)
      .eq('contract_addr', addr)
      .maybeSingle();
    const fromBlock = cur ? BigInt(cur.last_block) + 1n : safeTo > 50_000n ? safeTo - 50_000n : 0n;
    if (fromBlock > safeTo) continue;

    let cursor = fromBlock;
    let scanned = 0;
    let inserted = 0;
    while (cursor <= safeTo) {
      const end = cursor + MAX_BLOCK_RANGE_PER_RUN - 1n > safeTo ? safeTo : cursor + MAX_BLOCK_RANGE_PER_RUN - 1n;
      let logs: Log[];
      try {
        logs = await client.getLogs({ address: addr, fromBlock: cursor, toBlock: end });
      } catch {
        logApiError('audit/claims/refresh', 'get_logs_failed', { code: String(end) });
        break;
      }
      scanned += logs.length;
      const records = logs
        .map((log) => (kind === 'claimManager' ? decodeClaimManagerLog(log) : decodeClaimReceiptLog(log, link)))
        .filter((r): r is AuditRecord => r !== null)
        .map(toRow);

      if (records.length > 0) {
        const { error: insErr } = await supabase
          .from('claim_audit_trail')
          .upsert(records, { onConflict: 'tx_hash,log_index', ignoreDuplicates: true });
        if (insErr) {
          logApiError('audit/claims/refresh', 'insert_failed', { code: insErr.code ?? 'unknown' });
        } else {
          inserted += records.length;
        }
      }

      const { error: curErr } = await supabase.from('audit_cursor').upsert(
        {
          chain_id: chainId,
          contract_addr: addr,
          last_block: Number(end),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'chain_id,contract_addr' },
      );
      if (curErr) {
        logApiError('audit/claims/refresh', 'cursor_upsert_failed', { code: curErr.code ?? 'unknown' });
      }
      cursor = end + 1n;
    }
    totalScanned += scanned;
    totalInserted += inserted;
  }

  return NextResponse.json({
    scanned: totalScanned,
    inserted: totalInserted,
    safeTo: Number(safeTo),
  });
}
