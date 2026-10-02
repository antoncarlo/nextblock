# Redeploy runbook — Base Sepolia (separated-roles generation)

**Why.** The staging contracts on Base Sepolia are the generation broadcast on
2026-06-10. They predate the real-spine work and every fix in the internal
security review: claims are not bound to the vault that underwrites them
(F-07), `ClaimReceipt` sits outside governance (F-08), a vault can be created
with no claim manager and then cannot pay (F-09), `PolicyRegistry` has no
`lockRealTime()`, and the redemption queue is bound to a vault holding zero
shares, which is why withdrawals fail. None of that can be repaired in place:
the bindings are immutable. A truthful test needs a fresh generation.

**Status.** Executed on 2026-10-01: sections 1 to 5 are done on Base Sepolia (deployer
`0x090043bF030C12d8761441790EB2CF81F0eDcf2c`, governance Safe
`0x0969B20f1d8a5628613f00fa6aDBE85e715fEf15`, the lending layer of section 2b included).
Section 6 (`lockRealTime`) is deliberately still open. The sequence is kept because the
next generation will follow it.

**Who runs this.** The OWNER, with the deployer key. The key is entered only in
your own terminal. It must never be pasted into a chat, an assistant tool, or a
file in this repo. Everything below runs from `contracts/` unless it says
otherwise.

**This sequence has been rehearsed.** `scripts/rehearse-redeploy.sh` runs every
step below against a local fork of Base Sepolia, with throwaway test keys, and
asserts the on-chain end state after each one (47 checks). Run it first; it takes
a couple of minutes and it is the quickest way to see that your toolchain, your
RPC and the scripts agree. Where this document and the rehearsal disagree, the
rehearsal is right and the document is the bug.

---

## 0. Preflight (no key needed)

Use the Foundry release CI pins: **1.8.3** (`foundryup --install v1.8.3`).
Gas figures and fuzz behaviour differ between releases, and the gas snapshot is
valid only for the release that produced it.

```bash
forge --version                              # 1.8.3
forge build
forge fmt --check
forge test                                   # all green
cd .. && bash scripts/rehearse-redeploy.sh   # "REHEARSAL PASSED"
cd contracts
```

## 1. Decide the eight role addresses

The deploy takes **addresses**, never keys, for every role. Only the deployer key
is used. Decide these before you start; they cannot be changed except through
governance afterwards.

| Variable | Role it receives | Notes |
|---|---|---|
| `OWNER_ADDRESS` | `OWNER_ROLE` | The Safe, or an owner account. The deployer also keeps `OWNER_ROLE` until phase 2 of governance. |
| `CURATOR_ADDRESS` | `UNDERWRITING_CURATOR_ROLE` | Authorises `createVault`; also the first vault's syndicate. |
| `ALLOCATOR_ADDRESS` | `ALLOCATOR_ROLE` | The allocator bot and the redemption keeper. |
| `SENTINEL_ADDRESS` | `SENTINEL_ROLE` | Pause, freeze, challenge. Cannot move funds. |
| `COMMITTEE_ADDRESS` | `CLAIMS_COMMITTEE_ROLE` | Claim quorum. |
| `KYC_OPERATOR_ADDRESS` | `KYC_OPERATOR_ROLE` | Whitelist and venue approvals. |
| `ORACLE_ADDRESS` | `ORACLE_ROLE` | NAV and event publisher. |
| `CEDANT_ADDRESS` | `AUTHORIZED_CEDANT_ROLE` | First authorised cedant. |

**All seven operational roles must differ from the deployer.** On Base Sepolia the
script refuses to run when any of them is unset or equals the deployer
(`DeployStack__RoleNotSeparated(<VARIABLE>)`), because every role defaults to the
deployer and a deployment like that passes every separation-of-duty check while
proving nothing — there is no separation left to violate. `OWNER_ADDRESS` is
exempt. To deploy single-key on purpose, set `ALLOW_SINGLE_KEY=true`, and know
that you are then testing nothing about role separation.

**The settlement asset is a real USDC.** `USDC_ADDRESS` must name a deployed token: Circle's
USDC on Base Sepolia, `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals; testnet USDC
comes from faucet.circle.com). The script refuses to run on Base Sepolia without it
(`DeployStack__MockAssetOnSharedChain`, `ALLOW_MOCK_USDC=true` is the explicit opt-out for a
throwaway deployment), and refuses an address with nothing deployed behind it
(`DeployStack__AssetNotDeployed`) instead of deploying a MockUSDC in its place. The asset is fixed
inside every vault, so changing it means a new generation. A real USDC can blacklist addresses,
which the mock cannot; the fork test `RealUsdcFork` runs a deposit and an instant redemption
against it.

The deployer needs Base Sepolia ETH: the deploy costs about 50M gas, roughly
0.0006 ETH at current prices. Fund it with 0.01 ETH to leave room for the
governance transactions.

## 2. Deploy the new generation (one command)

`DeployRedemptionQueue.s.sol` runs a fresh `DeployStack` (roles, compliance,
registries, oracles, distributor, allocator, factory, vault, lens), deploys the
`RedemptionQueue` on top, and approves the queue as a custody venue. The deployer
borrows `KYC_OPERATOR_ROLE` for that one approval and gives it back, and gives
back the curator role it needs to create the first vault, so the finished
deployment holds exactly the roles you configured.

The addresses chosen for the 2026-10-01 testnet generation are in
`redeploy.roles.env` (addresses only, no keys): the governance Safe as owner and the
simulation identities from `packages/sim/wallets/keys.map.json` for the seven operational
roles. That file was exercised on a fork end to end. Load it, then add the deployer key
yourself:

```bash
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
set -a; . ./redeploy.roles.env; set +a
export PRIVATE_KEY=<deployer key — your terminal only>
# optional: REDEMPTION_EPOCH_SECONDS (default 7 days, bounds [1h, 90d])

forge script script/DeployRedemptionQueue.s.sol \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --broadcast
```

The script simulates the whole run before it sends anything, so a revert leaves
nothing deployed — fix the cause and rerun. Each run deploys a fresh generation;
it is not idempotent. It refreshes `deployments/84532-staging.json`.

**Record the printed `queue:` address.** It is not in the deployment record (the
queue is deployed after the record is written); you need it in section 7.

## 2b. The lending layer (before governance phase 2)

`DeployLendingLayer.s.sol` adds the permissioned lending layer to the generation you just
deployed: a `LendingMarketFactory`, one `LendingMarket` whose collateral is the generation's
vault, and the venue approval that lets the market custody nbUSDC. It reads the generation from
the deployment record and sends the protocol fee to `FEE_RECIPIENT`, which should be the
governance Safe. (`DeployLendingMarket.s.sol` deploys a whole new generation first; it is for
local chains.)

`createMarket` needs `UNDERWRITING_CURATOR_ROLE` and the venue approval needs
`KYC_OPERATOR_ROLE`. In a separated deployment the deployer holds neither, so it borrows what
it lacks through `OWNER_ROLE` and gives it back, like section 2 does. **That is why this runs
before phase 2**: afterwards the deployer has no `OWNER_ROLE`, and the script stops with
`DeployLendingLayer__CannotBorrowRoles` before sending anything.

```bash
export FEE_RECIPIENT=<governance Safe>
forge script script/DeployLendingLayer.s.sol --rpc-url "$BASE_SEPOLIA_RPC_URL" --broadcast
```

It records `lendingFactory` and `lendingMarket` in the deployment record. The market has no
price for its collateral until a NAV is published for the vault, so it stays dormant until the
oracle node publishes one.

## 3. Governance phase 1 — timelock and Safe

Deploys `ProtocolTimelock` with the Safe as proposer and canceller, and grants it
`OWNER_ROLE` and `DEFAULT_ADMIN_ROLE`. The deployer keeps its roles for now.
The protocol Safe is `0x0969B20f1d8a5628613f00fa6aDBE85e715fEf15` (Safe 1.5.0, one signer,
threshold 1, created 2026-10-01; a transaction signed and executed from it was confirmed on-chain).
It replaces the Safe `0x8Fd8…F870` of the June generation, which is 2-of-2 and cannot be recovered
without the second signer. Nothing in the protocol is tied to it: the Safe only enters the picture as
the timelock's proposer, in this section.

```bash
export PROTOCOL_ROLES=$(node -p "require('./deployments/84532-staging.json').protocolRoles")
export SAFE_ADDRESS=0x0969B20f1d8a5628613f00fa6aDBE85e715fEf15
export EXECUTOR_ADDRESS=<safe or ops executor>
export MIN_DELAY=86400            # 1 day; raise for mainnet
export RENOUNCE_DEPLOYER=false

forge script script/GovernanceMigration.s.sol \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY" --broadcast
```

`--private-key` is required here: this script opens its broadcast without naming a
key, and without the flag forge signs as its default sender, which holds no role
(`AccessControlUnauthorizedAccount`). Phase 1 writes `protocolTimelock` and `safe`
into the deployment record itself; `GovernanceCheck` and the address book both need
them.

```bash
forge script script/GovernanceCheck.s.sol --rpc-url "$BASE_SEPOLIA_RPC_URL"   # report
```

## 4. Rehearse one timelocked operation

Phase 2 is irreversible, and it refuses to run until a real operation has gone
through the timelock end to end. Pick a harmless one — granting a role the holder
already has will do — and run it through the Safe:

```bash
TL=$(node -p "require('./deployments/84532-staging.json').protocolTimelock")
ROLES=$PROTOCOL_ROLES
ROLE=$(cast call "$ROLES" "ORACLE_ROLE()(bytes32)" --rpc-url "$BASE_SEPOLIA_RPC_URL")
DATA=$(cast calldata "grantRole(bytes32,address)" "$ROLE" "$ORACLE_ADDRESS")
ZERO=0x0000000000000000000000000000000000000000000000000000000000000000
SALT=0x0000000000000000000000000000000000000000000000000000000000000001

# the id you will need in section 5
cast call "$TL" "hashOperation(address,uint256,bytes,bytes32,bytes32)(bytes32)" \
  "$ROLES" 0 "$DATA" $ZERO $SALT --rpc-url "$BASE_SEPOLIA_RPC_URL"

# calldata for the Safe to send to $TL (target = $TL, value = 0):
cast calldata "schedule(address,uint256,bytes,bytes32,bytes32,uint256)" \
  "$ROLES" 0 "$DATA" $ZERO $SALT 86400
```

Send that calldata from the Safe. After `MIN_DELAY`, the executor sends:

```bash
cast calldata "execute(address,uint256,bytes,bytes32,bytes32)" "$ROLES" 0 "$DATA" $ZERO $SALT
cast call "$TL" "isOperationDone(bytes32)(bool)" <operation id> --rpc-url "$BASE_SEPOLIA_RPC_URL"   # true
```

## 5. Governance phase 2 — the deployer renounces

IRREVERSIBLE for the deployer key. Run it only after section 4 shows `true`.

```bash
export RENOUNCE_DEPLOYER=true
export TIMELOCK_ADDRESS=$TL
export RETIRING_KEY=<deployer address>
export REHEARSAL_OPERATION_ID=<operation id from section 4>

forge script script/GovernanceMigration.s.sol \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY" --broadcast
```

The script checks, before it opens any broadcast, that the timelock holds both
roles, that the deployer holds none of the seven operational roles ("Stage A" — a
deployment made by section 2 satisfies this by construction), and that
`REHEARSAL_OPERATION_ID` is a done operation on this timelock. Any of them failing
stops it with a message and changes nothing.

## 6. Do NOT lock real time yet

`lockRealTime()` is **irreversible** and belongs at the end of the demonstration
phase, not here. Locking it now costs the ability to show the protocol working end
to end, and buys nothing that cannot be bought later with one transaction.

What the mutable clock governs is narrow. Only `InsuranceVault` and
`PolicyRegistry` read `registry.currentTime()`; everything else already runs on
`block.timestamp` — claim dispute windows, NAV staleness, KYC expiry, redemption
epochs, portfolio expiry. Inside those two it governs exactly three things:

| Governed by the mutable clock | Consequence of locking |
|---|---|
| Premium earning (UPR recognition) | a six-month treaty takes six months to earn |
| Management fee accrual | fees accrue in real time |
| Policy expiry | policies expire on the wall clock |

**The limit is what those numbers may be called.** An owner who can move the clock
can move the earnings, so nothing produced while it is movable is a track record and
none of it may be shown to an investor as one. It is an engineering instrument for
finding faults, and that is all it is. Lock it when you want the numbers to become
evidence. `lockRealTime()` is `OWNER_ROLE`-gated. After phase 2 that role is held by
`OWNER_ADDRESS` and by the timelock and no longer by the deployer, so send it from the
owner account (`--interactive` prompts for the key instead of putting it in your shell
history), or schedule it through the timelock if you want the delay:

```bash
POLICY_REGISTRY=$(node -p "require('./deployments/84532-staging.json').policyRegistry")
cast send "$POLICY_REGISTRY" "lockRealTime()" --rpc-url "$BASE_SEPOLIA_RPC_URL" --interactive
cast call "$POLICY_REGISTRY" "clockLocked()(bool)" --rpc-url "$BASE_SEPOLIA_RPC_URL"   # true afterwards
```

## 6b. (Optional) Provision capacity a syndicate can claim

Every vault the deploy script creates already has its syndicate. To have a vault
appear under **Vaults awaiting curation** — the take-over surface — provision one
with no manager. It accepts capital immediately but no policy can be written to it
until a syndicate is appointed.

`createUnassignedVault` is `OWNER_ROLE`-gated, like `assignSyndicate`:

```bash
VAULT_FACTORY=$(node -p "require('./deployments/84532-staging.json').vaultFactory")
cast send "$VAULT_FACTORY" \
  "createUnassignedVault(string,string,string,uint256,uint256)" \
  "NextBlock Open Capacity" "nxbOPEN" "Open Capacity" 2000 0 \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --interactive      # from OWNER_ADDRESS
```

Appointment is a separate, owner-gated, **one-way** call — an incumbent syndicate is
never displaced: `assignSyndicate(address)`. In the app a syndicate presses **Request
curation**, which hands the encoded operation to the governance console for the owner
to schedule through the Safe.

## 7. Ship the frontend

The ABIs in `app/src/config/contracts.ts` are generated from the contracts and CI
fails if they drift (`npm run check:abis`; fix with `npm run codegen:abis`). The
address book is generated from the deployment record:

```bash
cd .. && npm run codegen:addressbook && npm run check:addressbook
```

Commit `contracts/deployments/84532-staging.json`, `contracts/broadcast/**` and
`app/src/config/generated/addressBook.ts` on a branch → PR → merge (auto-deploys).

| Where | What |
|---|---|
| Vercel env | `NEXT_PUBLIC_REDEMPTION_QUEUE_ADDRESS` = the queue address recorded in section 2, then redeploy |
| Vercel env | `NEXT_PUBLIC_LENDING_MARKET_ADDRESS` = `lendingMarket` from the deployment record (section 2b) |
| GitHub repo var | `REDEMPTION_QUEUE_ADDRESS` (redemption-keeper workflow) = the same address |
| GitHub secret | `CRON_SECRET` = same value as the Vercel env (arms `scheduled-jobs.yml`) |
| Keeper keys | the allocator and oracle accounts from section 1 run the keepers; their keys live in their own environments |
| Goldsky | re-point the subgraph at the new addresses and start block |

The previous generation stays on-chain and keeps working for whoever holds
positions in it, but nothing migrates: new deposits, vaults and claims start from
zero. On a testnet with MockUSDC that is the point.

## 8. Smoke (no key needed)

```bash
forge script script/SanityCheck.s.sol --rpc-url "$BASE_SEPOLIA_RPC_URL"

cast call "$POLICY_REGISTRY" "clockLocked()(bool)" --rpc-url "$BASE_SEPOLIA_RPC_URL"   # false until you lock it
```

UI: connect as the owner → `/app/admin` shows the new lens status; an LP deposit and
a redemption request against the new queue complete the loop.

---

**Failure modes.**
- Deploy script reverts → nothing was sent (it simulates first). Read the error and rerun.
- `DeployStack__RoleNotSeparated(NAME)` → that role variable is unset or equals the deployer.
- `AccessControlUnauthorizedAccount` on governance phase 1 → `--private-key` was left out.
- `GovernanceCheck` cannot find `.protocolTimelock` → phase 1 has not run on this record.
- Phase 2 stops with `Stage A incomplete: deployer still <ROLE>` → grant that role to its
  intended holder and revoke it from the deployer, through governance; do not renounce.
- Phase 2 stops with `rehearsal not executed` → section 4 has not completed; wait out the delay.
- `lockRealTime` reverts with `PolicyRegistry__ClockLocked` → already locked (idempotence guard, fine).
