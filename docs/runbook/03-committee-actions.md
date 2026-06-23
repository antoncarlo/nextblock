# Claims Committee — operational runbook

The Committee is the **decision** role on claims: approves, rejects, resolves Sentinel disputes. The Committee **does not** pause vaults, freeze addresses, or grant roles — those are Sentinel / Owner actions.

On-chain role: `CLAIMS_COMMITTEE_ROLE` on `ProtocolRoles`. Typically a multisig 3-of-5 (pilot may run smaller).

---

## 1. Approve a claim (non-parametric path)

**Pre-conditions** (all checked on-chain by `ClaimManager.approveClaim`):

- `claim.status == ASSESSED` (the AI assessor must have published; `attachAssessment` must have flipped the status)
- `block.timestamp > claim.challengeDeadline` (the dispute window has expired)
- `claim.frozen == false` (no Sentinel anomaly-freeze in place)
- `approvedAmount <= claim.requestedAmount` (no reaching beyond what was requested)

**Procedure**:

1. Open `/app/claims`, expand the row, read the audit trail + evidence + AI assessment.
2. Confirm with at least the M of N required signers off-chain (Slack, signal, in-person — out-of-band).
3. From the Committee Safe, call `ClaimManager.approveClaim(claimId, approvedAmount)`.
4. After the approve mines, anyone may call `ClaimManager.executeClaim(claimId)` to settle. In practice the Committee or the cedant ops calls it.

**Verify**:
- `ClaimApproved(claimId, committee, approvedAmount, receiptId)` event
- `ClaimReceipt.ReceiptMinted` event with `receiptId` matching
- `claim.status == APPROVED`
- After `executeClaim`: `ClaimPaid(claimId, to, amount, receiptId)` + USDC balance moved + `claim.status == PAID`
- Audit trail at `/app/claims` expanded row shows the full chain within ~5 min

---

## 2. Reject a claim

**Pre-conditions**: same as approve, except no `approvedAmount` check (rejection always pays zero).

**Procedure**:

1. Same diligence as approve — read every artifact, confirm with co-signers.
2. From the Committee Safe, call `ClaimManager.rejectClaim(claimId, reason)`. Reason is short free-text logged on-chain.

**Verify**:
- `ClaimRejected(claimId, committee, reason)` event
- `claim.status == REJECTED` (terminal — no further transitions)
- The claimant sees the rejection in `/app/claims` + receives the in-app notification (and email if they opted in)

---

## 3. Resolve a Sentinel dispute

**Trigger**: the Sentinel called `disputeClaim(claimId, reason)` — the claim is in `DISPUTED` status, blocking approve.

**Procedure**:

1. Review:
   - Sentinel's reason (visible in `ClaimDisputed` event + `claim_audit_trail`)
   - All evidence + AI assessment
   - Off-chain investigation notes (legal, compliance, fraud analytics — whatever was triggered)
2. Decide:
   - **Uphold the Sentinel's challenge** → call `ClaimManager.resolveDispute(claimId, true)`. This rejects the claim outright; status flips to `REJECTED`, no payout, terminal.
   - **Overrule the challenge** → call `ClaimManager.resolveDispute(claimId, false)`. Status flips back to `ASSESSED` and the dispute window restarts, after which the Committee may approve or reject as normal.

**Verify**:
- `ClaimDisputeResolved(claimId, committee, upheld)` event with the expected bool
- Subsequent status matches the decision (REJECTED or ASSESSED)

---

## 4. Approving a parametric claim

Parametric claims (`claim.claimType == PARAMETRIC`) bypass the dispute window when the on-chain trigger is verifiable (`triggerThreshold` met on a registered oracle). They can be approved from `SUBMITTED` or `ASSESSED` — no `block.timestamp` check.

**Procedure**:

1. Verify the on-chain trigger fired (oracle event, parametric data committed via `BordereauOracle` if relevant).
2. From the Committee Safe, call `ClaimManager.approveClaim(claimId, approvedAmount)` — same call as non-parametric, the contract recognizes the type.
3. `executeClaim` as usual.

**Verify**: same events as the non-parametric path, just faster.

---

## 5. Edge cases

- **Frozen claim**: `claim.frozen=true` blocks approve. Coordinate with Sentinel — only the Sentinel can call `unfreezeClaim`.
- **Receipt already exercised**: `executeClaim` checks `ClaimReceipt.markExercised` to prevent double payout. If you see `ReceiptAlreadyExercised`, the claim has already been paid; nothing to do.
- **Vault insolvent**: `executeClaim` reverts if the vault's available buffer + portfolio reserve < approvedAmount. Coordinate with Curator on whether to reduce `approvedAmount` (re-approve required) or pause the portfolio until liquidity restores.
