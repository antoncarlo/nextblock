# Sentinel — operational runbook

The Sentinel is the **risk-reduction** role: pauses, freezes, disputes. The Sentinel **never** moves user funds, mints anything, or approves payouts — those are Committee / Curator / Owner acts.

On-chain role: `SENTINEL_ROLE` on `ProtocolRoles`.

---

## 1. Resolve a pending sanctions match

**Trigger**: a row appears in `/app/admin/sanctions` with `status='pending_sentinel'`. The KYB approve that triggered it is **blocked at 422** until you decide.

**Procedure**:

1. Open `/app/admin/sanctions`, sign and load the queue.
2. For each row, read the evidence panel (sanctions list, severity, match score, provider evidence).
3. Decide:
   - **False positive** (clear): click "False positive", add a one-line note explaining why (e.g. "different jurisdiction, name-match only").
   - **True match**: click "True match → block", add a note (e.g. "OFAC SDN N° 14852, confirmed against client data").

   The on-chain action follows the decision:
4. **If true match** → fire `ComplianceRegistry.setBlocked(wallet, true)` from the Sentinel Safe.
5. **If false positive** → after the UI confirms the resolution, instruct the KYC Operator (or yourself if you hold the role) to call `ComplianceRegistry.setWhitelist(wallet, true)` and re-run the KYB approve so the application transitions out of `under_review`.

**Verify**:
- The row drops from the pending queue on success
- `sanctions_matches.status` flips to `false_positive` or `true_match` (visible at refetch)
- The on-chain `setBlocked` / `setWhitelist` tx appears in the audit trail at `/app/claims` (event surface) or via Basescan

---

## 2. Dispute a claim

**Trigger**: a claim is in `ASSESSED` status with an anomaly score, conflicting evidence, or off-chain intel suggesting fraud.

**Procedure**:

1. Open `/app/claims`, expand the row.
2. Review the audit trail (immutable on-chain log mirror) — confirm `ClaimSubmitted`, `ClaimAssessed`, evidence hashes.
3. Open the evidence panel and download every file. Compute keccak256 locally and compare to the on-chain `evidenceHash` — if mismatched, the dispute reason includes "evidence hash divergence".
4. From the Sentinel Safe, call `ClaimManager.disputeClaim(claimId, reason)` — reason is a short free-text logged on-chain in `ClaimDisputed`.
5. The Committee takes over from there (see `03-committee-actions.md`).

**Verify**:
- `ClaimDisputed(claimId, sentinel, reason)` event fires
- Claim status flips to `DISPUTED` (visible in `/app/claims`)
- Audit-trail row appears in `claim_audit_trail` within ~5 min (next cron tick)

---

## 3. Freeze a wallet (block transfers)

**Trigger**: incident response (hack, fraud, regulator instruction), or sanctions screening result you've already triaged as true match.

**Procedure**:

1. Open `/app/admin/sanctions` or `/app/admin/system-status` to confirm the wallet is the right target.
2. From the Sentinel Safe, call `ComplianceRegistry.setBlocked(address, true)`.
3. Verify the block: try a transfer simulation in `cast call --trace` or trigger a small TX from the affected wallet (should revert at the `ComplianceRegistry.requireCanReceive` check).
4. Document the action in the incident log (`docs/runbook/incident-log.md` if it exists, otherwise an ops ticket).

**Reversal**: `ComplianceRegistry.setBlocked(address, false)` from the same Safe. Always preceded by written authorization (legal, compliance officer, board) — see `04-incident-response.md`.

**Verify**:
- `BlockedStatusUpdated(address, true)` event
- `compliance.blocked(address)` returns `true` via `cast call`
- Subsequent transfers from/to the address revert

---

## 4. Anomaly-flagged claim (auto-frozen)

**Trigger**: `ClaimManager.attachAssessment` discovered the AI assessor reported an anomaly score above the configured threshold; the claim was auto-frozen.

**Procedure**:

1. The claim status is `ASSESSED` and `frozen=true`.
2. **Investigate before unfreezing**: review the AI assessor's evidence (raw_response in `ai_assessments_pending`), claimant evidence, on-chain history.
3. Decide:
   - If the anomaly is a real concern → leave frozen, escalate to Committee + legal.
   - If the anomaly is a false alarm → call `ClaimManager.unfreezeClaim(claimId)` from the Sentinel Safe.
4. Document in the incident log either way.

**Verify**:
- `ClaimUnfrozen(claimId, sentinel)` event when unfreezing
- `claim.frozen` returns `false` via `cast call`
- The Committee can now approve / reject as normal

---

## 5. Pause a portfolio

**Trigger**: a portfolio is leaking premium, has a structural defect, or the Cedant breached terms.

**Procedure**:

1. Confirm the portfolio id and the rationale in writing.
2. From the Sentinel Safe, call `PortfolioRegistry.pausePortfolio(portfolioId)`.
3. New claim submissions against the portfolio will be limited (status check in `ClaimManager.submitClaim`).
4. Existing claims continue through their lifecycle — pausing doesn't retroactively block them.

**Reversal**: `PortfolioRegistry.unpausePortfolio(portfolioId)` once the issue is resolved + Curator agrees.

**Verify**:
- `PortfolioPaused(portfolioId)` event
- `portfolio.status` returns `PAUSED` via `cast call`
- New submitClaim attempts revert with `ClaimManager__PortfolioNotActive` (or equivalent) at the submission gate
