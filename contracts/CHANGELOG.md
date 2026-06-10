# NextBlock Protocol — Changelog

All notable contract/ABI changes and security-relevant decisions.
Companion to `README.md` (audit package, part 1).

## [Phase 12.1] — EIP-170 fix found by the Base Sepolia dry run

### Added
- `src/VaultDeployer.sol` — bind-once deployer holding the `InsuranceVault`
  creation code. Only the bound `VaultFactory` can deploy (curator gating
  preserved); unbound or foreign callers revert. No funds, no other authority.
- 2 tests in `test/VaultFactory.t.sol` (deployer gates: not-factory deploy,
  one-shot binding, zero-address, unbound deploy).

### Changed (BREAKING ABI)
- `VaultFactory` — constructor takes an 8th parameter `vaultDeployer_`;
  `createVault` now delegates instantiation to `VaultDeployer.deploy()`.
  Rationale: embedding `new InsuranceVault` pushed the factory runtime to
  **24,972 bytes > 24,576 (EIP-170)** — deploy would revert on Base Sepolia.
  Found by the Phase 12 dry run (local test EVMs do not enforce the limit).
  Sizes after the split: VaultFactory 4,126 B, VaultDeployer 22,663 B.
  No change to `createVault`'s signature, gating or events: frontend consumed
  surface is unaffected (no contracts.ts regeneration required); the
  deployments JSON gains a `vaultDeployer` key.
- `DeployStack.s.sol` — deploys + binds the VaultDeployer, verifies its code,
  serializes it in the address book. `DemoSetup.s.sol` and the three factory
  test suites updated accordingly.

### Security assumptions
- Vault creation still has exactly one path: curator-gated
  `VaultFactory.createVault` -> bound `VaultDeployer.deploy`.
- Test baseline: forge test: **357 passed, 0 failed** (was 355; +2).

## [Phase 12] — End-to-end demo flow (staging)

### Added
- `script/DemoFlow.s.sol` — repeatable 12-step demo on Anvil/Base Sepolia only
  (chain guard inherited from DeployStack): fresh stack, MockUSDC mint, LP
  KYC + deposit, portfolio onboarding (submit/review/approve/activate),
  premium split + UPR, allocation via VaultAllocator (sole path), mock
  NAV/risk attestations, claim lifecycle (PARAMETRIC for single-run live
  chains; committee approval + vault reserve/payout always enforced — the AI
  never pays), bordereau proposal (liveness never skipped), lens verification
  (script REVERTS unless expected states are AVAILABLE and bordereau is NONE
  until finalized) and delta-exact USDC conservation check.
- `test/DemoFlow.t.sol` — 6 tests (CI twin with vm.warp): exact conservation
  re-assertion, sole-allocation-path and sole-claim-path bypass closure on the
  live demo stack, full NON_PARAMETRIC dispute-window claim path, bordereau
  finalization only after liveness, lens/vault coherence after the demo.
- `DEMO_FLOW.md` — step-by-step guide: acting roles, on-chain effects, what to
  verify in the Lens/frontend, claim-path note, bordereau finalization
  commands, final checks table, frontend address-book consumption.

### Security assumptions
- Demo is staging-only and self-checking; conservation and sole-path rules are
  enforced by reverts, not by inspection.
- Test baseline: forge test: **355 passed, 0 failed** (was 349; +6).

## [Phase 11] — Deployment readiness (Base Sepolia staging)

### Added
- `script/DeployStack.s.sol` — full institutional stack deploy (asset, roles,
  registries, oracle/AI, economic modules, bordereau/adapters, factory + vault,
  lens) with: hard chain guard (Base Sepolia 84532 / Anvil 31337 only — any
  other chain reverts), env-driven role addresses (default: deployer),
  optional `USDC_ADDRESS` reuse, ordered post-deploy wiring (ClaimReceipt
  registrar, vault `claimManager`/`vaultAllocator` Phase 9.5 binding,
  canonical grants contracts-first), on-script verification (code.length on
  all 17 addresses, all canonical roles, both bindings, lens AVAILABLE) and
  deterministic `deployments/<chainId>-staging.json` output.
  Declared NOT idempotent: each run deploys a fresh stack.
- `script/SanityCheck.s.sol` — READ-ONLY post-deploy check (no broadcast):
  code on every module, canonical roles, vault bindings, lens readability,
  USDC shape. Loads the deployments JSON (`DEPLOYMENT_FILE` overridable).
- `.env.example` — Base Sepolia staging template; testnet placeholder key
  only, explicit "no mainnet / no real funds" policy.
- `test/DeployStack.t.sol` — 4 tests: full run on the local chain with
  wiring/roles/lens assertions, chain-guard rejection (Ethereum mainnet and
  Base mainnet), `USDC_ADDRESS` reuse, faucet cap behaviour.
- `deployments/` directory (gitkeep) + `fs_permissions` in `foundry.toml`.

### Changed
- `src/MockUSDC.sol` — mint is now a CAPPED public faucet (`FAUCET_CAP` =
  100M USDC per call; deployer uncapped for demo seeding). Same
  `mint(address,uint256)` signature: no test or ABI break. Staging only.
- `foundry.toml` — added `base_sepolia` RPC endpoint + BaseScan etherscan
  entry; REMOVED the legacy non-Base `arc_testnet` endpoint (Base-only MVP).

### Security assumptions
- Staging only: the deploy script cannot run on mainnet chains; MockUSDC
  carries no real value; role addresses default to the deployer.
- Production handover (multisig/timelock for OWNER_ROLE + deployer
  revocation) is explicitly out of scope and documented in the README.
- Test baseline: forge test: **349 passed, 0 failed** (was 345; +4).

## [Phase 10] — NextBlockLens (canonical read model)

### Added
- `src/NextBlockLens.sol` — read-only lens aggregating the 9 dashboard areas:
  protocol status, vault dashboard, LP status, portfolio status, premium,
  claim, oracle, bordereau and adapter dashboards.
  - **Never-reverting `get*` views**: missing/undeployed modules degrade to
    `DataStatus.UNAVAILABLE`, unknown keys to `NONE`, freshness violations to
    `STALE`, sentinel pauses to `PAUSED` — one missing module cannot break a view.
  - **Strict `raw*` twins** revert with the underlying module error (auditor use).
  - **Explicit data source labelling** (`DataSource`): `ONCHAIN`, `MOCK_ORACLE`
    (Braino.ai/WAVENURE mock feeds — advisory, never verified), `LEGACY_RETIRED`,
    `NOT_AVAILABLE`. The UI must label mock-fed data accordingly.
  - **Versioned schema**: `LENS_VERSION`, `SCHEMA_VERSION` and a `schemaVersion`
    field stamped into every view struct.
  - **No duplicated accounting**: every figure is read from the owning module
    (`getVaultAccounting()`, `getPremiumAccounting()`, `getClaim()`, ...);
    the lens never recomputes solvency, UPR or capacity.
  - Only mutable state: `ModuleAddresses` book, `setModules` gated by
    `OWNER_ROLE` (operational, non-economic — no core module trusts the lens).
- `test/NextBlockLens.t.sol` — 21 tests: vault-accounting coherence after a
  full premium→allocation→claim flow, gradual-rollout (all-zero module book),
  partial-module independence, status precedence (PAUSED > NONE > STALE >
  AVAILABLE), garbage-input never-revert sweep, non-custodial guarantee,
  `setModules` governance gate.

### Security assumptions
- The lens has no economic authority: a misconfigured module address can only
  degrade dashboards, never move funds.
- Test baseline: forge test: **345 passed, 0 failed** (was 324; +21 lens tests).

## [Phase 9.5-SH] — 2026-06-10 — Security Hardening

### Removed (BREAKING — InsuranceVault ABI)
- **Legacy demo claim path removed from `InsuranceVault`:**
  `checkClaim`, `reportEvent`, `submitClaim`, `exerciseClaim`,
  `_processClaim`, `_validateClaimPreconditions`, the
  `oracleReporter` / `insurerAdmin` identity bindings and their setters,
  and the related events/errors (`ClaimTriggered`, `ClaimAutoExercised`,
  `ClaimExercised`, `ClaimShortfall`, `OracleReporterUpdated`,
  `InsurerAdminUpdated`, …).
  **Rationale:** these functions could move USDC out of the vault while
  bypassing the Claims Committee and the mandatory dispute window. The ONLY
  claim flow is now the institutional `ClaimManager` path
  (Submitted → Assessed → Disputed → Approved → Paid / Rejected), with the
  vault as sole payout executor via the bound `claimManager` address.
- **`script/Keeper.s.sol` retired** (depended on the removed triggers).
  Replaced with a notice stub; an institutional keeper limited to
  `ClaimManager.executeClaim` may return with the deployment-readiness block.

### Changed (BREAKING — InsuranceVault ABI)
- **Allocation gate switched from role to binding:**
  `allocateToPortfolio` / `deallocateFromPortfolio` now accept ONLY the bound
  `vaultAllocator` contract (new `setVaultAllocator`, OWNER_ROLE; new error
  `InsuranceVault__NotVaultAllocator`; new event `VaultAllocatorUpdated`).
  **Rationale:** closes the direct-`ALLOCATOR_ROLE` bypass flagged in
  Phase 6 — every allocation must pass through the VaultAllocator proposal
  lifecycle (TTL, concentration limits, advisory oracle guard).
  Tested: an EOA holding `ALLOCATOR_ROLE` but not bound is rejected.

### Frontend
- ABIs regenerated (`app/src/config/contracts.ts`).
- `useClaimTrigger` hooks and the admin `ClaimTriggers` panel converted to
  explicit "removed" stubs; `ClaimReceipts` exercise action disabled with a
  9.5 notice. No component implies the legacy auto-payout path exists.
- Legacy lint debt cleared: 18 → 0 ESLint errors (entity escapes, typed
  props, empty-interface→type alias, deterministic render in landing
  animations, deferred setState in `useEns`; unused `ui/chart.tsx` scaffold
  emptied). No economic logic touched. `tsc --noEmit` and `next build` green.

### Test baseline
- `forge test`: **324 passed, 0 failed** (was 359; 38 legacy-claim tests
  removed with the legacy path, 3 new bypass-closure tests added).
- Invariant suite unchanged in scope (10 properties); handler now routes all
  (de)allocations through the VaultAllocator proposal lifecycle.

### Security assumptions introduced
- The vault trusts exactly two bound contracts: `claimManager` (claims) and
  `vaultAllocator` (allocations). Both bindings are OWNER_ROLE-set and emit
  events; production deployments must point them at the audited
  `ClaimManager` / `VaultAllocator` instances and then move OWNER_ROLE to a
  multisig/timelock.

## [Phases 1–9] — 2026-06-10

Initial institutional build-out from the legacy demo: ProtocolRoles (10
canonical roles), ComplianceRegistry, PortfolioRegistry, vault hardening
(compliance hooks, UPR, buffer, caps), PremiumDistributor (1.5%/10% split),
NavOracle (staleness/deviation/sentinel), VaultAllocator (proposals,
concentration limits, 70/30 demo split), ClaimManager + AIAssessor (advisory
AI, committee approval, ≥24h dispute window), BordereauOracle (UMA-style
liveness/dispute), AdapterRegistry (non-custodial allowlist), frontend
realignment (on-chain roles, data-source labels, no silent fallbacks).
Baseline at the end of Phase 9: 359 tests passed.
