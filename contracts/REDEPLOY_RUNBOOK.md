# Redeploy runbook — Base Sepolia (real-spine generation)

**Why.** The staging contracts on Base Sepolia predate the real-spine work on
`main`: the deployed `PolicyRegistry` has no `lockRealTime()` (verified on
2026-07-03 — `clockLocked()` reverts on `0x2Bf1…f1a2`) and the deployed
`VaultAllocator` still carries the removed demo split, and the redemption
queue is bound to a vault holding zero shares, which is why withdrawals fail.
A truthful (re)insurance test needs a fresh generation and governance moved
off the deployer EOA. The one-way real-time lock comes later, on purpose —
see section 2.

**Who runs this.** The OWNER, with the deployer key. The key is entered only
in the owner's own terminal/UI — it must never transit assistant tooling,
chats, or files in this repo. All commands below run from `contracts/`.

---

## 0. Preflight (no key needed)

```bash
forge build                 # compiles clean on main
forge test                  # 591 passed / 0 failed expected
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
# Role addresses. Every one of them defaults to the deployer, so leaving them
# unset puts EVERY role on a single key. That deployment is not merely untidy:
# it makes every separation-of-duty check in the protocol pass while proving
# nothing, because there is no separation left to violate. The invariant suite
# will report green against it. Set all eight, or know exactly why you are not.
export OWNER_ADDRESS=<safe or governance>
export CURATOR_ADDRESS=<underwriting curator>   # also authorises VaultFactory.createVault
export ALLOCATOR_ADDRESS=<allocator>
export SENTINEL_ADDRESS=<sentinel>
export COMMITTEE_ADDRESS=<claims committee>
export KYC_OPERATOR_ADDRESS=<kyc operator>
export ORACLE_ADDRESS=<oracle node>
export CEDANT_ADDRESS=<first cedant>
# optional: REDEMPTION_EPOCH_SECONDS (default 7 days, bounds [1h, 90d])

forge script script/DeployRedemptionQueue.s.sol \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --broadcast
```

Record the printed `queue:` address.

## 2. Do NOT lock real time yet

`lockRealTime()` is **irreversible** and belongs at the end of the
demonstration phase, not here. Locking it now costs the ability to show the
protocol working end to end, and buys nothing that cannot be bought later
with one transaction.

What the mutable clock actually governs is narrow. Only `InsuranceVault` and
`PolicyRegistry` read `registry.currentTime()`; everything else already runs
on `block.timestamp` and is unaffected either way — claim dispute windows,
NAV staleness, KYC expiry, redemption epochs, portfolio expiry. Inside those
two it governs exactly three things:

| Governed by the mutable clock | Consequence of locking |
|---|---|
| Premium earning (UPR recognition) | a six-month treaty takes six months to earn |
| Management fee accrual | fees accrue in real time |
| Policy expiry | policies expire on the wall clock |

Those three are what turn a received premium into visible yield. With the
clock locked, a day of staging moves the NAV in the fourth decimal, and two
asset managers stay indistinguishable for weeks — the platform is alive and
looks frozen.

With it unlocked, one transaction takes a portfolio through its whole life:
premium fully earned, fees accrued, policy expired, capacity released, LPs
redeeming against a return you can read. The numbers are produced by the
real protocol; only the clock moved.

**The limit is what those numbers may be called.** An owner who can move the
clock can move the earnings, so nothing produced in this phase is a track
record and none of it may be shown to an investor as one. It is an
engineering instrument for finding faults, and that is all it is.

Lock it when the numbers have convinced you and you want them to become
evidence:

```bash
POLICY_REGISTRY=$(python -c "import json;print(json.load(open('deployments/84532-staging.json'))['policyRegistry'])")

cast send "$POLICY_REGISTRY" "lockRealTime()" \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"

# verify — must print true; advanceTime() reverts forever after this
cast call "$POLICY_REGISTRY" "clockLocked()(bool)" --rpc-url "$BASE_SEPOLIA_RPC_URL"
```

After that, premium earning, UPR, fee accrual and policy expiry run on the
real block clock and nobody — the owner included — can fast-forward.

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

## 3b. (Optional) Provision capacity a syndicate can claim

Every vault the deploy script creates already has its syndicate. To have a
vault appear under **Vaults awaiting curation** — the take-over surface — the
owner provisions one with no manager. It accepts capital immediately but no
policy can be written to it until a syndicate is appointed.

```bash
VAULT_FACTORY=$(python -c "import json;print(json.load(open('deployments/84532-staging.json'))['vaultFactory'])")

cast send "$VAULT_FACTORY" \
  "createUnassignedVault(string,string,string,uint256,uint256)" \
  "NextBlock Open Capacity" "nxbOPEN" "Open Capacity" 2000 0 \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"
```

Appointment is a separate, owner-gated, **one-way** call — an incumbent
syndicate is never displaced:

```bash
cast send <vault> "assignSyndicate(address)" <syndicate> \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"

cast call <vault> "isAwaitingCuration()(bool)" --rpc-url "$BASE_SEPOLIA_RPC_URL"  # false after
```

In the app, a Syndicate does not run this: it presses **Request curation**,
which hands the encoded operation to the governance console for the owner to
schedule through the Safe.

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

# Expected FALSE at this stage: the clock stays movable through the
# demonstration phase and is locked deliberately afterwards (section 2).
cast call "$POLICY_REGISTRY" "clockLocked()(bool)" --rpc-url "$BASE_SEPOLIA_RPC_URL"
```

UI: connect as admin → /app/admin shows the new lens status; an LP deposit +
redemption request against the new queue completes the loop.

---

**Failure modes.** Deploy script reverts → nothing to clean, rerun (fresh
generation each time, chain-guarded to 84532). Lock reverts with
`PolicyRegistry__ClockLocked` → already locked (idempotence guard, fine).
GovernanceCheck red → do NOT renounce the deployer; fix grants first.
