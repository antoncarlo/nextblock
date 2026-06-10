# NextBlock — End-to-End Demo Flow (Phase 12)

*Repeatable institutional demo of the full NextBlock stack on **local Anvil or
Base Sepolia staging only**. MockUSDC only: no real funds, no real APIs, no
mainnet. The deploy layer hard-reverts on any other chain.*

---

## How to run

```bash
cp .env.example .env     # BASE_SEPOLIA_RPC_URL + TESTNET placeholder PRIVATE_KEY

# Local (Anvil)
anvil &
forge script script/DemoFlow.s.sol --rpc-url http://127.0.0.1:8545 --broadcast -vvv

# Base Sepolia staging
forge script script/DemoFlow.s.sol --rpc-url base_sepolia --broadcast -vvv
```

The script is self-checking: it REVERTS if any lens state or the USDC
conservation check fails. A clean exit means the demo passed every check.
Each run deploys a FRESH stack (declared non-idempotent, like `DeployStack`)
and rewrites `deployments/<chainId>-staging.json`.

The CI twin is `test/DemoFlow.t.sol` (`forge test --match-contract DemoFlowTest`):
it additionally exercises the time-dependent paths via `vm.warp` (dispute
window, bordereau liveness) and the bypass-closure negative tests.

---

## SECTION 01 — Steps, acting roles and what to verify

| # | Step | Acting role | On-chain effect | Verify in the Lens |
|---|------|-------------|-----------------|--------------------|
| 1 | Fresh stack deploy | Deployer | 17 contracts, wiring, role grants, address book JSON | `getProtocolStatus()`: modules populated, `vaultCount = 1` |
| 2 | Mint MockUSDC | Faucet (capped 100M/call) | 600K USDC minted: 500K LP capital + 100K premium | — |
| 3 | KYC / whitelist LP | KYC Operator | `ComplianceRegistry`: whitelist, expiry, jurisdiction | `getLPStatus()`: `complianceStatus AVAILABLE`, `canReceive true` |
| 4 | LP deposit | Institutional LP | 500K USDC in, nbUSDC shares out (ERC-4626, compliance-gated) | `getLPStatus()`: `shareBalance > 0`, `redemptionEligible` |
| 5 | Portfolio onboarding | Cedant submits; Underwriting Curator reviews, approves (`expectedLossBps` mock), activates | Portfolio `ACTIVE` in `PortfolioRegistry`; routing set in distributor | `getPortfolioStatus()`: `AVAILABLE`, `allocatable true` |
| 6 | Premium payment | Cedant | `PremiumDistributor.receivePremium`: split (LP quota -> vault UPR, protocol + underwriting fees accrued) | `getPremiumDashboard()`: `AVAILABLE`, `gross = lpQuota + fees` exactly |
| 7 | Allocation | Allocator (proposal) -> `VaultAllocator` contract (execution, **sole path**) | 150K exposure booked in the vault | `getVaultDashboard()`: `portfolioAllocated = 150K` |
| 8 | NAV / risk attestation | Oracle node (Braino.ai **mock**) | `NavOracle.publishNav` + `publishPortfolioRisk`, confidence 90% | `getOracleDashboard()`: `AVAILABLE`, source `MOCK_ORACLE` |
| 9 | Claim lifecycle | Cedant submits; AI Assessor publishes **advisory** assessment; Claims Committee approves; vault reserves and pays (**sole path**) | 40K paid: `ClaimManager -> InsuranceVault.payPortfolioClaim` | `getClaimDashboard()`: `PAID`, AI labelled `MOCK_ORACLE` |
| 10 | Bordereau attestation | Cedant proposes; liveness runs | Assertion `PROPOSED` in `BordereauOracle` | `getBordereauDashboard()`: **`NONE`** until finalized (correct: unverified = absent) |
| 11 | Lens verification | — (read-only) | Script reverts unless every expected state is `AVAILABLE` | All dashboards |
| 12 | Conservation + frontend | — (read-only) | Delta-exact USDC accounting; address book pointer | — |

## SECTION 02 — Claim path note (single-run vs institutional default)

The scripted claim is **PARAMETRIC** so one run completes on a live chain
(no time travel). Committee approval, vault solvency reserve and the
sole-payout-path rule still fully apply — **the AI never approves and never
pays**. The institutional default path (**NON_PARAMETRIC**: AI advisory
required + full dispute window before committee approval) is exercised in
`test/DemoFlow.t.sol::test_nonParametricClaim_fullDisputeWindowPath`.

## SECTION 03 — Bordereau finalization (liveness is never skipped)

The assertion stays `PROPOSED` for the liveness window (default 2 days;
configurable within [1h, 30d] by OWNER). Finalize after it elapses:

```bash
# Anvil: jump time first
cast rpc evm_increaseTime 172801 && cast rpc evm_mine

# Then (any sender — finalization is permissionless housekeeping)
cast send <bordereauOracle> "finalizeAssertion(uint256)" <assertionId> \
  --rpc-url <RPC> --private-key $PRIVATE_KEY
```

The Lens reports `NONE` until then — by design, the UI must treat unverified
bordereau data as absent rather than showing fake/fallback values.

## SECTION 04 — Final checks enforced

| Check | Where enforced |
|---|---|
| USDC conservation (mint = actor payout + vault + distributor fees, delta-exact) | `DemoFlow._step12` (revert) + `DemoFlowTest.test_conservation_exactSplit` |
| Lens states AVAILABLE where modules are live | `DemoFlow._step11` (revert) + `DemoFlowTest.test_lens_statesAfterDemo` |
| No fake fallbacks (bordereau NONE until finalized; mock sources labelled) | `_step11` + `test_bordereau_finalizesOnlyAfterLiveness` |
| Claim path unique (`ClaimManager -> InsuranceVault` only) | `test_uniqueClaimPath_directVaultCallReverts` |
| Allocation path unique (`VaultAllocator -> InsuranceVault` only) | `test_uniqueAllocationPath_directVaultCallReverts` |

## SECTION 05 — Frontend consumption

The frontend reads `deployments/<chainId>-staging.json` as its address book
(`app/src/config/contracts.ts` keys match; unset modules stay ZERO and the UI
shows **Unavailable** — never invented data). Every datum is labelled by the
Lens `DataSource`: `ONCHAIN`, `MOCK_ORACLE` (Braino.ai/WAVENURE mock,
advisory), `LEGACY_RETIRED`, `NOT_AVAILABLE`.
