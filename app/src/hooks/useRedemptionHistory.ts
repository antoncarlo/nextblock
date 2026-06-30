'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SETTLEMENTS_QUERY,
  LP_HISTORY_QUERY,
  fetchGraphQL,
  parseRequests,
  parseSettlements,
  parseClaims,
  type RedemptionHistory,
  type EpochSettlementRow,
  type RedemptionRequestRow,
  type RedemptionClaimRow,
} from '@/lib/subgraph';

interface State extends RedemptionHistory {
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const EMPTY: RedemptionHistory = { requests: [], settlements: [], claims: [] };

/**
 * Reads the LP exit history from the Goldsky subgraph: recent epoch settlements
 * (protocol-wide) plus the connected wallet's own requests and claims. This is
 * the historical series the on-chain current-state reads cannot provide.
 */
export function useRedemptionHistory(lp?: `0x${string}`, count = 25): State {
  const [data, setData] = useState<RedemptionHistory>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const settledRes = await fetchGraphQL<{ epochSettleds: unknown[] }>(SETTLEMENTS_QUERY, { n: count });
      const settlements: EpochSettlementRow[] = parseSettlements(
        (settledRes.epochSettleds ?? []) as Parameters<typeof parseSettlements>[0],
      );

      let requests: RedemptionRequestRow[] = [];
      let claims: RedemptionClaimRow[] = [];
      if (lp) {
        const lpRes = await fetchGraphQL<{ redemptionRequesteds: unknown[]; redemptionClaimeds: unknown[] }>(
          LP_HISTORY_QUERY,
          { lp: lp.toLowerCase(), n: count }, // The Graph stores addresses lowercased
        );
        requests = parseRequests((lpRes.redemptionRequesteds ?? []) as Parameters<typeof parseRequests>[0]);
        claims = parseClaims((lpRes.redemptionClaimeds ?? []) as Parameters<typeof parseClaims>[0]);
      }
      setData({ requests, settlements, claims });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'subgraph error');
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [lp, count]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...data, loading, error, refetch: () => void load() };
}
