# Agent simulation — evidence pack

Generated from `campaign-2026-08-21.log` on 2026-08-21.
Every figure below is read from the campaign log rather than transcribed.

## Result

**No counterexample found** — 21 passed, 0 failed, in 8 minutes.

- Invariants asserted: **21**
- Runs per invariant: **256**
- Total calls: **2,688,000**
- Reverts: **28,244** (1.05% of calls)

### On the revert rate

It is reported because it is the fastest way to tell a campaign that proved
something from one that did not. Roughly a third of the actions these agents
plan are attempts at things the protocol must refuse. A rate near zero would
mean those attempts never reached the checks they were written for — which is
how an earlier version of this suite reported green while the claim invariants
were asserting over an empty set.

## Invariants

| Invariant | Result | Calls | Reverts |
|---|---|---:|---:|
| `invariant_attestationGuardsHold` | PASS | 128,000 | 1,348 |
| `invariant_attestorHasNoAuthority` | PASS | 128,000 | 1,351 |
| `invariant_cedantCeilingSpansEveryVault` | PASS | 128,000 | 1,360 |
| `invariant_claimOnlyByOwningCedant` | PASS | 128,000 | 1,358 |
| `invariant_claimStateMachine` | PASS | 128,000 | 1,356 |
| `invariant_complianceGateHolds` | PASS | 128,000 | 1,337 |
| `invariant_concentrationLimits` | PASS | 128,000 | 1,345 |
| `invariant_curatorStaysInsideUnderwriting` | PASS | 128,000 | 1,346 |
| `invariant_governanceStaysOutOfTheBook` | PASS | 128,000 | 1,338 |
| `invariant_keeperCannotRedirectPayout` | PASS | 128,000 | 1,341 |
| `invariant_kycRevocationNeverTrapsFunds` | PASS | 128,000 | 1,346 |
| `invariant_navFreshnessGate` | PASS | 128,000 | 1,352 |
| `invariant_noDilutionOnDeposit` | PASS | 128,000 | 1,341 |
| `invariant_onRiskImpliesUnderwritten` | PASS | 128,000 | 1,341 |
| `invariant_onlyCuratorsCreateRegisteredVaults` | PASS | 128,000 | 1,344 |
| `invariant_premiumDepositorNeverWithdraws` | PASS | 128,000 | 1,347 |
| `invariant_premiumLedgerAgreesWithPayer` | PASS | 128,000 | 1,343 |
| `invariant_roleSeparation` | PASS | 128,000 | 1,333 |
| `invariant_sentinelNeverMovesFunds` | PASS | 128,000 | 1,347 |
| `invariant_timelockCannotBeJumped` | PASS | 128,000 | 1,340 |
| `invariant_uprNeverExceedsPremiumCollected` | PASS | 128,000 | 1,330 |

## What this does not establish

A campaign that finds no counterexample has failed to find one. It has not
shown that none exists: the search is random over an enormous state space, and
2,688,000 calls is a large sample of an infinite one.

Three limits are worth stating to anyone reading this as assurance:

1. The invariants assert what somebody thought to assert. A property nobody
   wrote down cannot fail here.
2. The harness runs against a local deployment. Behaviour that depends on real
   RPC latency, reorgs or mempool ordering is outside it.
3. An internal exercise is not an external audit and does not substitute for one.
