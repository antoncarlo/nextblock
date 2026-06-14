# NextBlock Pilot Operational Readiness

- **Date:** 2026-06-14
- **Base commit:** `855359c` (main)
- **Scope:** read-only readiness review for a Base Sepolia STAGING pilot
  (asset managers, cedants, committee, sentinel/admin, operator). Not mainnet,
  not real funds. No code/deploy/address/governance/tooling change.
- **Evidence:** concrete files/routes/hooks/contracts cited throughout.

## 1. Executive Summary

**Overall: READY WITH BLOCKERS for a staging pilot — runnable today only with
documented manual operator steps.** A realistic pilot can run, but two product
flows are operator-mediated rather than self-serve (KYB→on-chain role grant, and
institutional portfolio upload), and protocol fee collection has no UI.

Staging-pilot vs real-funds: this is staging-only readiness. **Governance Stage A
(deployer renounce / key separation) remains a hard blocker for real funds /
mainnet** — the deployer EOA currently holds every operational role
(`contracts/deployments/84532-staging.json`: owner/curator/sentinel/committee/
kycOperator/oracleNode/cedant/allocatorBot all == deployer; `pendingStageA`
present, not executed).

Findings: **P0 = 1** (single-EOA governance — mainnet/real-funds blocker, not a
staging blocker), **P1 = 3**, **P2 = 5**, **P3 = 3**.

## 2. Role-Based Journey Map

### Cedant / Insurance Company
- Entry: `/app/apply` (KYB) then `/app/my-company`.
- Wallet: connected, Base Sepolia (84532); chain guard present.
- Off-chain: KYB application approved (`kyb_applications`).
- On-chain role: `AUTHORIZED_CEDANT_ROLE` on ProtocolRoles (granted manually).
- Actions: submit KYB (`app/src/app/app/apply/page.tsx` → `POST /api/kyb/applications`);
  submit/track claims (`ClaimLifecyclePanel` on my-company).
- Expected: KYB recorded; once cedant role granted, can submit claims.
- Gaps: role grant is manual (see §4); claim submit needs an existing vault +
  portfolio (no portfolio UI, see §5); requires test USDC only for premium, not
  for claim submission.

### Asset Manager / Vault Manager / Underwriting Curator
- Entry: `/app/create-vault`, `/app/my-company`, `/app/vault/[address]/manage`.
- Wallet: connected, 84532.
- On-chain role: `UNDERWRITING_CURATOR_ROLE` (createVault is gated by it —
  `contracts/src/VaultFactory.sol:108-115`); vault manager identity is the
  per-vault `vaultManager`.
- Actions: `createVault` (`create-vault/page.tsx` → `VaultFactory.createVault`);
  register policy (`manage` → `PolicyRegistry.registerPolicy`); add policy to
  vault (`InsuranceVault.addPolicy`); deposit premium (approve +
  `depositPremium`); set premium depositor (`setAuthorizedPremiumDepositor`,
  OWNER).
- NAV/share price: visible via `useNextBlockLens`/`useVaultData` (Lens
  dashboards) on vault pages.
- Long-lived operation: the UPR bounded-loop fix (merged) makes vaults safe to
  run beyond a demo lifecycle (active caps + pruning + rollover).
- Gaps: the institutional **portfolio** path (PortfolioRegistry.submitPortfolio,
  allocateToPortfolio, recordPortfolioPremium) has **no UI** — manage uses the
  legacy per-policy path only (see §5). `setAuthorizedPremiumDepositor` is
  OWNER-gated, so funding premium needs the operator.

### Committee Member (Claims Committee)
- Entry: `/app/admin` (gated owner/sentinel/committee) → `ClaimLifecyclePanel`.
- Wallet: 84532; on-chain `CLAIMS_COMMITTEE_ROLE`.
- Actions: `resolveDispute`, `approveClaim` (amount), `rejectClaim`
  (`useClaimActions` → ClaimManager). Approve gated to ASSESSED + elapsed
  window + not frozen (non-parametric).
- Expected: committee is the sole approval authority.
- Gaps: none in UI for the lifecycle itself; role grant manual.

### Sentinel / Admin
- Entry: `/app/admin` → `ClaimLifecyclePanel` + `OracleControls`.
- Wallet: 84532; on-chain `SENTINEL_ROLE`.
- Actions: `disputeClaim`, `freezeClaim`, `unfreezeClaim` (claims);
  pause/unpause NAV feed, acknowledge deviation (`OracleControls` →
  NavOracle); portfolio pause is contract-only (no dedicated UI button).
- Gaps: some sentinel powers (pausePortfolio, disableAdapter, ComplianceRegistry
  setBlocked) are contract-only, no UI (see findings).

### Owner / Protocol Operator
- Entry: `/app/admin`.
- Wallet: 84532; OWNER (currently the deployer EOA).
- Actions: time controls (demo), oracle config, KYB review queue
  (`KybReviewQueue`), demo controls. Fee collection (`claimFees`) and role
  grants are NOT in the UI (manual cast/Safe).
- Gaps: see §4 and §7.

## 3. End-to-End Pilot Flow (round-trip)

1. Wallet setup: EOA or Coinbase Smart Wallet; connect (RainbowKit).
2. Network: Base Sepolia 84532; flows are chain-guarded
   (`useDepositFlow`/`useWithdrawFlow`/`useClaimActions`).
3. Test assets: MockUSDC faucet (`mockUSDC` in address book) for premium/deposit;
   small Base Sepolia ETH for gas. Claims need no asset to submit.
4. KYB submission: `/app/apply` → server route, RLS deny-by-default, fail-closed.
5. KYB review/approval: operator at `/app/admin` `KybReviewQueue` (wallet
   signature + on-chain role + single-use nonce).
6. On-chain role grant: **MANUAL** — operator grants the role on ProtocolRoles
   (deployer/Safe); UI only shows the `setWhitelist` calldata to propose (§4).
7. Vault creation/access: `/app/create-vault` (needs curator role).
8. Portfolio upload: **MISSING UI** — submitPortfolio/allocate are contract-only.
9. Premium deposit/accounting: per-policy `depositPremium` in manage; portfolio
   premium (`recordPortfolioPremium`) contract-only.
10. Policy registration: `manage` → registerPolicy + addPolicy.
11. Claim submission: `ClaimLifecyclePanel` (cedant).
12. Assessment: `attachAssessment` (permissionless; mirrors AIAssessor).
13. Dispute/freeze: sentinel via panel.
14. Approval/rejection: committee via panel.
15. Payout execution: `executeClaim` (permissionless) → vault `payPortfolioClaim`.
16. Protocol fee collect/distribute: **MANUAL** — `claimFees` has no UI (§7).

## 4. KYB-to-On-Chain Role Handoff

- **Automated:** KYB submission, review state machine, audit trail, operator
  authentication (signature + on-chain role + nonce). Public status endpoint.
- **Manual:** the actual on-chain role grant. `KybReviewQueue`
  (`app/src/components/admin/KybReviewQueue.tsx:24,316-325`) explicitly "never
  sends" — it renders the `setWhitelist` calldata for the operator to propose via
  the Safe/KYC Operator. Operational role grants (CEDANT/CURATOR/etc.) are
  entirely manual (deployer or Safe), no UI.
- **Who grants:** currently the deployer EOA (holds all roles) or the Safe→timelock.
- **Evidence operator needs before granting:** approved KYB row + applicant
  wallet ownership (already proven by the signed submission) + the role
  mapping. There is no in-UI "grant role" button or checklist.
- **Missing:** a role-grant UI/admin action, a documented grant checklist, and a
  unified on-chain audit trail tying KYB approval → role grant. The KYB audit
  trail (`kyb_review_events`) and the on-chain grant are not linked.

## 5. Vault and Portfolio Operations Readiness

- **Vault create/use from UI: YES.** `create-vault/page.tsx` →
  `VaultFactory.createVault` (curator-gated); manage page operational.
- **Upload portfolios over time: NO (UI gap).** The institutional portfolio
  path — `PortfolioRegistry.submitPortfolio`, curator approval,
  `InsuranceVault.allocateToPortfolio`, `recordPortfolioPremium` — has **no
  frontend** (grep: only a legacy reference in `components/vault/PolicyRow.tsx`).
  The manage page exposes the legacy per-policy path (registerPolicy/addPolicy/
  depositPremium). For a pilot framed on "asset managers uploading portfolios",
  this is a real gap.
- **UPR fix sufficient for long-lived pilot: YES.** Bounded active-set + pruning
  + rollover beyond the 64 active cap (merged, tested). Operationally safe for
  repeated policy/portfolio cycling within the per-vault active cap.
- **Remaining manual/missing:** portfolio submission/approval/allocation UI;
  premium-depositor authorization is OWNER-gated; no in-UI portfolio NAV
  attestation flow (oracle node is the deployer).

## 6. Claim Lifecycle Readiness

- **Coverage: full on-chain lifecycle is wired.** `ClaimLifecyclePanel.tsx`
  (+`useClaimLifecycle.ts` read via Lens `getClaimDashboard`/`getClaimCount`,
  `useClaimActions.ts` write via ClaimManager) covers submit, attachAssessment,
  dispute, freeze/unfreeze, resolveDispute, approve, reject, executeClaim.
- **Screens/components/hooks:** panel mounted on `/app/admin` (committee/
  sentinel/owner) and `/app/my-company` (cedant submit/track).
- **Role gates + failure states (verified in code):** disconnected (prompt),
  wrong-chain (`isWrongChain` banner, no tx), no-role (no action buttons),
  pending (`isPending`), confirming (`isConfirming`), reverted (`error`),
  empty ("No claims submitted yet"), Lens-not-deployed (unavailable, no fake
  data).
- **Gaps:** no claim evidence/document upload (only a keccak256 hash of an
  evidence reference); no notifications; status history is derived from current
  state via 30s Lens polling, not an event-indexed timeline (no per-claim audit
  history view).

## 7. Protocol Fee Operations Readiness

- **Accrual:** management fee accrues in `InsuranceVault` (`accumulatedFees`,
  `_accrueFeesInternal`); premium split fees in `PremiumDistributor`
  (`accruedProtocolFees`, `accruedUnderwritingFees`).
- **Collection:** `InsuranceVault.claimFees(recipient)` (OWNER-gated) and the
  distributor fee-claim functions exist on-chain.
- **UI support: NONE for collection.** The frontend only READS `accumulatedFees`
  (`syndicates/dashboard/page.tsx:149` totalFees display). `claimFees` has no
  `writeContract` call anywhere in `app/src`.
- **Scripts/manual:** fee collection requires a manual `cast send` / Safe
  transaction by the OWNER. No script committed for it.
- **Risks/missing docs:** no documented fee-collection runbook; while the
  deployer is OWNER, fees are collectable by a single EOA (acceptable in staging,
  a real-funds concern pre-Stage A).

## 8. Staging Test User Requirements (checklist)

- [ ] EVM wallet (EOA or Coinbase Smart Wallet).
- [ ] Network: Base Sepolia (chain 84532) added.
- [ ] Base Sepolia ETH (faucet) for gas.
- [ ] MockUSDC from the protocol faucet (for LP deposit / premium); none needed
      to submit a claim.
- [ ] KYB data: company name, legal entity type, jurisdiction, license number,
      contact name/email, website, description (clearly-marked fictitious data
      for staging).
- [ ] Role assignment requested from operator: cedant → AUTHORIZED_CEDANT_ROLE;
      asset manager → UNDERWRITING_CURATOR_ROLE; committee → CLAIMS_COMMITTEE_ROLE;
      sentinel → SENTINEL_ROLE; LP → ComplianceRegistry whitelist + KYC expiry.
- [ ] URL: cedant `/app/apply` then `/app/my-company`; asset manager
      `/app/create-vault` + `/app/vault/[address]/manage`; committee/sentinel
      `/app/admin`.
- [ ] Happy path: KYB → operator grants role → (asset manager) create vault +
      register/add policy + deposit premium → (cedant) submit claim → attach
      assessment → committee approve → execute payout.
- [ ] Blocked? Contact: operations/security contacts in `docs/OPERATIONS.md` /
      `SECURITY.md`.

## 9. Operator Runbook (staging pilot)

1. Pre-pilot: confirm main green, Vercel `nextblock2` up, `/api/health` 200,
   Supabase env present (KYB fail-closed otherwise), faucet funded.
2. Verify staging: `GovernanceCheck` read-only; confirm address book matches
   on-chain; note deployer holds all roles (expected pre-Stage A).
3. Invite company/asset manager: share the test-user checklist (§8).
4. Review KYB: `/app/admin` `KybReviewQueue`, sign + review; approve/reject.
5. Grant roles MANUALLY (current gap): from the deployer/Safe, grant the mapped
   ProtocolRoles role; for LPs, `ComplianceRegistry.setWhitelist` + KYC expiry
   (calldata shown in the queue). Record tx hashes against the KYB row id.
6. Verify vault/policy setup: confirm `createVault`, `registerPolicy`/`addPolicy`,
   `depositPremium` succeeded via Lens dashboards.
7. Monitor claim lifecycle: `/app/admin` panel; watch submit→assess→approve→pay;
   sentinel disputes/freezes anomalies.
8. Fees (manual): OWNER calls `claimFees(recipient)` per vault and the
   distributor fee-claim functions via `cast`/Safe; record amounts.
9. Record pilot evidence: tx hashes, KYB ids, claim ids, fee receipts.
10. Rollback/incident: follow `docs/OPERATIONS.md` IR-1..IR-5 (frontend rollback,
    RPC fallback, sentinel pause, Safe/timelock emergency, key rotation).

## 10. Findings Table

| ID | Sev | Area | Finding | Evidence | Impact | Recommended fix | Required before |
|---|---|---|---|---|---|---|---|
| PR-1 | P0 | Governance | Deployer EOA holds all operational roles; Stage A not executed | `84532-staging.json` (all roles == deployer; `pendingStageA`); `docs/GOVERNANCE_PHASE2.md` | Single key controls everything; unacceptable for real funds | Execute Stage A (payload ready) then Stage B | mainnet/real-funds only (acceptable in staging with operator awareness) |
| PR-2 | P1 | Vault/Portfolio | Institutional portfolio path has no UI (submit/approve/allocate/recordPortfolioPremium) | grep: no `submitPortfolio` in `app/src`; manage uses legacy per-policy path | "Asset managers upload portfolios over time" not self-serve | Build portfolio upload + allocation UI | staging pilot (or operator does it via cast) |
| PR-3 | P1 | Roles | KYB→on-chain role grant fully manual; no grant UI/checklist/linked audit | `KybReviewQueue.tsx:24,316-325` (never sends) | Operator must hand-grant every role; error-prone | Role-grant admin UI or documented checklist + audit link | staging pilot (operator workaround exists) |
| PR-4 | P1 | Fees | No UI for `claimFees`/distributor fee claims (collection is manual) | `claimFees` only in ABI; `syndicates/dashboard:149` read-only | Fee operations require manual cast/Safe | Fee-ops UI or committed script + runbook | staging pilot (manual workaround) |
| PR-5 | P2 | Claims | No evidence/document upload; only keccak256 hash of a reference | `ClaimLifecyclePanel.tsx` submit form | Cedants cannot attach real bordereau/evidence | Private document bucket + hash anchor | mainnet only |
| PR-6 | P2 | Claims | No event-indexed per-claim status history/timeline; 30s Lens poll only | `useClaimLifecycle.ts` (poll) | Limited auditability of transitions in UI | Indexer + history view | mainnet only |
| PR-7 | P2 | Sentinel | Some sentinel powers contract-only (pausePortfolio, disableAdapter, setBlocked) | grep: no UI buttons | Emergency actions need cast for some levers | Add sentinel action buttons | staging pilot (cast workaround) |
| PR-8 | P2 | Fees/docs | No fee-collection runbook entry | `docs/OPERATIONS.md` lacks fee ops | Operator lacks step-by-step | Add fee-ops runbook section | staging pilot |
| PR-9 | P2 | Coverage | ClaimManager branch coverage 58.62% (weak module pre-audit) | baseline report 2026-06-13 | Audit-readiness gap | Targeted ClaimManager tests | external audit prep |
| PR-10 | P3 | UX | Async states via polling, not indexed events | claim/lens hooks | Latency/UX | Indexer/API | future |
| PR-11 | P3 | Static analysis | Slither/Aderyn not yet run | baseline report | Automated coverage of detectors pending | Authorized Slither pass | external audit prep |
| PR-12 | P3 | Docs | No consolidated pilot user guide in-repo | this report fills it | Onboarding friction | Publish pilot guide | staging pilot (nice-to-have) |

## 11. Pilot Readiness Checklist (pass/fail)

- Product/UI: KYB submit PASS; claim lifecycle PASS; vault create PASS;
  policy register/add/premium PASS; **portfolio upload FAIL (no UI)**; **fee
  collection FAIL (no UI)**.
- On-chain contracts: vault/claim/registry/roles/lens deployed PASS;
  UPR bounded PASS; fee functions present PASS.
- Off-chain KYB/Supabase: RLS deny-by-default PASS; fail-closed PASS; nonce auth
  PASS; document upload FAIL (none).
- Roles/governance: role gating enforced PASS; **Stage A executed FAIL (blocker
  for real funds)**; role-grant UI FAIL (manual).
- Fees/accounting: accrual PASS; collection UI FAIL (manual); runbook FAIL.
- Documentation/runbook: OPERATIONS IR-1..IR-5 PASS; legal docs PASS; fee-ops
  runbook FAIL; pilot user guide PASS (this doc).
- Testing/verification: `npm run ci` PASS (see §below); coverage 70.87% branches
  PARTIAL (target 80%).

## 12. Recommended Next Branches (single-scope, not implemented now)

- `feat/portfolio-upload-ui` — institutional portfolio submit/approve/allocate +
  `recordPortfolioPremium` UI (closes PR-2).
- `feat/role-grant-admin-ui` — operator role-grant action wired to ProtocolRoles
  / Safe proposal, linked to KYB row (closes PR-3).
- `feat/fee-ops-ui` — `claimFees` + distributor fee-claim UI for OWNER (closes PR-4).
- `docs/fee-ops-runbook` — fee-collection runbook section (closes PR-8).
- `test/claimmanager-coverage` — raise ClaimManager branch coverage (closes PR-9).
- `feat/sentinel-actions-ui` — pausePortfolio/disableAdapter/setBlocked buttons (PR-7).

## Verification & scope confirmation

- `npm run ci`: see final output (run on this branch; no code changed, expected
  green — frontend lint/typecheck/build + 440 contract tests).
- Files changed: only `NEXTBLOCK_PILOT_OPERATIONAL_READINESS_2026-06-14.md`.
- No contract/frontend/Supabase/deployment/address-book/governance change; no
  Slither/Aderyn install; no deploy/broadcast/on-chain tx.

## Final recommendation

**Proceed to a staging pilot ONLY with manual operator workarounds** for: (a)
on-chain role grants after KYB (PR-3), (b) portfolio upload via cast until the UI
exists (PR-2), (c) fee collection via cast/Safe (PR-4). The self-serve claim
lifecycle, KYB, vault creation and per-policy flows are pilot-ready. **Do NOT use
real funds / mainnet** until Governance Stage A (and Stage B) complete (PR-1).
External-audit prep items: PR-9 (coverage), PR-11 (Slither), PR-5/PR-6.

---
*Author: Anton Carlo Santoro. Read-only review at commit `855359c`, 2026-06-14.*
