/**
 * Protocol-subgraph client — GraphQL POST with indexing-freshness metadata.
 *
 * Every query in queries.ts embeds `_meta { block { number timestamp }
 * hasIndexingErrors }`, so each response carries WHEN the indexer last
 * wrote a block. `evaluateStaleness` turns that into an explicit verdict the
 * UI must surface (DataSourceBadge / staleness notice) instead of showing
 * indexed history as if it were live state.
 *
 * Endpoint: NEXT_PUBLIC_PROTOCOL_SUBGRAPH_URL. Deliberately NO default and
 * fail-closed — until the nextblock-protocol subgraph is deployed, callers
 * get `null` and must render "indexer not deployed", never substitute data.
 * (The legacy no-code redemption endpoint in lib/subgraph.ts has a different
 * schema; pointing this client at it would only produce GraphQL errors.)
 */

export interface IndexerMeta {
  blockNumber: number;
  blockTimestamp: number;
  hasIndexingErrors: boolean;
}

export interface Staleness {
  ageSeconds: number;
  stale: boolean;
}

export interface SubgraphResult<T> {
  data: T;
  meta: IndexerMeta;
}

interface RawMeta {
  block: { number: number; timestamp: number };
  hasIndexingErrors: boolean;
}

/** Default freshness budget: Base Sepolia blocks land every ~2s; ten minutes
 *  behind means the indexer is not keeping up or the endpoint is wrong. */
export const DEFAULT_MAX_AGE_SECONDS = 600;

export function getProtocolSubgraphUrl(): string | null {
  const env = process.env.NEXT_PUBLIC_PROTOCOL_SUBGRAPH_URL;
  return env && env.length > 0 ? env : null;
}

/** Pure staleness verdict — testable without a network. */
export function evaluateStaleness(
  meta: IndexerMeta,
  nowSeconds: number,
  maxAgeSeconds: number = DEFAULT_MAX_AGE_SECONDS,
): Staleness {
  const ageSeconds = Math.max(0, nowSeconds - meta.blockTimestamp);
  return { ageSeconds, stale: ageSeconds > maxAgeSeconds || meta.hasIndexingErrors };
}

export function parseMeta(raw: RawMeta | null | undefined): IndexerMeta {
  if (raw == null) {
    // A response without _meta cannot prove freshness: treat as maximally
    // stale rather than silently fresh.
    return { blockNumber: 0, blockTimestamp: 0, hasIndexingErrors: true };
  }
  return {
    blockNumber: raw.block.number,
    blockTimestamp: raw.block.timestamp,
    hasIndexingErrors: raw.hasIndexingErrors,
  };
}

/**
 * GraphQL POST returning data + indexer meta. Throws on transport or GraphQL
 * errors, and when the endpoint is not configured — callers that want a soft
 * state check `getProtocolSubgraphUrl()` first.
 */
export async function queryProtocolSubgraph<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<SubgraphResult<T>> {
  const url = getProtocolSubgraphUrl();
  if (url == null) {
    throw new Error('protocol subgraph endpoint not configured (NEXT_PUBLIC_PROTOCOL_SUBGRAPH_URL)');
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`protocol subgraph HTTP ${res.status}`);
  const json = (await res.json()) as {
    data?: T & { _meta?: RawMeta };
    errors?: { message: string }[];
  };
  if (json.errors && json.errors.length > 0) throw new Error(json.errors[0].message);
  if (!json.data) throw new Error('protocol subgraph: empty response');
  return { data: json.data, meta: parseMeta(json.data._meta) };
}
