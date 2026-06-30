# NextBlock — Money Flow Ledger (current-state) — Design Spec

- **Author:** Anton Carlo Santoro
- **Date:** 2026-06-16
- **Status:** Draft — pending owner review
- **Branch:** `feat/money-flow-ledger`
- **Maps to:** Figma module 06 — Money Flow (Manus roadmap Phase 2), current-state scope.

## 1. Goal & context

The protocol already exposes all Money-Flow data on-chain via `NextBlockLens`
(`VaultDashboardView`, `PremiumDashboardView`, `LPStatusView`). The gap (per the
Manus roadmap) is that these values are scattered across vault/manage pages and
do not form a **coherent Money Flow view** aligned to the Figma cards. This spec
adds a unified, presentation-layer Money Flow dashboard + a per-LP investor
statement, derived from the existing canonical read model — **no new on-chain
accounting, no contract redeploy, no indexer**.

## 2. Scope

### In scope
- A **pure derivation library** mapping existing Lens fields to the Figma Money
  Flow cards (SPV Calculation, % Buffer, % Flag/Protocol, Investor Vault, Claim
  Payment, Protocol Fee).
- A **Money Flow dashboard** (role-aware: curator/admin) at `/app/money-flow`.
- A **per-LP investor statement** (current position + NAV/share + withdrawable +
  risk disclaimer) on the vault detail / investor view.
- Smoke tests for the pure lib; `tsc` + eslint + `next build` green.

### Out of scope (explicit)
- Historical ledger / event timeline (deposits, premiums, claims, payouts, fee
  accrual over time) — requires an **event indexer** (separate Data Flow workstream).
- Realized yield / P&L history / LP cost basis — needs the indexer.
- Any contract change or redeploy; any new on-chain accounting.

## 3. Approach (confirmed: ① frontend pure-lib)

Canonical data stays on-chain (the Lens). A pure TS lib performs only display
derivation/aggregation. Mirrors the lending UI pattern (pure `lib/` + hook +
component + smoke). No `NextBlockLens` redeploy.

## 4. Components (frontend)

### 4.1 `app/src/lib/moneyflow.ts` (pure)
Input: the raw fields from `VaultDashboardView` + premium/fee fields. Output: a
`MoneyFlowView` with the Figma cards. All arithmetic on `bigint`; percentages in bps.

| Card | Derivation |
|---|---|
| **SPV Calculation** | Vault NAV `totalAssets` with breakdown: `balance − unearnedPremiums − pendingClaims − accumulatedFees`. |
| **% Buffer** | current `availableBuffer × 10_000 / totalAssets` (bps); target `bufferRatioBps`. |
| **% Flag/Protocol** | `protocolFeeBps` (protocol take on premium). |
| **Investor Vault** | `totalAssets`, `totalShares`, `sharePrice` (LP capital pool + NAV/share). |
| **Claim Payment** | `pendingClaims` (claim reserve currently held). Historical payouts deferred (indexer). |
| **Protocol Fee** | `accruedProtocolFees` (distributor, unclaimed) + `accumulatedFees` (vault management fee). |

Pure helpers: `deriveMoneyFlow(input)`, `bpsToPct(bps)`, guards for `totalAssets == 0`
(avoid div-by-zero → 0%).

### 4.2 `app/src/hooks/useMoneyFlow.ts`
Reads `NextBlockLens.getVaultDashboard(vault)` (and distributor-wide premium fields
via `getPremiumDashboard` or the distributor) through wagmi `useReadContracts`,
feeds `deriveMoneyFlow`. Returns `{ available, view }`; `available=false` when the
Lens/vault read is unavailable (mirrors existing `useNextBlockLens` pattern).

### 4.3 `app/src/components/moneyflow/MoneyFlowDashboard.tsx`
Role-aware card dashboard aligned to the Figma layout, each card showing its value +
breakdown, with a `DataSourceBadge` (on-chain). Institutional copy (no retail
gamification). "Unavailable on this chain" state when reads fail.

### 4.4 `app/src/components/moneyflow/InvestorStatement.tsx`
Per-LP statement from `LPStatusView`: `shareBalance`, NAV/share (`sharePrice`),
current `assetValue` (USDC), `maxWithdraw` (withdrawable now), compliance status,
and the canonical `SHARE_DISCLAIMER`. Explicit note that realized-yield/withdrawal
history is not shown in the current-state view (pending the ledger).

### 4.5 Route + nav
`/app/money-flow` page rendering `MoneyFlowDashboard` (curator/admin role-gated via
existing `useProtocolAccess`/`useWalletRole`). `InvestorStatement` mounted on the
vault detail / investor view. Optional nav link (follow the Header pattern).

## 5. Data flow
`NextBlockLens` (on-chain, canonical) → `useMoneyFlow` (wagmi reads) →
`deriveMoneyFlow` (pure) → `MoneyFlowDashboard` / `InvestorStatement` (render).
No write path. No backend. No indexer.

## 6. Testing
- `app/scripts/moneyflow-smoke.ts` (node strip-types): unit-tests `deriveMoneyFlow`
  on representative inputs incl. zero-asset / zero-supply boundaries and bps rounding.
- `tsc --noEmit`, eslint (0 errors), `next build` (route emitted).

## 7. Honest limitations
- Current-state only: no time series, no realized yield, no historical claim payouts
  or fee-accrual timeline. Those need the event indexer (Data Flow workstream).
- "Claim Payment" shows the current reserve, not cumulative paid claims.
- Numbers are read live from the Lens; if the Lens/vault is unavailable the dashboard
  shows an explicit unavailable state rather than fabricated values.
