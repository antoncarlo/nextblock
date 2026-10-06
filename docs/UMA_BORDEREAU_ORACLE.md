# UmaBordereauOracle

The bordereau oracle with real bonds behind it. This page says what the contract is, what it guarantees, what can go wrong, and how to put it on Base Sepolia.

## What it replaces and why

`BordereauOracle` is a stand-in. It has a liveness window and a dispute path, but nobody risks anything by asserting a false bordereau or by disputing a true one, and a disputed assertion is decided by the Claims Committee, which is the protocol deciding on its own data. `UmaBordereauOracle` keeps the same record and the same read functions and changes who stands behind a claim and who decides when it is challenged.

A proposer puts real USDC behind the claim. Anyone can challenge it by matching that bond, and a challenged claim is decided by UMA's Optimistic Oracle V3 and its voters, not by NextBlock. If the claim stands, the bond comes back to the proposer. If it is challenged and UMA rules it false, the challenger takes both bonds less the share UMA burns.

Finalizing an assertion still has no economic effect on the protocol. It never authorizes a payout, a premium split or an allocation. It makes bordereau data verifiable, and the Lens and the claims keeper read it as before.

## How it reads from the outside

The assertion record, its two enums and the read functions are those of the stand-in, with identical selectors: `getAssertion`, `getAssertionCount`, `isFinalized`, `latestFinalized`, `proposeAssertion`, `disputeAssertion`, `finalizeAssertion`. `NextBlockLens` casts the module address to `BordereauOracle`, and the keeper calls `getAssertion` and `finalizeAssertion`, so neither changes. A unit test pins the selectors so that a drift would fail the build rather than the keeper.

What is new is the bond side: `effectiveBond()`, `bondOf(id)`, `umaAssertionOf(id)`, `settleDisputed(id)`, `syncUma()`, `setBondAmount(...)`, and the events `AssertionBonded`, `AssertionRejected`, `AssertionSettled` and `BondAmountUpdated`.

## Lifecycle

A cedant (for its own portfolio) or the oracle feed calls `proposeAssertion` after approving the contract for the bond. The record is written first, then the bond is pulled from the proposer and the assertion is opened on UMA with the proposer as asserter, this contract as callback recipient, no escalation manager, and the same liveness window. The claim text UMA's voters would read names the dataset by hash and pointer, the portfolio, the declared amount in USDC base units, this contract and the asserter, and says what the asserter is vouching for.

During the window the Sentinel can call `disputeAssertion`, which matches the bond and disputes on UMA, or anyone can dispute directly on UMA with the same effect. Either way UMA calls `assertionDisputedCallback` and the status becomes `DISPUTED`. If the callback did not arrive, `disputeAssertion` reverts with `DisputeNotRecorded` and the whole transaction, bond included, is undone.

After the window, `finalizeAssertion` is permissionless: it settles on UMA, the bond returns to the proposer and the callback marks the assertion `FINALIZED`. Anyone may also settle straight on UMA, and the callback does the same. A disputed assertion waits for UMA's oracle. Once it has ruled, `settleDisputed` settles it, and the callback records `FINALIZED` if the claim was ruled true or `REJECTED` if it was ruled false. The Claims Committee has no function that touches a disputed assertion: a unit test asserts that the stand-in's `resolveDispute` does not exist here.

## Roles and powers

`OWNER_ROLE` can change the liveness window, within one hour and thirty days, and the bond the protocol asks for, up to a million whole units of the bond currency. A new bond applies to assertions made afterwards. Nothing the owner can do reaches a bond already posted: those are in UMA. `SENTINEL_ROLE` can dispute through this contract. `ORACLE_ROLE` and `AUTHORIZED_CEDANT_ROLE` propose, the cedant only for its own portfolio. `syncUma`, `finalizeAssertion` and `settleDisputed` are permissionless. Only UMA's oracle can call the two callbacks.

## Invariants

This contract is a conduit for bonds and keeps none. Its balance of the bond currency is zero after every transaction, and it leaves no approval to UMA behind. USDC is conserved across the actors, UMA and UMA's store. UMA holds exactly one bond for each proposed assertion, two for each disputed one, and nothing for a settled one. A status only moves forward: `PROPOSED` to `DISPUTED` or `FINALIZED`, `DISPUTED` to `FINALIZED` or `REJECTED`, and the last two never change. Each assertion emits at most one terminal event, matching its status, and exactly one settlement event once terminal, so there is no duplicate finalization. Our ids and UMA's ids pair one to one. A callback from anyone but UMA changes nothing. Whenever any assertion of a portfolio and type is finalized, `latestFinalized` returns a finalized one, and when none is, it reverts so that consumers treat unverified data as absent.

These are written as Foundry invariants in `test/invariant/UmaBordereauInvariant.t.sol`, with a handler that proposes, disputes through the Sentinel and directly on UMA, moves time, settles through this contract and directly on UMA, plays UMA's ruling, reconfigures bond and liveness, forges callbacks and replays real ones. The handler also drives whole lifecycles to every terminal state and marks itself broken if the contract refuses a step it must accept, because an earlier version of this suite passed on an empty set when the contract reverted every proposal. The suite was then checked by changing the contract on purpose in five ways and confirming that it fails each time: removing the guard that makes a replayed callback a no-op, letting anyone call the callback, pulling one unit more than the bond, no longer recording the latest finalized assertion, and naming the contract instead of the proposer as the asserter of the bond.

## Failure modes

The vote can take days. A disputed claim stays `DISPUTED` until UMA's voters rule. During that time readers see it as not finalized, and the Lens must treat it as absent. Nothing in NextBlock waits on a bordereau to move money, by design.

The latest finalized assertion is the one finalized last, not the one with the highest id. That is the stand-in's behaviour and it is kept so that the readers do not change. A disputed older assertion that UMA rules true after a newer one has finalized becomes the latest. The record carries `proposedAt`, so a consumer that cares about staleness can see it.

A minimum bond that UMA raises will be followed automatically through `effectiveBond()`, but a proposer who approved only the old amount will see the transaction revert for allowance. The app must read `effectiveBond()` at the moment of the request and approve that amount.

UMA caches a final fee per currency. If it changes, `syncUma()` refreshes it; anyone can call it. If UMA removes USDC from its whitelist, proposals revert in UMA until it is back, and nothing already posted is affected.

A reverting recipient cannot block UMA's settlement, because UMA calls the callbacks in a try and catch. The callbacks here never revert on an unknown or already settled id for that reason. The cost is that a missed callback would leave our status behind UMA's. `finalizeAssertion`, `disputeAssertion` and `settleDisputed` each verify the outcome after calling UMA and revert if it was not recorded, so the contract never claims a state it did not reach.

An asserter who is blacklisted by the USDC issuer cannot receive the bond back, and UMA's settlement for that assertion reverts. This is a property of USDC and is not mitigated here. The proposer is the asserter, so the blacklisted address is the one that loses.

The claim text depends on the dataset hash and pointer the proposer supplies. UMA's voters judge whether the hash matches the data and whether the data is a true and complete bordereau. Nothing on chain checks the dataset, which is the reason for the bond.

None of this has had an external audit. The checks described here are internal.

## Tests

`test/UmaBordereauOracle.t.sol` covers construction, configuration bounds and roles, proposal (including the proposer role, a cedant's own book only, bad input, missing allowance, a zero bond), the exact claim text, the liveness boundaries, finalization, dispute and its refusal at expiry, UMA ruling true and false, direct settlement and dispute on UMA, callback authorization, replays and unknown ids, and fuzz tests for the effective bond, the window boundaries and bond conservation under any bond, floor, dispute choice and ruling. `test/invariant/UmaBordereauInvariant.t.sol` holds the invariants above. `test/fork/UmaBordereauFork.t.sol` runs the contract against UMA's deployed Optimistic Oracle V3 and Circle's USDC on Base Sepolia with real transfers. The one step a fork cannot perform is the vote itself, so the dispute tests answer the oracle's price request with a mock at that single point.

The offline tests use `test/mocks/MockOptimisticOracleV3.sol`, which follows UMA's rules for what NextBlock depends on and is used only there.

## Putting it on Base Sepolia

UMA's Optimistic Oracle V3 is at `0x0F7fC5E6482f096380db6158f978167b57388deE` on Base Sepolia, and Circle's USDC at `0x036CbD53842c5426634e7929541eC2318f3dCF7e` is on its bond whitelist, with a minimum bond of zero. The deployment script uses them when it runs on chain 84532 with a real settlement asset (`USDC_ADDRESS`), and then deploys no stand-in at all. The throwaway deployment that opts into the mock asset with `ALLOW_MOCK_USDC=true` keeps the stand-in, because a token anyone can mint is not on UMA's bond whitelist. Local chains keep the stand-in too, unless `UMA_OOV3_ADDRESS` names an oracle, which is how a fork of Base Sepolia is rehearsed.

The script reads `BORDEREAU_BOND`, the bond in USDC base units, and defaults to 10 USDC. A fresh stack is deployed as before, with the same separated-roles requirement:

```bash
cd contracts
forge test
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e \
BORDEREAU_BOND=10000000 \
forge script script/DeployStack.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast
```

The deployment JSON gains `umaOptimisticOracleV3` and `bordereauBackend`. The address book generator ignores unknown keys, so it needs no change.

The app and the indexer are ready for it and need no further change to the code. The admin bordereau page reads `effectiveBond()` from whatever oracle the address book points at: on the stand-in the read fails and the page behaves as before, and on the UMA-backed oracle it first asks the signer to approve exactly the bond, then proposes, and it shows the bond and what happens to it. The subgraph's `BordereauOracle` data source reads one ABI that holds both generations of the oracle, so the existing handlers cover the lifecycle events of either one and four new handlers record the bond, how UMA settled the assertion, the Sentinel's reason and the bond setting.

After deployment, what is left is the owner's. The Sentinel needs USDC for its matching bond and an approval to the contract. The cedant and the oracle feed need USDC for the bond; the page asks for the approval itself. And the subgraph manifest needs the new oracle's address and start block in its `BordereauOracle` data source, with a new version name on deploy, as for every other contract of a new generation. Run `node scripts/extract-abis.mjs` in `indexer/` after the contracts are built if the ABI file has to be refreshed.

For Base mainnet the oracle is at `0x2aBf1Bd76655de80eDB3086114315Eec75AF500c`. Before using it, confirm on chain that USDC is on UMA's whitelist there and read its minimum bond. The script does not deploy to mainnet.
