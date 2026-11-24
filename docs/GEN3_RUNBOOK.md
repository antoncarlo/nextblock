# Generation 3 runbook (Base Sepolia staging)

Branch `feat/gen3-prep`. Nothing here has been deployed. Every step that sends a transaction needs the owner's authorisation and the deployer key, and the ones marked OWNER are not done by the code.

## 1. What the branch contains

| Item | State |
|---|---|
| `MockOracle` removed from vault, factory, scripts, tests | Done, pinned by `Gen3NoMockOracle.t.sol` |
| OpenZeppelin Contracts 5.7.0 | Done, 725 tests green before the new ones |
| UMA bordereau | Already deployed by `DeployStack` when a real USDC is configured; goes live at the redeploy |
| `SeedVault.s.sol` (first test capital) | Done, 8 unit tests; fork dry run not done |
| Protocol NAV from on-chain data, nav keeper `NAV_SOURCE=protocol` | Done, 16 smoke checks |
| Redeploy, seed, first NAV publication | Not done, needs the owner |

## 2. Blocked: real USDC for the seed

Reality gate: no mock asset in `src/`, `script/` or the deployed stack. The vault settles in Circle's USDC on Base Sepolia (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`), the same asset the current staging stack uses, and UMA bonds in the same asset (its whitelist accepts it).

`Blocked: 100,000+ USDC on Base Sepolia | needed to seed the vault | Circle: Circle's faucet pays 20 USDC per address every 2 hours, a larger allocation is requested in Circle's Discord and sent to the LP address.` Until it arrives the seed can run for the amount held (`SEED_USDC`), nothing is minted or simulated.

## 3. Redeploy (OWNER)

```
cd contracts
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e \
  forge script script/DeployStack.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast
```

With a real USDC configured on Base Sepolia, `DeployStack` deploys the UMA-backed bordereau (bond 10 USDC by default, `BORDEREAU_BOND` to change; the deployer must hold the bond). Then regenerate the address book and ABIs, repoint the subgraph and move governance to the timelock as in the previous generation. Operational roles stay as deployed.

## 4. Seed (OWNER)

```
SEED_USDC=120000000000 SEED_GRANT_KYC=true PRIVATE_KEY=$LP_KEY \
  forge script script/SeedVault.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast
```

`SEED_GRANT_KYC=true` works only if the broadcaster holds the KYC operator role (staging only). Default 120,000 USDC, ceiling 1,000,000 (6 decimals). Not verified on a Base Sepolia fork yet.

## 5. NAV without Braino (OWNER)

Set the GitHub variable `NAV_SOURCE=protocol`, add a dedicated `ORACLE_PRIVATE_KEY` (ORACLE_ROLE only) and the RPC secret. The nav keeper then publishes `InsuranceVault.totalAssets` with confidence 10000 and an evidence hash of the inputs. This is a book value (balance less unearned premiums, pending claims and accrued fees). It is not an actuarial valuation and must be labelled as such until Braino is back. An empty vault is skipped, so seed first.

## 6. Not decided or not available

- Underlying risk and the test portfolio: to be supplied by the owner.
- KYC and KYB provider: see the recommendation in the session notes (Didit for KYC and basic KYB on a free tier, to be confirmed on its pricing page before integration).
