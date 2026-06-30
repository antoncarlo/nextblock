# NextBlock Indexer — RedemptionQueue subgraph

Event indexer for the LP exit lifecycle (Base Sepolia). Provides the **historical
series** the current-state UI cannot show: per-epoch settlement, individual
requests/claims, per-LP positions and a global rollup.

## What it indexes

`RedemptionQueue` at `0x243205af6C2a89C33c67f967901415C06F2a9cc0` (chain 84532):

- `RedemptionRequested` → `RedemptionRequest` + `Epoch.totalSharesRequested` + `LpPosition`
- `EpochSettled` → `Epoch.settled/settledShares/settledAssets/ratioBps` + global rollup
- `RedemptionClaimed` → `RedemptionClaim` + `LpPosition.totalAssetsClaimed/SharesReturned`
- `PausedSet` → `ProtocolStat.paused`

Entities: `Epoch`, `RedemptionRequest`, `RedemptionClaim`, `LpPosition`, `ProtocolStat`
(see `schema.graphql`).

## Deploy (owner-gated — needs a Goldsky or Graph Studio account)

```bash
cd indexer
npm install
npm run codegen   # generates ./generated from the ABI + schema
npm run build
# Goldsky:
goldsky subgraph deploy nextblock-redemption/v1 --path .
# or Graph Studio:
npm run deploy:studio
```

Wire the resulting GraphQL endpoint into the frontend (e.g. `NEXT_PUBLIC_SUBGRAPH_URL`)
to power historical charts; the contract reads remain the source of truth for current state.

## Extending

Add the InsuranceVault as a second `dataSource` (Deposit/Withdraw + NavOracle
`NavPublished`) to build the NAV-per-share time series. The mapping pattern
(additive accumulation into a singleton rollup) is the same.
