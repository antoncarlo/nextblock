# NextBlock — Audit Preparation: Invariant Catalogue & Failure-Mode Review

**Author:** Anton Carlo Santoro
**Status:** Internal preparation only. An external audit is a separate, mandatory step
and is NOT implied by this document.
**Scope:** the on-chain protocol (`contracts/src`). Base-only (Base Sepolia / Base Mainnet),
USDC settlement, `nbRV` restricted vault shares.

This document catalogues the protocol's economic/security invariants, maps each to where
it is enforced and tested, and records the per-module threat model and failure modes — the
package an external auditor needs to start.

---

## 1. Economic & security invariant catalogue

| # | Invariant | Enforced in | Test coverage |
|---|---|---|---|
| I1 | **USDC conservation** — vault/buffer/allocation/escrow/reserve/payout reconcile with deposits, premiums, claims, fees | `InsuranceVault` accounting, `PremiumDistributor` split | `VaultInvariant.invariant_usdcConservation`, `PremiumDistributorInvariant.invariant_grossSplitConservation` + `invariant_balanceEqualsUnclaimedFees`, `RedemptionQueueInvariant.invariant_usdcConservation` |
| I2 | **No unbacked shares** — `nbRV` minted only against valid USDC + compliance + capacity | ERC-4626 `_deposit`, compliance gate in `_update` | `VaultInvariant.invariant_totalAssetsSafe`, vault unit/fuzz |
| I3 | **Solvency** — `totalAssets` + reserves cover redeemable shares & approved obligations | `totalAssets` NAV formula, `_availableBuffer` | `VaultInvariant.invariant_claimReservesBacked`, `invariant_bufferNeverOverpromises` |
| I4 | **UPR correctness** — unearned premium accrues linearly, never booked as instant yield | `_totalUnearnedPremiums`, premium recording | `VaultInvariant.invariant_uprBoundedByPremiums`, `InsuranceVaultUprBounds` |
| I5 | **Exposure cap** — portfolio/cedant/concentration limits not exceeded | `VaultAllocator` concentration checks, vault `allocateToPortfolio` coverage check | `VaultInvariant.invariant_allocationBounds`, `VaultAllocator` unit |
| I6 | **Rounding safety** — round down to users, up for liabilities/fees | `_split` (fees ceil), `previewRedeem` floor, queue pro-rata floor | `PremiumDistributorInvariant`, `RedemptionQueue` dust-fix unit + invariant |
| I7 | **Dispute/liveness** — off-chain claims cannot bypass AI → window → committee | `ClaimManager` lifecycle | `ClaimManager` unit, `ClaimLifecycleFork` |
| I8 | **Compliance transfer** — non-whitelisted/blocked cannot receive restricted shares | `ComplianceRegistry.canReceive`/`requireCanTransfer`, vault `_update` hook | `ComplianceRegistry` unit, vault hardening |
| I9 | **Liquidity lock** — committed underwriting capital not promised as instantly redeemable beyond buffer | `_availableBuffer`, `RedemptionQueue` (above-buffer queued) | `RedemptionQueueInvariant`, `VaultInvariant.invariant_bufferNeverOverpromises` |
| I10 | **Role separation** — Sentinel may pause/reduce risk, never move funds; Owner/Allocator bounded by caps/gates/timelock | per-module `onlyProtocolRole`, `ProtocolTimelock` holds OWNER | `governance/RoleSeparation` (cross-cutting), `GovernancePhase2Rehearsal` (timelock) |
| I11 | **Queue escrow integrity** — escrowed nbRV + held USDC reconcile with outstanding requests/settlements | `RedemptionQueue` escrow accounting | `RedemptionQueueInvariant` (5 invariants), `RedemptionQueue` unit/fuzz/fork |
| I12 | **Fee ledger** — accrued fees only leave via OWNER pull; balance == unclaimed fees | `PremiumDistributor` pull pattern | `PremiumDistributorInvariant.invariant_feeLedger` |

---

## 2. Per-module threat model & failure modes

### InsuranceVault (ERC-4626 + RWA)
- **Threats:** first-deposit inflation (mitigated: `_decimalsOffset()=12` virtual shares);
  buffer drain via redemption beyond free liquidity (mitigated: `_availableBuffer`, queue for
  above-buffer); compliance bypass on transfer (mitigated: `_update` hook calls
  `requireCanTransfer`); NAV manipulation (NAV is balance − UPR − claims − fees, floored at 0,
  never reverts).
- **Failure modes:** allocator mis-binding (only OWNER via timelock can rebind); fee accrual on
  every state change keeps share price honest.

### RedemptionQueue (periodic-window pro-rata exit)
- **Threats:** bank-run first-come advantage (mitigated: pro-rata settle, order-independent);
  last-claimer dust underflow (FIXED: `sharesReturned` capped at `escrowedShares`); settling
  beyond vault buffer (mitigated: capped at `vault.maxRedeem`); unauthorized settle (ALLOCATOR_ROLE).
- **Failure modes:** keeper inaction → epoch never settles (LP funds not lost, re-requestable);
  paused queue blocks new requests but claims of settled epochs stay open.

### PremiumDistributor
- **Threats:** rounding gain to caller (mitigated: fees ceil, dust shrinks LP quota); fee theft
  (pull pattern, OWNER-only claim); split-brain vault rebinding after funding (blocked).
- **Failure modes:** LP quota forwarding to vault reverts → whole premium reverts (atomic).

### ClaimManager / AIAssessor / BordereauOracle
- **Threats:** instant payout bypassing dispute (mitigated: AI advisory → window → committee →
  payout); AI/oracle business authority (mitigated: advisory only, human gate enforced on-chain);
  Sentinel freeze/dispute is risk-reduction, cannot pay out.
- **Failure modes:** stale/missing AI assessment blocks approval, never auto-approves.

### ComplianceRegistry
- **Threats:** non-KYC receiving shares (blocked); blocked-address latch overridden (blocked wins
  over whitelist + approvedVenue); approvedVenue abuse (KYC-operator-gated, scoped).
- **Failure modes:** KYC expiry → `canReceive` false (4th gate outcome surfaced in UI).

### Governance (ProtocolRoles + ProtocolTimelock)
- **Threats:** privilege escalation (uniform `onlyProtocolRole`); risk-increasing action without
  delay (mitigated: timelock holds OWNER_ROLE, all OWNER config routed through schedule→delay→execute);
  Sentinel overreach (RoleSeparation proves cannot move funds).
- **Failure modes:** renounce-without-timelock-ownership guarded; Sentinel emergency stays direct
  (immediate, by design).

### lending/LendingMarket (isolated, permissioned)
- **Threats:** borrow beyond LTV (health check via oracle); bad debt (socialised to lenders,
  liquidation 5% incentive); custody of nbRV without approval (approvedVenue gate).
- **Failure modes:** stale NAV blocks borrow (oracle guard); pause blocks supply/borrow, leaves
  exit + liquidate open.

---

## 3. Test coverage map

| Layer | Files |
|---|---|
| Unit + fuzz | one `*.t.sol` per module under `test/` (success / revert / events / boundary fuzz) |
| Invariant | `test/invariant/`: `VaultInvariant`, `LendingMarketInvariant`, `RedemptionQueueInvariant`, `PremiumDistributorInvariant` |
| Governance | `test/governance/`: `GovernancePhase2Rehearsal` (timelock lifecycle), `RoleSeparation` (Sentinel cannot move funds) |
| Base fork (84532) | `test/fork/`: `ClaimLifecycleFork`, `GovernancePhase2Fork`, `LendingMarketFork`, `RedemptionQueueFork` |

Full suite at time of writing: **563 passing**. Invariant suites run handlers + additive ghost
variables + multi-actor + bounded inputs; `targetSelector` restricts the fuzzer to handler actions.

---

## 4. Known limitations / out of scope for this prep

- **External audit** — required, separate, not performed here.
- **NAV / AI / bordereau real providers** — currently mock adapters; real Braino.ai / signed NAV /
  UMA OOv3 integration is owner-gated (keys/endpoints).
- **Indexer** — historical series (NAV history, realised yield, cumulative payouts) need an event
  indexer; current dashboards are current-state.
- **Multisig handover** — production requires a Gnosis Safe (3-of-5 Claims Committee) holding the
  privileged roles, with deployer revocation. Rehearsed in tests, not yet deployed.
