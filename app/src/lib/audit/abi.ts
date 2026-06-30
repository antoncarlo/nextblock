/**
 * Minimal event ABIs for the claim audit-trail indexer (sub-project 4).
 *
 * We don't import the full ClaimManager/ClaimReceipt ABIs here — a focused
 * event list keeps the server bundle slim and the decoder fast. The names and
 * argument shapes mirror contracts/src/ClaimManager.sol and ClaimReceipt.sol
 * one-to-one; any change there must be reflected here (and surfaced as a new
 * migration row, not an in-place edit, since the audit table is append-only).
 */

export const CLAIM_MANAGER_EVENT_ABI = [
  {
    type: 'event',
    name: 'ClaimSubmitted',
    inputs: [
      { name: 'claimId', type: 'uint256', indexed: true },
      { name: 'portfolioId', type: 'uint256', indexed: true },
      { name: 'vault', type: 'address', indexed: true },
      { name: 'claimant', type: 'address' },
      { name: 'requestedAmount', type: 'uint256' },
      { name: 'claimType', type: 'uint8' },
      { name: 'evidenceHash', type: 'bytes32' },
      { name: 'challengeDeadline', type: 'uint64' },
    ],
  },
  {
    type: 'event',
    name: 'ClaimAssessed',
    inputs: [
      { name: 'claimId', type: 'uint256', indexed: true },
      { name: 'recommendation', type: 'uint8' },
      { name: 'scoreBps', type: 'uint16' },
      { name: 'anomalyScoreBps', type: 'uint16' },
      { name: 'sourceHash', type: 'bytes32' },
    ],
  },
  {
    type: 'event',
    name: 'ClaimAnomalyFlagged',
    inputs: [
      { name: 'claimId', type: 'uint256', indexed: true },
      { name: 'anomalyScoreBps', type: 'uint16' },
    ],
  },
  {
    type: 'event',
    name: 'ClaimDisputed',
    inputs: [
      { name: 'claimId', type: 'uint256', indexed: true },
      { name: 'sentinel', type: 'address', indexed: true },
      { name: 'reason', type: 'string' },
    ],
  },
  {
    type: 'event',
    name: 'ClaimDisputeResolved',
    inputs: [
      { name: 'claimId', type: 'uint256', indexed: true },
      { name: 'committee', type: 'address', indexed: true },
      { name: 'upheld', type: 'bool' },
    ],
  },
  {
    type: 'event',
    name: 'ClaimFrozen',
    inputs: [
      { name: 'claimId', type: 'uint256', indexed: true },
      { name: 'sentinel', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'ClaimUnfrozen',
    inputs: [
      { name: 'claimId', type: 'uint256', indexed: true },
      { name: 'sentinel', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'ClaimApproved',
    inputs: [
      { name: 'claimId', type: 'uint256', indexed: true },
      { name: 'committee', type: 'address', indexed: true },
      { name: 'approvedAmount', type: 'uint256' },
      { name: 'receiptId', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'ClaimRejected',
    inputs: [
      { name: 'claimId', type: 'uint256', indexed: true },
      { name: 'committee', type: 'address', indexed: true },
      { name: 'reason', type: 'string' },
    ],
  },
  {
    type: 'event',
    name: 'ClaimPaid',
    inputs: [
      { name: 'claimId', type: 'uint256', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256' },
      { name: 'receiptId', type: 'uint256' },
    ],
  },
] as const;

/**
 * ClaimReceipt events. The receipt is minted *for* a claim approval, so when
 * we decode these we map back to the originating claim via the `receiptId`
 * carried in the corresponding ClaimApproved/ClaimPaid log (joined later in
 * the decoder, not here at the ABI layer).
 */
export const CLAIM_RECEIPT_EVENT_ABI = [
  {
    type: 'event',
    name: 'ReceiptMinted',
    inputs: [
      { name: 'receiptId', type: 'uint256', indexed: true },
      { name: 'insurer', type: 'address', indexed: true },
      { name: 'policyId', type: 'uint256' },
      { name: 'claimAmount', type: 'uint256' },
      { name: 'vault', type: 'address' },
    ],
  },
  {
    type: 'event',
    name: 'ReceiptExercised',
    inputs: [{ name: 'receiptId', type: 'uint256', indexed: true }],
  },
] as const;
