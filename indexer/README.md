# NextBlock Indexer — RedemptionQueue subgraph

Event indexer for the LP exit lifecycle (Base Sepolia). Provides the **historical
series** the current-state UI cannot show: per-epoch settlement, individual
requests/claims, per-LP positions and a global rollup.

## What it indexes

`RedemptionQueue` of the current Base Sepolia generation (chain 84532; the addresses and
start blocks of every data source are in `subgraph.yaml`, re-pointed on 2026-10-01):

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
# Goldsky (needs the Goldsky CLI and `goldsky login`):
npm run deploy:goldsky
# or Graph Studio:
npm run deploy:studio
```

A Goldsky version name cannot be redeployed, and a new contract generation changes every
address, so bump the version in `package.json` (`deploy:goldsky`) whenever the manifest is
re-pointed. The endpoint it prints goes in the frontend variable
`NEXT_PUBLIC_PROTOCOL_SUBGRAPH_URL`.

Wire the resulting GraphQL endpoint into the frontend (e.g. `NEXT_PUBLIC_SUBGRAPH_URL`)
to power historical charts; the contract reads remain the source of truth for current state.

## Extending

Add the InsuranceVault as a second `dataSource` (Deposit/Withdraw + NavOracle
`NavPublished`) to build the NAV-per-share time series. The mapping pattern
(additive accumulation into a singleton rollup) is the same.
