'use client';

/**
 * RETIRED (Phase 9.5 security hardening).
 *
 * The legacy vault claim triggers (checkClaim / reportEvent / submitClaim /
 * exerciseClaim) were REMOVED from InsuranceVault: claims now flow exclusively
 * through the institutional ClaimManager lifecycle (cedant submission ->
 * AI advisory assessment -> mandatory dispute window -> Claims Committee
 * approval -> vault payout). These hooks are kept as inert stubs so legacy
 * admin components can render an explicit "removed" state instead of
 * silently failing. They never send transactions.
 */

export interface RetiredAction {
  /** Always present: explains why the action is unavailable. */
  retiredReason: string;
  isPending: false;
  isConfirming: false;
  isConfirmed: false;
  error: null;
  txHash: undefined;
}

const RETIRED: RetiredAction = {
  retiredReason:
    'Removed in Phase 9.5: legacy vault claim triggers no longer exist on-chain. Use the ClaimManager lifecycle.',
  isPending: false,
  isConfirming: false,
  isConfirmed: false,
  error: null,
  txHash: undefined,
};

export function useCheckClaim() {
  return { ...RETIRED, check: (_vault: `0x${string}`, _policyId: bigint) => {} };
}

export function useReportEvent() {
  return { ...RETIRED, report: (_vault: `0x${string}`, _policyId: bigint) => {} };
}

export function useSubmitClaim() {
  return { ...RETIRED, submit: (_vault: `0x${string}`, _policyId: bigint, _amount: bigint) => {} };
}

export function useExerciseClaim() {
  return { ...RETIRED, exercise: (_vault: `0x${string}`, _receiptId: bigint) => {} };
}
