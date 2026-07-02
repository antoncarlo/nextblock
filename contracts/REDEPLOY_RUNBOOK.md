# Redeploy runbook — Base Sepolia (real-spine generation)

**Why.** The staging contracts on Base Sepolia predate the real-spine work on
`main`: the deployed `PolicyRegistry` has no `lockRealTime()` (verified on
2026-07-03 — `clockLocked()` reverts on `0x2Bf1…f1a2`) and the deployed
`VaultAllocator` still carries the removed demo split. A truthful
(re)insurance test needs a fresh generation, the one-way real-time lock, and
governance moved off the deployer EOA.

**Who runs this.** The OWNER, with the deployer key. The key is entered only
in the owner's own terminal/UI — it must never transit assistant tooling,
chats, or files in this repo. All commands below run from `contracts/`.

---

## 0. Preflight (no key needed)

```bash
forge build                 # compiles clean on main
forge test                  # 558 passed / 0 failed expected
forge fmt --check           # no drift
```

Current staging generation (being replaced): see `deployments/84532-staging.json`.

## 1. Deploy the new generation (ONE command)

`DeployRedemptionQueue.s.sol` internally runs a fresh `DeployStack` (roles,
compliance, timelock, registries, oracles, distributor, allocator, factory,
vault, lens) and deploys the RedemptionQueue on top, then approves the queue
as custody venue. `WRITE_DEPLOYMENT_JSON` (default true) refreshes
`deployments/84532-staging.json`.

```bash
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
export PRIVATE_KEY=<deployer key — owner terminal only>
# optional role addresses (default: deployer): OWNER_ADDRESS, CURATOR_ADDRESS,
# SENTINEL_ADDRESS, COMMITTEE_ADDRESS, ALLOCATOR_ADDRESS, ORACLE_ADDRESS
# optional: REDEMPTION_EPOCH_SECONDS (default 7 days, bounds [1h, 90d])

forge script script/DeployRedemptionQueue.s.sol \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --broadcast
```

Record the printed `queue:` address.

## 2. Lock real time (one-way — the truthful-test switch)

```bash
POLICY_REGISTRY=$(python -c "import json;print(json.load(open('deployments/84532-staging.json'))['policyRegistry'])")

cast send "$POLICY_REGISTRY" "lockRealTime()" \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"

# verify — must print true; advanceTime() now reverts forever
cast call "$POLICY_REGISTRY" "clockLocked()(bool)" --rpc-url "$BASE_SEPOLIA_RPC_URL"
```

After this, premium earning / UPR / fee accrual / policy expiry run on the
real block clock; nobody (owner included) can fast-forward.

## 3. Governance migration (Safe + timelock)

Moves role admin off the deployer EOA. Safe already exists:
`0x8Fd8b45Ba2612E7535bbeB21615554701CfaF870` (see deployment json).

```bash
export PROTOCOL_ROLES=<from deployment json>
export TIMELOCK_ADDRESS=<from deployment json>
export SAFE_ADDRESS=0x8Fd8b45Ba2612E7535bbeB21615554701CfaF870
export EXECUTOR_ADDRESS=<safe or ops executor>
export MIN_DELAY=86400            # 1 day; raise for mainnet
export RENOUNCE_DEPLOYER=false    # keep the EOA as fallback on testnet first

forge script script/GovernanceMigration.s.sol \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --broadcast

forge script script/GovernanceCheck.s.sol --rpc-url "$BASE_SEPOLIA_RPC_URL"
```

Run again later with `RENOUNCE_DEPLOYER=true` once the Safe flow is rehearsed.

## 4. Regenerate the frontend addressbook + ship it

```bash
cd .. && npm run codegen:addressbook && npm run check:addressbook
```

Commit `contracts/deployments/84532-staging.json`,
`contracts/broadcast/**` and `app/src/config/generated/addressBook.ts` on a
branch → PR → merge (auto-deploys the frontend).

## 5. Post-deploy wiring (owner UIs)

| Where | What |
|---|---|
| Vercel env | `NEXT_PUBLIC_REDEMPTION_QUEUE_ADDRESS` = new queue address, then redeploy |
| GitHub repo var | `REDEMPTION_QUEUE_ADDRESS` (redemption-keeper workflow) = new queue |
| GitHub secret | `CRON_SECRET` = same value as the Vercel env (arms `scheduled-jobs.yml`) |
| Goldsky | re-point the subgraph at the new queue address + start block |

## 6. Smoke (no key needed)

```bash
forge script script/SanityCheck.s.sol --rpc-url "$BASE_SEPOLIA_RPC_URL"
cast call "$POLICY_REGISTRY" "clockLocked()(bool)" --rpc-url "$BASE_SEPOLIA_RPC_URL"   # true
```

UI: connect as admin → /app/admin shows the new lens status; an LP deposit +
redemption request against the new queue completes the loop.

---

**Failure modes.** Deploy script reverts → nothing to clean, rerun (fresh
generation each time, chain-guarded to 84532). Lock reverts with
`PolicyRegistry__ClockLocked` → already locked (idempotence guard, fine).
GovernanceCheck red → do NOT renounce the deployer; fix grants first.
