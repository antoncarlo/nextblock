# NextBlock — Institutional-Grade End-to-End Roadmap

**Author:** Anton Carlo Santoro
**Started:** 2026-06-30
**Mode:** `/loop` self-paced autonomous execution (code + tests + local verification only).

## Execution rules (non-negotiable)

- **Autonomous scope = code + Foundry/TS tests + local verification.** Outward-facing
  actions (live deploy, `git push`, PR, merge) are **owner-gated** and surfaced, never
  auto-executed.
- Every contract module follows the skill's standard: NatSpec, custom errors, events,
  access control, unit + fuzz + (where accounting spans modules) invariant + Base fork
  tests. TDD. Verification before any "done" claim.
- Base-only. USDC settlement. Compliance gate stays on-chain. AI/oracle stay advisory
  behind adapters. Author = Anton Carlo Santoro, no AI authorship in code.
- forge via `"$HOME/.foundry/bin/forge.exe"` (not on shell PATH).

## Phase status legend

`TODO` · `IN PROGRESS` · `DONE (local)` · `OWNER-GATED` (needs external action/authorization)

---

## Phase 1 — RedemptionQueue go-live (contracts)  — `DONE (local)`

The async LP exit is the missing capital-lifecycle piece. The contract is built and
3-layer tested (14 unit/fuzz + 6 invariant + 3 Base fork).

- [x] `script/DeployRedemptionQueue.s.sol` — composes DeployStack, deploys queue bound
      to the vault, sets `approvedVenue`, env-configurable epoch (default 7d). Mirrors
      `DeployLendingMarket` (dedicated script, no canonical address-book drift).
- [x] `test/DeployRedemptionQueue.t.sol` — bindings, venue approval, keeper ALLOCATOR_ROLE,
      epoch baseline+override (single sequential test to avoid Foundry parallel env race),
      chain guard. 3/3.
- [x] **LIVE DEPLOY DONE (2026-06-30, owner-authorized)** — fresh generation broadcast on Base
      Sepolia (84532). Queue `0x243205af6C2a89C33c67f967901415C06F2a9cc0`, vault
      `0xc496Bb59e68c95eDC90c95dBF078910542aC08D6`, protocolRoles
      `0x3e961139Ea0EDA926bfE8f7bfe5022D7AA108192`, compliance
      `0x60AE032A4a315fdd62387271b7649056f951D860`, usdc `0xBA4B7F7C67844D9829a2F287aCF99bB796BC163b`.
      Verified on-chain: vault binding, epoch 604800, approvedVenue=true. Cost ~0.000526 ETH.
- [x] Keeper cron — `.github/workflows/redemption-keeper.yml` (6h schedule + manual; no-op until due).
- [ ] `NEXT_PUBLIC_REDEMPTION_QUEUE_ADDRESS=0x243205af6C2a89C33c67f967901415C06F2a9cc0` on Vercel +
      keeper repo secrets (KEEPER_PRIVATE_KEY/BASE_SEPOLIA_RPC_URL/REDEMPTION_QUEUE_ADDRESS) — **OWNER-GATED**.

## Phase 2 — RedemptionQueue UI  — `DONE (local)`

- [x] `app/src/config/redemption.ts` — hand-maintained queue ABI + `getRedemptionQueueAddress`
      (env `NEXT_PUBLIC_REDEMPTION_QUEUE_ADDRESS`), parallel-generation pattern. Bound vault
      read FROM the queue (`vault()`), not assumed from the address book.
- [x] `app/src/hooks/useRedemptionQueue.ts` — two-stage read (queue scalars → resolved vault +
      epoch reads): nbRV balance, `maxRedeem` (instant-in-buffer), open-epoch request, and the
      most-recent settled epoch's `previewClaim` (current-state, no indexer).
- [x] `app/src/components/redemption/RedemptionPanel.tsx` — **instant-vs-queued split**: within
      buffer → `vault.redeem`; above buffer → approve + `requestRedemption`; async states
      surfaced (Open → Queued → Settled/PartiallySettled → Claimable → Claimed); claim of prior
      settled epoch (USDC + returned nbRV). Disclaimer + chain guard + not-deployed state.
- [x] `app/src/app/app/redeem/page.tsx` route; `Redeem` nav link gated LP-only in Header.
- [x] tsc 0, eslint 0 errors, `next build` OK, `/app/redeem` route emitted.
- [ ] Live address `NEXT_PUBLIC_REDEMPTION_QUEUE_ADDRESS` on Vercel after deploy — **OWNER-GATED**.

## Phase 3 — Keeper automation  — `DONE (local)`

- [x] `script/RedemptionKeeper.s.sol` — `settleIfDue(queue, pk)` settles only when the
      epoch is matured, unsettled and non-empty; no-op (no broadcast) otherwise, so a
      cron caller never reverts or double-settles. `run()` reads REDEMPTION_QUEUE_ADDRESS.
- [x] `test/RedemptionKeeper.t.sol` — skips when empty / before maturity, settles when due,
      no double-settle. 3/3.
- [ ] Vercel/off-chain cron wiring to call the keeper — **OWNER-GATED**.

## Phase 4 — Governance / role-separation hardening  — `DONE (local, autonomous part)`

- [x] `test/governance/RoleSeparation.t.sol` — cross-cutting proof that a SENTINEL_ROLE-only
      actor CAN pause queue / block address / pause NAV feed / pause portfolio, but CANNOT
      allocate, deallocate, settle, withdraw or redeem anyone's funds, nor reconfigure
      (setEpochDuration / setVaultAllocator). Fund conservation asserted across every attempt. 3/3.
- [x] Timelock coverage AUDITED: the model is structural — `ProtocolTimelock` holds OWNER_ROLE,
      every OWNER-gated config shares the uniform `onlyProtocolRole(OWNER_ROLE)` gate, and
      `GovernancePhase2Rehearsal` already proves schedule→delay→execute, pre-delay-execute revert,
      handover, post-handover direct-call revert, and Sentinel-emergency-stays-direct (7/7).
      No per-action gap to fill — added coverage would be redundant given the uniform gate.
- [ ] Real Gnosis Safe (Owner/Curator/Sentinel; 3-of-5 Claims Committee) deploy + handover — **OWNER-GATED**.

## Phase 5 — Protocol-wide invariant / fuzz extension  — `DONE (local)`

- [x] Coverage map: VaultInvariant, LendingMarketInvariant, RedemptionQueueInvariant existed;
      PremiumDistributor's own fee accounting was only touched by one assertion in
      VaultInvariant, never fuzzed in isolation.
- [x] `test/invariant/PremiumDistributorInvariant.t.sol` — handler (receivePremium across
      portfolios, OWNER fee claims, split reconfig) + additive ghosts + targetSelector. 5
      invariants: balance == unclaimed fees; gross split conservation; totalGross == ghost;
      fee ledger (accrued + claimed == ever-accrued); forwarded LP quota == vault USDC.
      5/5 (64×48, ~15.4k calls, 0 reverts).
- [x] Full suite 563/563.

## Phase 6 — Real NAV / AI / bordereau integration  — `OWNER-GATED` (skipped by loop)

- The contracts already keep NAV/AI/bordereau behind adapters (NavOracle, AIAssessor,
  BordereauOracle) with mock providers. Swapping mocks for real Braino.ai / signed NAV /
  UMA OOv3 needs external accounts, endpoints and API keys — **OWNER-GATED**. The loop
  signals this and skips to autonomous work in Phases 7–8.

## Phase 7 — Reporting & observability  — `DONE (local, autonomous part)`

- [x] `app/src/lib/reporting.ts` — framework-free pure lib: NAV/share statement, capital-adequacy
      (illustrative SCR/MCR proxy + solvency/MCR coverage ratios + expected loss, clearly labelled
      non-regulatory), exposure concentration per portfolio with HHI + per-limit breach flags.
      Fees/requirements round UP, NAV/share rounds DOWN (rounding safety).
- [x] `app/scripts/reporting-smoke.ts` — 27 checks incl. under-capitalised + no-exposure +
      empty-portfolio boundaries. ALL PASS (node strip-types). tsc 0, eslint 0.
- [x] **Indexer LIVE on Goldsky (2026-06-30)** — no-code subgraph deployed (deployment
      `QmWY1dwjMeYpXNH9g1yU2nytbuYJmMvcsPUG9U6KDDwTN3`), synced, 0 indexing errors. Endpoint:
      `https://api.goldsky.com/api/public/project_cmr0s8ubc36xl01xl6o3m00gp/subgraphs/NEXTBLOCK/1.0.0/gn`.
      Frontend wired: `lib/subgraph.ts` (pure queries+parsers, smoke 11/11), `hooks/useRedemptionHistory.ts`,
      `components/redemption/RedemptionHistory.tsx` on `/app/redeem`. tsc/eslint/build green.
      Goldsky no-code entities are per-event (redemptionRequesteds/epochSettleds/redemptionClaimeds);
      the richer hand-written subgraph in `indexer/` (rollups) remains available via CLI deploy.

## Phase 8 — Security / audit prep  — `DONE (local, autonomous part)`

- [x] `contracts/docs/security/audit-prep.md` — invariant catalogue (I1–I12 mapped to enforcement
      + test), per-module threat model & failure modes (vault, queue, distributor, claims/AI/oracle,
      compliance, governance, lending), test-coverage map, known limitations.
- [ ] External audit + bug bounty — **OWNER-GATED**.

## Phase 8 — Security / audit prep  — `TODO` (prep autonomous)

- [ ] Written invariant catalogue + threat model + failure-mode review per module.
- [ ] External audit + bug bounty — **OWNER-GATED**.

---

## Owner-gated follow-up prep (2026-06-30, owner-authorized — local artifacts ready)

- **Safe handover**: script already existed (`script/GovernanceMigration.s.sol`, two-phase). Added
  `docs/governance/safe-handover-runbook.md` for the live generation + 3-of-5 Claims Committee.
- **Indexer**: `indexer/` subgraph (subgraph.yaml + schema.graphql + src/redemption-queue.ts +
  abis + README) for the RedemptionQueue lifecycle (Goldsky/Graph). Deploy needs owner account.
- **Real providers**: `docs/integrations/real-providers.md` — NAV (signed) / Braino AI / UMA OOv3
  seams, advisory-only authority boundary, per-provider go-live + key env.
- **Audit handoff**: `docs/security/audit-handoff.md` — scope, trust assumptions, prioritised risk
  areas, prior internal findings, live addresses, questions for the auditor.

## Progress log

- 2026-06-30: Phase 1 contracts done. DeployRedemptionQueue script + test (3/3). Full
  suite 552/552.
- 2026-06-30: Phase 3 done. RedemptionKeeper script + test (3/3, matured/empty/double-settle
  guards). Contract suite now 555/555.
- 2026-06-30: Phase 2 done. RedemptionQueue UI (config + hook + panel + route + LP-only nav).
  Instant-in-buffer vs queued-above-buffer split, async lifecycle surfaced. tsc/eslint/build green,
  /app/redeem emitted.
- 2026-06-30: Phase 4 (autonomous part) done. RoleSeparation cross-cutting test (3/3): Sentinel can
  pause/block/freeze everywhere but cannot move/allocate/settle/withdraw funds; conservation asserted.
  Timelock coverage audited = already comprehensive (structural OWNER_ROLE→timelock gate +
  GovernancePhase2Rehearsal 7/7). Full suite 558/558.
- 2026-06-30: Phase 5 done. PremiumDistributorInvariant (5/5, ~15.4k calls, 0 reverts): balance==unclaimed
  fees, gross split conservation, fee ledger, LP quota reaches vault. Full suite 563/563. Phase 6
  (real NAV/AI/bordereau) is entirely OWNER-GATED → loop signals + skips.
- 2026-06-30: Phases 7 & 8 (autonomous parts) done — LOOP COMPLETE. Phase 7: reporting.ts pure lib
  (NAV statement, illustrative SCR/MCR capital-adequacy, concentration+HHI) + reporting-smoke.ts 27/27
  ALL PASS, tsc/eslint 0. Phase 8: docs/security/audit-prep.md (I1–I12 invariant catalogue + per-module
  threat model + coverage map). All autonomous roadmap work complete; remaining items are owner-gated
  (live deploy queue, Safe multisig, real NAV/AI/bordereau, indexer, external audit). Loop stopped.
