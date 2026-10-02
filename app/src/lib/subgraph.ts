/**
 * RedemptionQueue history client — pure query builders + parsers for the LP exit
 * history, read from the protocol subgraph (the same endpoint as the rest of the
 * protocol history, NEXT_PUBLIC_PROTOCOL_SUBGRAPH_URL). Framework-free: the React
 * hook wraps `fetchGraphQL`, but the query strings and the raw-to-typed parsers
 * are pure.
 *
 * The protocol subgraph exposes the queue as typed entities (see
 * indexer/schema.graphql): `epoches`, `redemptionRequests`, `redemptionClaims`.
 * There is no default endpoint: with none configured there is no history to show,
 * which is better than showing the history of a different deployment.
 */

import { getProtocolSubgraphUrl } from './protocol-subgraph/client.ts';

/** The configured endpoint, or null when no subgraph is configured. */
export function getSubgraphUrl(): string | null {
  return getProtocolSubgraphUrl();
}

// --- Raw shapes (GraphQL returns numerics as strings) ---
interface RawRequest {
  epoch: { epochId: string };
  lp: { id: string };
  shares: string;
  timestamp: string;
  txHash: string;
}
interface RawSettlement {
  epochId: string;
  settledShares: string;
  settledAssets: string;
  ratioBps: string;
  settledAt: string | null;
}
interface RawClaim {
  epoch: { epochId: string };
  lp: { id: string };
  assetsPaid: string;
  sharesReturned: string;
  timestamp: string;
  txHash: string;
}

// --- Typed shapes ---
export interface RedemptionRequestRow {
  epochId: bigint;
  lp: string;
  shares: bigint;
  timestamp: number;
  txHash: string;
}
export interface EpochSettlementRow {
  epochId: bigint;
  settledShares: bigint;
  settledAssets: bigint;
  ratioBps: number;
  timestamp: number;
  txHash: string;
}
export interface RedemptionClaimRow {
  epochId: bigint;
  lp: string;
  assetsPaid: bigint;
  sharesReturned: bigint;
  timestamp: number;
  txHash: string;
}

export interface RedemptionHistory {
  requests: RedemptionRequestRow[];
  settlements: EpochSettlementRow[];
  claims: RedemptionClaimRow[];
}

// --- Queries (newest first; lp filter optional) ---
export const SETTLEMENTS_QUERY = `query Settlements($n: Int!) {
  epoches(first: $n, where: { settled: true }, orderBy: settledAt, orderDirection: desc) {
    epochId settledShares settledAssets ratioBps settledAt
  }
}`;

export const LP_HISTORY_QUERY = `query LpHistory($lp: String!, $n: Int!) {
  redemptionRequests(first: $n, orderBy: blockNumber, orderDirection: desc, where: { lp: $lp }) {
    epoch { epochId } lp { id } shares timestamp txHash
  }
  redemptionClaims(first: $n, orderBy: blockNumber, orderDirection: desc, where: { lp: $lp }) {
    epoch { epochId } lp { id } assetsPaid sharesReturned timestamp txHash
  }
}`;

// --- Pure parsers ---
function n(s: string): bigint {
  try {
    return BigInt(s);
  } catch {
    return 0n;
  }
}

export function parseRequests(rows: RawRequest[]): RedemptionRequestRow[] {
  return rows.map((r) => ({
    epochId: n(r.epoch.epochId),
    lp: r.lp.id,
    shares: n(r.shares),
    timestamp: Number(r.timestamp),
    txHash: r.txHash,
  }));
}
export function parseSettlements(rows: RawSettlement[]): EpochSettlementRow[] {
  return rows.map((r) => ({
    epochId: n(r.epochId),
    settledShares: n(r.settledShares),
    settledAssets: n(r.settledAssets),
    ratioBps: Number(r.ratioBps),
    timestamp: Number(r.settledAt ?? 0),
    // The epoch entity does not carry the settling transaction; the epoch id is the key.
    txHash: '',
  }));
}
export function parseClaims(rows: RawClaim[]): RedemptionClaimRow[] {
  return rows.map((r) => ({
    epochId: n(r.epoch.epochId),
    lp: r.lp.id,
    assetsPaid: n(r.assetsPaid),
    sharesReturned: n(r.sharesReturned),
    timestamp: Number(r.timestamp),
    txHash: r.txHash,
  }));
}

/** Minimal GraphQL POST. Throws on network/GraphQL error. */
export async function fetchGraphQL<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const url = getSubgraphUrl();
  if (!url) throw new Error('subgraph not configured');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`subgraph HTTP ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors && json.errors.length > 0) throw new Error(json.errors[0].message);
  if (!json.data) throw new Error('subgraph: empty response');
  return json.data;
}
