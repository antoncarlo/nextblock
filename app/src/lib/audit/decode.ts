/**
 * Claim audit-trail decoder (Claims Control Room sub-project 4).
 *
 * Pure / framework-free: no React, no wagmi, no Supabase imports — runs under
 * the Node strip-types smoke loader. Takes a raw viem `Log` plus the event
 * ABIs declared in ./abi.ts and produces a normalized `AuditRecord` ready for
 * append-only insertion into `claim_audit_trail`.
 *
 * Conventions:
 *  - addresses lowercased
 *  - bigint args serialized as decimal strings (Postgres jsonb can't carry bigint)
 *  - bytes32 args kept as 0x… lowercased
 *  - the row's `claim_id` is taken from `args.claimId` when present; for
 *    receipt events (which only carry receiptId) we fall back to the caller
 *    supplying a receiptId→claimId map. Receipt events without a known link
 *    are skipped (returns null) so the audit trail never invents associations.
 */

import { decodeEventLog, type AbiEvent, type Log } from 'viem';
import { CLAIM_MANAGER_EVENT_ABI, CLAIM_RECEIPT_EVENT_ABI } from './abi.ts';

export type ContractKind = 'claimManager' | 'claimReceipt';

export interface AuditRecord {
  claimId: bigint;
  eventName: string;
  blockNumber: bigint;
  logIndex: number;
  txHash: `0x${string}`;
  contractAddr: `0x${string}`;
  actor: `0x${string}` | null;
  data: Record<string, unknown>;
}

const CLAIM_MANAGER_BY_NAME = Object.fromEntries(
  CLAIM_MANAGER_EVENT_ABI.map((e) => [e.name, e as AbiEvent]),
);
const CLAIM_RECEIPT_BY_NAME = Object.fromEntries(
  CLAIM_RECEIPT_EVENT_ABI.map((e) => [e.name, e as AbiEvent]),
);

/**
 * Decode a raw log emitted by ClaimManager.
 *
 * Returns null when:
 *  - the log topic does not match any tracked event (unknown / new event)
 *  - the log is missing required block/tx context (mempool snapshots etc.)
 */
export function decodeClaimManagerLog(log: Log): AuditRecord | null {
  if (log.blockNumber === null || log.transactionHash === null || log.logIndex === null) {
    return null;
  }
  let decoded: { eventName: string; args: Record<string, unknown> };
  try {
    decoded = decodeEventLog({
      abi: CLAIM_MANAGER_EVENT_ABI,
      data: log.data,
      topics: log.topics,
    }) as typeof decoded;
  } catch {
    return null;
  }
  if (!CLAIM_MANAGER_BY_NAME[decoded.eventName]) return null;

  const args = decoded.args;
  const claimIdRaw = args.claimId;
  if (typeof claimIdRaw !== 'bigint') return null;

  const actor = pickActor(decoded.eventName, args);

  return {
    claimId: claimIdRaw,
    eventName: decoded.eventName,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    txHash: log.transactionHash.toLowerCase() as `0x${string}`,
    contractAddr: log.address.toLowerCase() as `0x${string}`,
    actor,
    data: serializeArgs(args),
  };
}

/**
 * Decode a raw log emitted by ClaimReceipt.
 *
 * Receipt events carry `receiptId` but not `claimId`. The caller must pass a
 * lookup that maps receiptId→claimId (derived from prior ClaimApproved /
 * ClaimPaid rows). When the link is unknown, returns null — we never invent
 * a claim association.
 */
export function decodeClaimReceiptLog(
  log: Log,
  receiptToClaim: (receiptId: bigint) => bigint | null,
): AuditRecord | null {
  if (log.blockNumber === null || log.transactionHash === null || log.logIndex === null) {
    return null;
  }
  let decoded: { eventName: string; args: Record<string, unknown> };
  try {
    decoded = decodeEventLog({
      abi: CLAIM_RECEIPT_EVENT_ABI,
      data: log.data,
      topics: log.topics,
    }) as typeof decoded;
  } catch {
    return null;
  }
  if (!CLAIM_RECEIPT_BY_NAME[decoded.eventName]) return null;

  const args = decoded.args;
  const receiptIdRaw = args.receiptId;
  if (typeof receiptIdRaw !== 'bigint') return null;
  const linked = receiptToClaim(receiptIdRaw);
  if (linked === null) return null;

  const actor =
    typeof args.insurer === 'string' ? (args.insurer.toLowerCase() as `0x${string}`) : null;

  return {
    claimId: linked,
    eventName: `Receipt${decoded.eventName.replace(/^Receipt/, '')}`, // keep names disjoint, e.g. ReceiptMinted vs ClaimSubmitted
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    txHash: log.transactionHash.toLowerCase() as `0x${string}`,
    contractAddr: log.address.toLowerCase() as `0x${string}`,
    actor,
    data: serializeArgs(args),
  };
}

/**
 * Choose the "actor" address surfaced in the audit row.
 *
 * The strongest semantic actor for each event is the indexed party that
 * triggered the transition (sentinel, committee, recipient). When the event
 * names the claimant only, we surface that; otherwise null and the indexer
 * can fall back to the on-chain `tx.from` if it wants to (out of scope for
 * the pure decoder).
 */
function pickActor(eventName: string, args: Record<string, unknown>): `0x${string}` | null {
  const order = ['sentinel', 'committee', 'to', 'claimant', 'vault'];
  for (const k of order) {
    const v = args[k];
    if (typeof v === 'string' && v.startsWith('0x')) {
      return v.toLowerCase() as `0x${string}`;
    }
  }
  if (eventName === 'ClaimSubmitted') {
    const c = args.claimant;
    if (typeof c === 'string') return c.toLowerCase() as `0x${string}`;
  }
  return null;
}

/**
 * Convert decoded event args into a jsonb-safe record:
 *  - bigint → decimal string (Postgres jsonb can't carry bigint)
 *  - addresses lowercased
 *  - everything else preserved as-is
 */
function serializeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'bigint') out[k] = v.toString();
    else if (typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v)) out[k] = v.toLowerCase();
    else out[k] = v;
  }
  return out;
}

/** Build a receiptId→claimId lookup from a set of already-known ClaimApproved / ClaimPaid rows. */
export function buildReceiptLink(
  rows: ReadonlyArray<{ receiptId: bigint; claimId: bigint }>,
): (receiptId: bigint) => bigint | null {
  const map = new Map<string, bigint>();
  for (const r of rows) map.set(r.receiptId.toString(), r.claimId);
  return (receiptId: bigint) => map.get(receiptId.toString()) ?? null;
}
