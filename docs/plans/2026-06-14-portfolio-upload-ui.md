# Plan: Portfolio Upload UI (asset manager / cedant) — staging

- **Date:** 2026-06-14
- **Base:** main `855359c`
- **Status:** PLAN ONLY — not implemented. Closes pilot-readiness finding PR-2.
- **Scope:** frontend-only. No contracts/address-book/deployments/governance changes.

## Goal

Give asset managers/curators and cedants a real on-chain UI to run the
institutional **portfolio onboarding lifecycle** of `PortfolioRegistry` from the
app on Base Sepolia staging — so portfolios can be uploaded and progressed over
time, beyond the legacy per-policy path. Real wagmi writes, no mocks, following
the existing claim-lifecycle conventions.

## Current gaps (verified)

- No frontend exposes `submitPortfolio` / `updateMetadata` / `startReview` /
  `approvePortfolio` / `rejectPortfolio` / `activatePortfolio` (grep: only a
  legacy reference in `app/src/components/vault/PolicyRow.tsx`).
- `manage` page uses the legacy per-policy path (registerPolicy/addPolicy/
  depositPremium), not the portfolio path.
- Allocation (`InsuranceVault.allocateToPortfolio` via the VaultAllocator
  proposal lifecycle) and `recordPortfolioPremium` also have no UI.

## Available building blocks (no blockers)

- Contract API (`contracts/src/PortfolioRegistry.sol`):
  - `submitPortfolio(SubmissionParams)` — AUTHORIZED_CEDANT_ROLE
  - `updateMetadata(id, metadataURI, documentHash)` — cedant (own, SUBMITTED/UNDER_REVIEW)
  - `startReview(id)` / `approvePortfolio(id, expectedLossBps)` /
    `rejectPortfolio(id, reason)` / `activatePortfolio(id)` — UNDERWRITING_CURATOR_ROLE
  - `pausePortfolio` / `unpausePortfolio` — SENTINEL_ROLE; `markExpired` — permissionless
  - Views: `getPortfolio(id)`, `getPortfolioCount()`, `getPortfoliosByCedant(addr)`,
    `isAllocatable(id)`
  - Enums: `StructureType {QUOTA_SHARE, XOL, SURPLUS, PARAMETRIC, OTHER}`,
    `PortfolioStatus {SUBMITTED, UNDER_REVIEW, APPROVED, ACTIVE, PAUSED, EXPIRED, REJECTED}`
  - `SubmissionParams {name, metadataURI, documentHash, lineOfBusiness, jurisdiction,
    structureType, coverageLimit(6dp), cededPremium(6dp), inceptionTime, expiryTime}`
- Lens reads: `getPortfolioStatus(portfolioId, vault)`, `rawPortfolioExposure`.
- Frontend config: `PORTFOLIO_REGISTRY_ABI` and `VAULT_ALLOCATOR_ABI` already in
  `app/src/config/contracts.ts`; `useAddresses()` already exposes
  `portfolioRegistry`, `vaultAllocator`, `premiumDistributor` for 84532
  (mapped from the generated address book). **No ABI/address/config blocker.**
- Conventions to mirror: `useClaimActions.ts` (write + chain guard + tx states),
  `useClaimLifecycle.ts` (read model + enums/labels), `ClaimLifecyclePanel.tsx`
  (role-aware panel + states), `useProtocolAccess` (`isCedant`, `isCurator`).

## Proposed UX

Role-aware `PortfolioPanel` mirroring `ClaimLifecyclePanel`:

- **Cedant** (`isCedant`): "Submit portfolio" form (name, line of business,
  jurisdiction, structure type select, coverage limit USDC, ceded premium USDC,
  inception date, expiry date, optional metadata URI + evidence reference hashed
  client-side to `documentHash`). Plus a list of the cedant's own portfolios
  (`getPortfoliosByCedant(address)`) with status badges; "update metadata" while
  SUBMITTED/UNDER_REVIEW.
- **Curator** (`isCurator`): review queue over all portfolios — `startReview`
  (SUBMITTED→UNDER_REVIEW), `approvePortfolio` (with expectedLossBps input,
  UNDER_REVIEW→APPROVED), `rejectPortfolio` (reason), `activatePortfolio`
  (APPROVED→ACTIVE).
- **Read/list:** status badge per `PortfolioStatus`; coverage/premium/dates;
  `isAllocatable` flag. Enumerate via `getPortfolioCount` + batched
  `getPortfolio(0..n-1)` (bounded by staging scale; same batch pattern as
  `useAllClaims`).
- **States:** disconnected, wrong-chain (84532 guard, no tx), missing-role (no
  action buttons), pending, confirming, reverted (error line), success, empty.

## Contract methods involved

Writes: `PortfolioRegistry.submitPortfolio`, `updateMetadata`, `startReview`,
`approvePortfolio`, `rejectPortfolio`, `activatePortfolio`. Reads:
`getPortfolio`, `getPortfolioCount`, `getPortfoliosByCedant`, `isAllocatable`,
Lens `getPortfolioStatus`.

Out of scope for this MVP (see Non-goals): `pausePortfolio`/`unpausePortfolio`
(sentinel), `allocateToPortfolio` (needs VaultAllocator propose→execute
lifecycle), `recordPortfolioPremium`.

## Role requirements

- Submit / update metadata: AUTHORIZED_CEDANT_ROLE (+ ownership of the portfolio
  for updates).
- Review / approve / reject / activate: UNDERWRITING_CURATOR_ROLE.
- Roles are granted manually by the operator today (pilot-readiness PR-3); this
  UI assumes the role is already granted and surfaces a clear "missing role"
  state otherwise.

## Validation rules (client-side, mirrors contract reverts)

- name, lineOfBusiness, jurisdiction: non-empty (contract reverts on empty core
  params via `InvalidParams`).
- coverageLimit > 0, cededPremium > 0 (USDC, `parseUnits(value, 6)`).
- expiryTime > inceptionTime; both unix seconds from date inputs.
- structureType in enum range; expectedLossBps in [0, 10000] on approve.
- documentHash: `keccak256(stringToHex(reference))` if a reference is provided,
  else `bytes32(0)` only where the contract allows (submission requires non-empty
  core params; document the contract's exact requirement at implementation time
  by reading `submitPortfolio` body).

## Off-chain storage decision

MVP is **on-chain/manual-form only**. `metadataURI` is an optional free-text
IPFS/document pointer; `documentHash` is a client-side keccak256 of an evidence
reference (same pattern as claim evidence). No file-upload bucket in this PR
(matches the deferred claim-evidence item PR-5). A private document bucket is a
separate future scope.

## File-by-file implementation plan (future PR `feat/portfolio-upload-ui`)

Create:
- `app/src/hooks/usePortfolioRegistry.ts` — read model: `StructureType`/
  `PortfolioStatus` enum mirrors + labels/colors; `usePortfolioCount`;
  `useAllPortfolios` (batched `getPortfolio`); `useCedantPortfolios(address)`
  (`getPortfoliosByCedant`). Pattern: `usePolicyRegistry.ts` + `useClaimLifecycle.ts`.
- `app/src/hooks/usePortfolioActions.ts` — write model: one `useWriteContract`
  dispatcher with 84532 chain guard + tx states; helpers submit/updateMetadata/
  startReview/approve/reject/activate. Pattern: `useClaimActions.ts` (incl. the
  localized `Parameters<typeof writeContract>[0]` cast for the generic dispatcher).
- `app/src/components/portfolio/PortfolioPanel.tsx` — role-aware panel (cedant
  submit + own list; curator review queue). Pattern: `ClaimLifecyclePanel.tsx`,
  `DataSourceBadge`.

Modify (wiring only):
- `app/src/app/app/my-company/page.tsx` — mount `<PortfolioPanel/>` (cedant
  submit + tracking), next to the existing `ClaimLifecyclePanel`.
- `app/src/app/app/syndicates/dashboard/page.tsx` — mount the curator review
  surface of the panel (or a `mode="curator"` prop).

No change to: contracts, address book, deployments, governance docs, ABIs (all
present), `useAddresses` (keys already exposed).

## Testing plan

The repo has no frontend unit/e2e harness (only lint/typecheck/build + node
strip-types smokes like `app/scripts/kyb-smoke.ts`). Therefore:
- Add `app/scripts/portfolio-smoke.ts` (node `--experimental-strip-types`):
  pure-logic checks of the validation helpers + enum/label mappings + the
  `documentHash` derivation (no network), mirroring `kyb-smoke.ts`.
- `npm run ci` gates: lint, typecheck, build must stay green (440 contract tests
  unchanged — no contract change).
- Manual staging walkthrough on Base Sepolia (documented in the operator runbook):
  cedant submit → curator startReview → approve → activate → confirm
  `isAllocatable == true`.

## Acceptance criteria

- Asset manager (curator) and cedant complete submit→review→approve→activate from
  the UI on Base Sepolia staging.
- Real wagmi writes; no mocks; DataSourceBadge onchain.
- All tx/edge states handled: disconnected, wrong chain, missing role, pending,
  confirming, reverted, success, empty.
- No contracts/address-book/deployments/governance change; `npm run ci` green;
  secret scan clean.

## Risks and non-goals

- **Non-goals (separate future scope):** portfolio→vault allocation
  (`allocateToPortfolio` requires the VaultAllocator propose→execute proposal
  lifecycle — a distinct, larger UI = a `feat/portfolio-allocation-ui` branch);
  `recordPortfolioPremium` UI; sentinel pause/unpause buttons; off-chain document
  upload bucket; event-indexed status history.
- **Risk — role dependency:** the flow is unusable until the cedant/curator roles
  are granted on-chain (manual today, PR-3). The panel must show an explicit
  "missing role" state, not a broken form.
- **Risk — enumeration scale:** `useAllPortfolios` batches `getPortfolio` over
  the full count; fine at staging scale, but if it grows large a paginated/Lens
  approach should replace it (note for mainnet).
- **Risk — date/timezone handling:** date inputs to unix seconds must be UTC and
  validated (expiry > inception) before submit.

## Blockers requiring owner decision

- None hard (all ABIs/addresses present, frontend-only). One product decision:
  whether the first PR is onboarding-only (recommended, minimal) or also includes
  the allocation + premium phase (larger; needs the VaultAllocator proposal UI).
  Recommendation: ship onboarding-only first, allocation as a follow-up branch.

---
*Author: Anton Carlo Santoro. Planning artifact at commit `855359c`, 2026-06-14.
No code implemented.*
