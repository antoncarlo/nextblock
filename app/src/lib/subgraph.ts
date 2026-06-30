/**
 * RedemptionQueue subgraph client (Goldsky) — pure query builders + parsers for
 * the LP exit history. Framework-free: the React hook wraps `fetchGraphQL`, but
 * the query strings and the raw→typed parsers are pure and smoke-tested.
 *
 * The no-code Goldsky subgraph exposes one entity per event with these fields
 * (note the trailing-underscore meta fields and lowercased addresses):
 *   redemptionRequesteds { epochId lp shares block_number timestamp_ transactionHash_ }
 *   epochSettleds        { epochId settledShares settledAssets ratioBps block_number timestamp_ transactionHash_ }
 *   redemptionClaimeds   { epochId lp assetsPaid sharesReturned block_number timestamp_ transactionHash_ }
 */

const DEFAULT_SUBGRAPH_URL =
  'https://api.goldsky.com/api/public/project_cmr0s8ubc36xl01xl6o3m00gp/subgraphs/NEXTBLOCK/1.0.0/gn';

/** Live subgraph endpoint; overridable via env for re-deploys. */
export function getSubgraphUrl(): string {
  const env = process.env.NEXT_PUBLIC_SUBGRAPH_URL;
  return env && env.length > 0 ? env : DEFAULT_SUBGRAPH_URL;
}

// --- Raw shapes (GraphQL returns numerics as strings) ---
interface RawRequest {
  epochId: string;
  lp: string;
  shares: string;
  timestamp_: string;
  transactionHash_: string;
}
interface RawSettlement {
  epochId: string;
  settledShares: string;
  settledAssets: string;
  ratioBps: string;
  timestamp_: string;
  transactionHash_: string;
}
interface RawClaim {
  epochId: string;
  lp: string;
  assetsPaid: string;
  sharesReturned: string;
  timestamp_: string;
  transactionHash_: string;
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

// --- Queries (ordered by block desc; lp filter optional) ---
export const SETTLEMENTS_QUERY = `query Settlements($n: Int!) {
  epochSettleds(first: $n, orderBy: block_number, orderDirection: desc) {
    epochId settledShares settledAssets ratioBps timestamp_ transactionHash_
  }
}`;

export const LP_HISTORY_QUERY = `query LpHistory($lp: String!, $n: Int!) {
  redemptionRequesteds(first: $n, orderBy: block_number, orderDirection: desc, where: { lp: $lp }) {
    epochId lp shares timestamp_ transactionHash_
  }
  redemptionClaimeds(first: $n, orderBy: block_number, orderDirection: desc, where: { lp: $lp }) {
    epochId lp assetsPaid sharesReturned timestamp_ transactionHash_
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
    epochId: n(r.epochId),
    lp: r.lp,
    shares: n(r.shares),
    timestamp: Number(r.timestamp_),
    txHash: r.transactionHash_,
  }));
}
export function parseSettlements(rows: RawSettlement[]): EpochSettlementRow[] {
  return rows.map((r) => ({
    epochId: n(r.epochId),
    settledShares: n(r.settledShares),
    settledAssets: n(r.settledAssets),
    ratioBps: Number(r.ratioBps),
    timestamp: Number(r.timestamp_),
    txHash: r.transactionHash_,
  }));
}
export function parseClaims(rows: RawClaim[]): RedemptionClaimRow[] {
  return rows.map((r) => ({
    epochId: n(r.epochId),
    lp: r.lp,
    assetsPaid: n(r.assetsPaid),
    sharesReturned: n(r.sharesReturned),
    timestamp: Number(r.timestamp_),
    txHash: r.transactionHash_,
  }));
}

/** Minimal GraphQL POST. Throws on network/GraphQL error. */
export async function fetchGraphQL<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(getSubgraphUrl(), {
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
