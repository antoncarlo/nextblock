'use client';

import { useWaitForTransactionReceipt } from 'wagmi';

/**
 * What actually happened to a transaction.
 *
 * `useWaitForTransactionReceipt().isSuccess` means the receipt was *fetched*,
 * not that the transaction *worked*. A reverted transaction produces a receipt
 * like any other, so code branching on that flag reports success for a call
 * that changed nothing on-chain — which is exactly how a whitelist write that
 * reverted for a missing role showed a green "Whitelisted ✓" while the registry
 * still said `false`.
 *
 * The receipt carries the answer in `status`. This hook reads it and refuses to
 * conflate the two:
 *
 *   confirmed  the chain executed it and it succeeded
 *   reverted   the chain executed it and it failed — gas was spent, nothing changed
 *   pending    still waiting
 *
 * Any user-facing success message should be gated on `confirmed`. Nothing else
 * is evidence that the thing was done.
 */
export interface TxOutcome {
  /** Receipt says the transaction succeeded. The only safe basis for "done". */
  confirmed: boolean;
  /** Receipt says the transaction reverted. Gas was spent; state is unchanged. */
  reverted: boolean;
  /** Submitted and not yet mined. */
  pending: boolean;
  /** Block number of the receipt, when there is one. */
  blockNumber?: bigint;
}

export function useTxOutcome(hash: `0x${string}` | undefined): TxOutcome {
  const { data, isLoading } = useWaitForTransactionReceipt({ hash });

  return {
    confirmed: data?.status === 'success',
    reverted: data?.status === 'reverted',
    pending: Boolean(hash) && (isLoading || data === undefined),
    blockNumber: data?.blockNumber,
  };
}
