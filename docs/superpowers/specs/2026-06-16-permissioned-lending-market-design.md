# NextBlock — Permissioned Lending Market (nbUSDC collateral) — Design Spec

- **Author:** Anton Carlo Santoro
- **Date:** 2026-06-16
- **Status:** Draft — pending owner approval
- **Branch:** `docs/permissioned-lending-market-spec`
- **Scope tier:** MVP, Base-only (Base Sepolia staging → Base Mainnet)

## 1. Goal & context

Institutional LPs holding `nbUSDC` (restricted ERC-4626 vault shares) currently have no way to
unlock liquidity without redeeming — and redemption is capped by the vault buffer. This spec
adds **permissioned DeFi composability**: an LP can post `nbUSDC` as collateral and borrow
USDC against it, **without `nbUSDC` ever becoming a freely tradeable public token**.

This is the *permissioned* model used by serious institutional RWA protocols (Ondo's **Flux
Finance**: a Compound fork whose markets are allowlisted; BlackRock **BUIDL**: transfers only
between approved holders). Compliance stays at the token level (`ComplianceRegistry` ≈
ERC-3643); composability is achieved by **approving specific venues** to custody the restricted
share — never by removing the KYC gate.

### Decisions locked with owner (2026-06-16)
- Direction: **A — Permissioned composability** (not open DeFi, not a second NXB-style token).
- First venue: **Collateral / Borrow**.
- Liquidity source: **Isolated two-sided market with whitelisted USDC suppliers** (Morpho Blue
  grammar). `InsuranceVault` is **left untouched** — zero risk to its invariants.
- Compliance gate: **explicit `approvedVenue`** concept added to `ComplianceRegistry`.

## 2. Scope

### In scope
- A native, self-contained isolated lending market: 1 collateral asset (`nbUSDC` of one
  `InsuranceVault`) + 1 loan asset (USDC).
- Supply side (whitelisted USDC lenders earn interest) and borrow side (whitelisted `nbUSDC`
  holders borrow USDC), with internal (non-token) position accounting.
- NAV-based collateral pricing via the existing `NavOracle`, with staleness/pause propagation.
- Liquidation restricted to whitelisted liquidators.
- Explicit `approvedVenue` support in `ComplianceRegistry`.
- A factory to deploy one permissioned market per `InsuranceVault`.
- Foundry unit + fuzz + invariant + Base-fork tests; Base Sepolia deployment script.

### Out of scope (explicit — do not build now)
- Public DEX/lending composability (Aave / Compound / Uniswap / Curve public pools).
- Yield aggregators (Yearn / Beefy), leverage looping.
- Cross-chain / CCTP; any non-Base chain.
- A unified network/yield token ("NXB") or any new transferable token.
- Any modification to `InsuranceVault.sol`, `ClaimManager.sol` or other live staging contracts
  (avoid desync from the deployed staging generation).

## 3. Architecture

```
 USDC lenders (whitelisted) ──supply USDC──┐
                                           ▼
 nbUSDC holders (whitelisted) ─post nbUSDC─►  LendingMarket  ──reads price──► NavShareOracle ──► NavOracle.getNav(vault)
                              ◄─borrow USDC─┤                                                   └─ nbUSDC.totalSupply()
 Liquidators (whitelisted)   ─repay/seize──┘
                                           │ custody of nbUSDC requires:
                                           ▼
                              ComplianceRegistry.approvedVenue[market] == true
```

New contracts live under `contracts/src/lending/`:
- `LendingMarket.sol` — the isolated market (state machine + accounting).
- `LendingMarketFactory.sol` — deploys/registers permissioned markets (mirror of `VaultFactory`).
- `NavShareOracle.sol` — price adapter: USDC value per `nbUSDC` share.

One change to an existing contract:
- `ComplianceRegistry.sol` — add `approvedVenue` (additive, backward-compatible).

## 4. Components

### 4.1 `ComplianceRegistry` change — `approvedVenue`
Additive only. A venue is an on-chain contract approved to **custody restricted shares**; it has
no KYC expiry (a contract cannot "expire"), so it is exempt from the `kycExpiry` check but still
subject to the `blocked` flag.

- **Storage:** `mapping(address => bool) public approvedVenue;`
- **Functions:**
  - `setApprovedVenue(address venue, bool approved)` — `onlyProtocolRole(KYC_OPERATOR_ROLE)`.
  - Sentinel can revoke risk via existing `setBlocked` (a blocked venue cannot receive — see below).
- **Eligibility change:** `canReceive(user)` returns `true` if `approvedVenue[user] && !blocked[user]`,
  **bypassing** the `whitelisted` + `kycExpiry` checks for that branch only. Human-investor path is
  unchanged (`whitelisted && !blocked && kycExpiry >= now`). `canTransfer`/`requireCanTransfer`
  inherit this through `canReceive`.
- **Events/Errors:** `event ApprovedVenueUpdated(address indexed venue, bool approved);` Reuse
  existing error classes.
- **Invariant preserved:** a `blocked` address (venue or human) can never receive; burns still allowed
  for non-blocked senders so compliant exits remain possible.

> **Deployment reality (open question — see §10):** the *current staging* `InsuranceVault` has **no
> `setComplianceRegistry` setter** ([InsuranceVault.sol:263](../../../contracts/src/InsuranceVault.sol)) — it is permanently bound to the registry passed at
> construction. So `approvedVenue` takes effect only for the registry generation a vault points to.
> For the demo we deploy a **fresh generation** (new `ComplianceRegistry` w/ `approvedVenue` + new
> `InsuranceVault` bound to it) on Base Sepolia. The existing staging vault keeps its old registry;
> if it must be composable too, the only no-redeploy bridge is `setWhitelist(market,true)` +
> `setKycExpiry(market, type(uint64).max)` on its old registry.

### 4.2 `NavShareOracle.sol`
Pure read adapter. No funds, no state beyond immutables.

- **Inputs (immutable):** `NavOracle navOracle`, `InsuranceVault vault` (the `nbUSDC` token).
- **Core:** `priceCollateralUSDC(uint256 shares) → uint256` =
  `shares * nav / totalSupply` where `(nav, , ) = navOracle.getNav(address(vault))`, `totalSupply =
  vault.totalSupply()`. Units check: `1e18 * 1e6 / 1e18 = 1e6` (USDC 6-dec). 
- **Safety:** `getNav` **reverts** if NAV is missing/stale/paused → the market freezes risk-increasing
  actions automatically (see invariants). Provide a non-reverting `tryPriceCollateralUSDC` for views.
- **Cross-check (defense in depth):** optionally compare against `vault.convertToAssets(shares)` and
  expose the deviation for monitoring; the authoritative price for borrow/liquidation is `NavOracle`
  (guarded), not raw 4626 conversion.
- `totalSupply == 0` ⇒ revert (no priceable collateral).

### 4.3 `LendingMarket.sol` (isolated market)
Holds USDC liquidity and custodies `nbUSDC` collateral. Positions are **internal accounting**, not
ERC-20 tokens (Morpho-style), to avoid creating another transfer-compliance surface.

- **Immutables:** `IERC20 loanAsset` (USDC), `IERC4626 collateral` (`nbUSDC`/vault),
  `NavShareOracle oracle`, `ProtocolRoles protocolRoles`, `IComplianceRegistry compliance`.
- **Risk params (curator-set, risk-increasing changes timelocked):** `lltvBps` (max borrow LTV),
  `liqLtvBps` (liquidation threshold), `liqIncentiveBps`, `supplyCap`, `borrowCap`, IRM params.
- **Supply book:** `totalSupplyAssets`, `totalSupplyShares`, `mapping(address=>uint256) supplyShares`.
- **Borrow book:** `totalBorrowAssets`, `totalBorrowShares`, `mapping(address=>uint256) borrowShares`,
  `mapping(address=>uint256) collateralShares`.
- **Interest:** `lastAccrued`, `protocolFeeBps`, `feeRecipient`; `_accrue()` updates borrow/supply
  indices from a utilization-based IRM before every state-changing action.
- **Lender functions:** `supply(uint256 assets)`, `withdraw(uint256 assets)` — gated to
  `compliance.canReceive(msg.sender)` (whitelisted institutional lender); withdraw bounded by free
  liquidity (`totalSupplyAssets - totalBorrowAssets`).
- **Borrower functions:** `depositCollateral(uint256 shares)` (transfers `nbUSDC` in — requires this
  market is an `approvedVenue` so the vault's `_update` hook passes), `withdrawCollateral`,
  `borrow(uint256 assets)`, `repay(uint256 assets)`. Borrower must be `compliance.canReceive`.
- **Liquidation:** `liquidate(address borrower, uint256 repayAssets)` — caller must be whitelisted
  (it will *receive* seized `nbUSDC`). Allowed only when `borrow value > liqLtvBps * collateral value`.
  Liquidator repays USDC, seizes `nbUSDC` at `liqIncentiveBps` discount. Bad debt (collateral
  exhausted, debt remains) is socialized to suppliers via index write-down + `BadDebtRealized` event.
- **Roles wired:** Curator (params, timelocked up), Sentinel (`pause`, `pauseBorrow`), Owner (fee).
- **Events:** `Supply, Withdraw, DepositCollateral, WithdrawCollateral, Borrow, Repay, Liquidate,
  AccrueInterest, BadDebtRealized, ParamsUpdated, Paused, Unpaused`.
- **Errors:** `Unauthorized, MarketPaused, NotApprovedVenue, NotWhitelisted, InsufficientLiquidity,
  HealthFactorTooLow, PositionHealthy, CapExceeded, StalePrice, ZeroAmount`.

### 4.4 `LendingMarketFactory.sol`
Mirrors `VaultFactory.createVault` ([VaultFactory.sol:108](../../../contracts/src/VaultFactory.sol)).

- `createMarket(params)` — `onlyProtocolRole(OWNER_ROLE)` (or a dedicated factory role): deploys a
  `LendingMarket`, records it, and emits `MarketCreated`. Wiring of `approvedVenue` for the new
  market in the relevant `ComplianceRegistry` is a post-deploy governance step (script + runbook).
- Read views: `getMarket`, `getMarketIds`, `marketCount`.

## 5. Pricing & decimals (critical)
- `nbUSDC`: **18 decimals** (`_decimalsOffset()=12` on a 6-dec USDC asset).
- `NavOracle.getNav(vault)`: NAV in **6-dec USDC**, guarded (staleness 15m floor … 30d ceiling,
  deviation ≤ configured bps, auto-pause).
- Collateral USDC value `= collateralShares(1e18) * nav(1e6) / totalSupply(1e18)` → 6-dec USDC.
- All LTV math in 6-dec USDC space; round **collateral value down**, **debt up**.

## 6. Economic model
- **IRM:** utilization-based linear (Morpho-grammar): `borrowRate = base + slope * utilization`,
  `utilization = totalBorrowAssets / totalSupplyAssets`. Curator-set within hard bounds.
- **Proposed default params (confirm in planning):** `lltvBps = 7000` (70%), `liqLtvBps = 8000`
  (80%), `liqIncentiveBps = 500` (5%), `protocolFeeBps = 1000` (10% of interest). Rationale:
  `nbUSDC` NAV is stable-ish but carries claim/loss risk → conservative LTV.
- **Protocol fee** on accrued interest accrues to `feeRecipient` (ties into the Money Flow ledger
  workstream later).
- **Bad debt:** realized to suppliers (index write-down) with an explicit event; no silent loss.

## 7. Access-control matrix
| Action | Role | Notes |
|---|---|---|
| Create market | Owner / factory role | via factory |
| Set LLTV/caps/IRM (risk ↑) | Underwriting Curator | timelocked |
| Set LLTV/caps (risk ↓) | Underwriting Curator | immediate allowed |
| Pause market / borrow | Sentinel | immediate risk reduction |
| Approve/revoke venue | KYC Operator | `setApprovedVenue` / `setBlocked` |
| Whitelist lender/borrower/liquidator | KYC Operator | existing `setWhitelist` + `setKycExpiry` |
| Set protocol fee | Owner | bounded |

## 8. Economic & security invariants
1. **USDC conservation:** `loanAsset.balanceOf(market) == totalSupplyAssets - totalBorrowAssets + accruedFeesUnclaimed` (within rounding).
2. **No undercollateralized borrow:** after any borrow/withdrawCollateral, `borrowValue ≤ lltvBps/1e4 * collateralValue`.
3. **Liquidation only when unhealthy:** `liquidate` reverts unless `borrowValue > liqLtvBps/1e4 * collateralValue`.
4. **Compliance custody:** only an `approvedVenue` can hold `nbUSDC`; only a whitelisted address can receive seized `nbUSDC`.
5. **Stale/paused NAV ⇒ freeze risk-up:** `borrow` and `withdrawCollateral` revert on `StalePrice`; `repay` and `supply`/`withdraw`(USDC) remain available; liquidation uses the guarded price.
6. **Liquidity bound:** lender `withdraw` ≤ free liquidity; cannot withdraw borrowed USDC.
7. **Rounding:** users get shares/collateral rounded down; debt/fees rounded up.
8. **Role separation:** Sentinel may pause/reduce risk but cannot move user funds; Curator bounded by caps + timelock.
9. **No `InsuranceVault` coupling:** the market never calls privileged vault functions; it only holds shares and reads NAV.

## 9. Position lifecycle / indexed states
`Supplied`, `CollateralPosted`, `Borrowed`, `Healthy`, `AtRisk` (approaching `liqLtv`), `Liquidatable`,
`Liquidated`, `Repaid`, `Closed`, `BadDebt`. Frontend/indexer must derive these from events + reads,
not from a single tx receipt.

## 10. Deployment & wiring — open questions (resolve in planning)
1. **Registry generation:** confirm we deploy a **fresh generation** (new `ComplianceRegistry` +
   new demo `InsuranceVault`) for the lending demo, vs. bridging the existing staging vault with
   `whitelist + max kycExpiry`. Recommended: fresh generation for a clean `approvedVenue` story;
   keep existing staging vault as-is.
2. **Factory role:** reuse `OWNER_ROLE` or add a dedicated `LENDING_FACTORY_ROLE` in `ProtocolRoles`.
3. **IRM shape & default params** (§6) — confirm numbers.
4. **`feeRecipient`** target (treasury Safe address).
5. **Lens integration:** extend `NextBlockLens` with read methods for market state (separate small task).

## 11. Testing plan (Foundry — mandatory)
- **Unit (`LendingMarket.t.sol`):** supply/withdraw, depositCollateral/withdrawCollateral, borrow/repay,
  accrue, liquidate happy + every revert (`MarketPaused`, `NotApprovedVenue`, `NotWhitelisted`,
  `HealthFactorTooLow`, `InsufficientLiquidity`, `StalePrice`, `CapExceeded`); events asserted.
- **Compliance tests:** non-approved venue cannot receive `nbUSDC`; non-whitelisted liquidator
  cannot seize; blocked venue/holder paths.
- **Oracle tests (`NavShareOracle.t.sol`):** decimals correctness, stale/paused propagation,
  `totalSupply==0` revert, cross-check vs `convertToAssets`.
- **Fuzz:** amounts, NAV values, utilization, LTV/rounding boundaries.
- **Invariant (`test/invariant/LendingMarketInvariants.t.sol`):** USDC conservation, no
  undercollateralized borrow, health post-liquidation, supply/borrow accounting, compliance custody.
- **Fork (`test/fork/LendingMarketFork.t.sol`):** Base Sepolia, pinned block, real wiring against a
  deployed vault generation.
- **CI:** `forge fmt --check`, `forge build --sizes`, `forge test -vvv`, invariant suite, gas snapshot.

## 12. Frontend (separate follow-up, not in this contracts spec)
A `LendingMarket` panel (borrow against nbUSDC) wired via `NextBlockLens`, role-aware, showing
health factor, LTV, available liquidity, interest, and compliance/whitelist status — consistent with
the existing institutional UI (no retail-gamified language).
