# Internal adversarial review — 2026-09-16

Author: Anton Carlo Santoro
Scope: `contracts/src` at `feat/agent-simulation-m2`, plus the live Base Sepolia
staging deployment (chainId 84532, deployment book `deployments/84532-staging.json`).

This review extends the external disclosure of 2026-09-10 (findings F-01…F-06,
stale-NAV / live-supply collateral inflation). That report was written against a
partial view of the repository. Everything below is new, reproduced by a passing
proof-of-concept in `contracts/test/`, and — where the finding concerns
deployment state rather than code — read back off the live chain.

Suite after this review: **653 tests, 0 failures** (baseline 644 + 9 new).

---

## Summary

| ID | Finding | Severity | Status | Proof |
|---|---|---|---|---|
| F-07 | A claim is never bound to the vault that underwrote the portfolio | High | **Fixed in source** | `ClaimVaultBinding.t.sol` |
| F-08 | `ClaimReceipt` sits outside the governance model; its owner holds an unrecoverable protocol-wide claim kill-switch | High | **Fixed in source**, live until redeploy | `GovernanceMigrationGap.t.sol` |
| F-09 | Factory-created vaults are born unable to pay claims | High | **Fixed in source**; 2 live vaults still unwired (35,970 USDC) | `FactoryVaultClaimGap.t.sol` |
| F-10 | `GovernanceMigration` phase 2 enforces none of its documented preconditions | Medium | Open | `GovernanceMigrationGap.t.sol` |
| F-11 | Liquidation reverts by division-by-zero exactly when collateral prices to zero | Medium | Open, pre-production | `LiquidationBrickExploit.t.sol`, `LiquidationBrickFuzz.t.sol` |
| F-12 | `BordereauOracle.proposeAssertion` does not check the caller is *that portfolio's* cedant | Low today, Medium once bordereau data drives accounting | Open | see below |
| F-13 | No NAV publication pipeline exists; the live feed is already unreadable | Medium | Open | `fork/LiveStagingAudit.t.sol` |

Remediation for F-07, F-08 and F-09 landed on 2026-09-17; see **Remediation** at the
end of this document for what changed and what each fix deliberately does not do.

Also assessed and **not** a finding: the external report's thesis that `AIAssessor`
holds no authority. See "AIAssessor" below — the thesis holds for positive
authority and fails for negative authority.

---

## F-07 — A claim is never bound to the vault that underwrote the portfolio

`ClaimManager.submitClaim(address vault, uint256 portfolioId, …)` takes the paying
vault as a free argument from the cedant. It checks that the caller is the
portfolio's cedant and that the amount is within coverage. It never checks that
this vault has any relationship to this portfolio.

The paying side does not close the gap either:

- `InsuranceVault.reservePortfolioClaim` checks only `freeFunds`.
  `allocationReleased = portfolioAllocation[portfolioId]` is zero for a portfolio
  the vault never allocated to, which is harmless rather than a guard.
- `InsuranceVault.payPortfolioClaim` checks only `totalPendingClaims`.

**Consequence.** A cedant with one legitimate, ACTIVE portfolio can name *any*
funded vault and, on committee approval, drain LPs of a vault that never took on
that risk. The PoC moves 300,000 USDC out of a vault whose
`portfolioAllocation(pid)` is asserted to be zero before and after.

This breaks the protocol's own stated invariant — *"when a portfolio is split
across vaults, each vault backs only its allocated portion"* — in the strongest
possible way: the vault backs a portion it was never allocated at all.

**Mitigant, and why it is thin.** Committee approval gates the drain. But the
protocol's posture is on-chain enforcement over off-chain trust, and the binding
already exists elsewhere: `PremiumDistributor.setPortfolioVault` binds portfolio
to vault, curator-set and immutable once funded. The claim path simply ignores it.
On staging every role sits on one key, which collapses the only mitigant to zero.

**Fix.** Resolve the vault from the portfolio rather than accepting it as an
argument — reuse `PremiumDistributor.portfolioVault`, or record the underwriting
vault on the portfolio at activation and read it in `submitClaim`.

---

## F-08 — `ClaimReceipt` sits outside the governance model

`ClaimReceipt` is `Ownable(msg.sender)` — the deployer EOA — and nothing ever
transfers it. It is absent from the role matrix in `docs/GOVERNANCE_PHASE2.md`,
from `docs/GOVERNANCE_PREFLIGHT.md`, and from `script/GovernanceMigration.s.sol`,
which moves roles on `ProtocolRoles` and no other contract. It appears in the
governance documentation only as a test-coverage statistic.

That owner holds `setRegistrar` and the revoking half of `setAuthorizedMinter`.
`ClaimManager.approveClaim` mints a soulbound receipt on **every** path:

```solidity
uint256 receiptId = claimReceipt.mint(c.claimant, c.portfolioId, approvedAmount, address(this));
```

**Consequence.** A single call to `setAuthorizedMinter(claimManager, false)` makes
every claim approval revert, for every vault, protocol-wide — and it cannot be
undone:

- the timelock is neither owner nor registrar, so it reverts with
  `ClaimReceipt__UnauthorizedRegistrar`;
- the registrar is `VaultFactory`, which only ever registers vaults it deploys
  and has no passthrough to re-authorise a `ClaimManager`.

The mirror image is just as bad. If the deployer key is discarded after the
migration — which is the natural reading of a step the script calls IRREVERSIBLE
— `ClaimReceipt` is frozen forever, and no future `ClaimManager` can ever be
authorised to mint. A claim-manager upgrade becomes impossible after
decentralisation.

**Live state (verified on chain).** `ClaimReceipt.owner()` is
`0xfF6f0d49dD2187351264C4d3bbd5537bE8Ad81d2`, the deployer — not the timelock.

**Fix.** Either transfer `ClaimReceipt` ownership to the timelock as part of
phase 1, or drop `Ownable` and gate it on `ProtocolRoles.OWNER_ROLE` like every
other module. Add it to the role matrix either way.

---

## F-09 — Factory-created vaults are born unable to pay claims

`VaultFactory._create` deploys the vault, registers it as a `ClaimReceipt` minter,
and stops. It never calls `setClaimManager`, so the new vault's `claimManager` is
`address(0)` and the `onlyClaimManager` gate admits nobody — `msg.sender` can
never be the zero address.

Repairing it needs the global `OWNER_ROLE`, which the curator who created the
vault does not hold. The fix is a separate governance action that the factory does
not perform, nothing enforces, and no view surfaces. After governance phase 2 it
becomes a timelocked proposal with a ≥1h delay, per vault.

Meanwhile the vault is fully open for business: it accepts LP deposits, takes
premium, and can be allocated portfolios. For an insurance protocol this is the
worst reachable state — capital collected against cover that cannot be paid.

**Live state (verified on chain).** Of the 3 vaults registered in the factory,
**2 have `claimManager == address(0)`**, holding **35,970.94 USDC** between them:

| Vault | LP capital (USDC) |
|---|---|
| `0xC69E01FE28956E857C4531D64192A7feC81AfE74` | 31,976.84 |
| `0x5d490f490c412379401A021955E3eB523DEf2ad9` | 3,994.11 |

The staging vault `0x47b1…BCa3` is wired, because `DeployStack._wireAndGrant`
calls `setClaimManager` explicitly — which is exactly the distinction: the
scripted path wires it, the factory path does not.

**Fix.** Have the factory wire the claim manager at creation (it already holds
`VAULT_FACTORY_ROLE`), or refuse deposits until `claimManager != address(0)`.

---

## F-10 — `GovernanceMigration` phase 2 enforces none of its preconditions

Phase 2 (`RENOUNCE_DEPLOYER=true`) checks only that the timelock holds
`OWNER_ROLE` and `DEFAULT_ADMIN_ROLE`, then renounces both from the deployer and
prints:

> Governance now flows exclusively through ProtocolTimelock

Two documented preconditions are prose, not code:

1. *"run only after a successful timelocked operation has been executed
   end-to-end"* — never checked.
2. `docs/GOVERNANCE_PHASE2.md` Stage A (move operational roles to dedicated
   addresses, revoke from deployer) — the script neither performs nor verifies it.

Run phase 2 without Stage A and the deployer keeps SENTINEL, CLAIMS_COMMITTEE,
ORACLE, AUTHORIZED_CEDANT, KYC_OPERATOR, ALLOCATOR and UNDERWRITING_CURATOR, all
defaulted to the deployer by `DeployStack` (`vm.envOr("…_ADDRESS", deployer)`).
The final log line is then false: the key the operator believes they retired still
holds the protocol's entire operating surface.

Compounded with F-07, the PoC shows that key draining a funded vault end to end
after the "irreversible" migration: submit as cedant → assess as oracle → approve
as committee → execute.

**Live state (verified on chain).** Phase 1 is done and correct — the timelock is
self-administered, the Safe is PROPOSER and CANCELLER, `minDelay` is 3600s. Stage
A has not run: the deployer still holds all seven operational roles plus
`OWNER_ROLE`. So the dangerous ordering is still available.

**Fix.** Make Stage A a hard precondition of phase 2: require that the deployer
holds none of the operational roles, and that the timelock has executed at least
one operation, before allowing the renounce.

---

## F-11 — Liquidation reverts exactly when it is needed most

`NavOracle.publishNav` has no lower bound on `nav`, and the deviation guard is
skipped once the Sentinel has acknowledged an anomaly — the documented path for
applying a large corrective report. `NavOracle.getNav` does not reject a zero NAV
either. `NavShareOracle.priceCollateralUSDC` then returns zero, and
`LendingMarket.liquidate` computes:

```solidity
seized = Math.mulDiv(collShares, seizeValue, collValue); // collValue == 0 → panic
```

The market correctly *detects* the position as unhealthy; it simply cannot act.
Collateral is never seized, bad debt is never socialised, and `totalBorrowAssets`
keeps counting the defaulted loan as a lender asset. Lenders who withdraw first
are paid out of what remains.

The same panic is reachable without a zero NAV whenever rounding takes collateral
to zero, i.e. `collShares * nav < totalSupply` — a borrower holding a small slice
of a large-supply vault reaches that long before NAV hits zero.

**Bounding the band.** `LiquidationBrickFuzz` fuzzes the corrective NAV over
`(0, 80_000e6]`. At 3001 runs with zero excluded, the property *"an unhealthy,
collateralised position is always liquidatable"* holds. The unliquidatable point
is exactly `nav == 0` in a dominant-holder configuration. That precision makes the
fix cheap. The test is kept as a regression guard: it fails the day the band
widens.

**Blast radius today: zero.** `DeployStack` does not deploy a `LendingMarket`, so
this is pre-production. It must be fixed before the lending market ships.

**Fix.** Reject `nav == 0` at publication, and guard the divisor in `liquidate`
with an explicit branch that seizes all collateral and socialises the residual
rather than panicking.

---

## F-12 — `BordereauOracle` accepts assertions from any authorised cedant

`proposeAssertion` checks that the caller holds `AUTHORIZED_CEDANT_ROLE` **or**
`ORACLE_ROLE`. It never checks that the caller is the cedant *of that portfolio*.
`_finalize` then overwrites `_latestFinalized` unconditionally.

Any whitelisted cedant can therefore post bordereau data against another cedant's
portfolio, and on finalisation that data becomes the record of record for that
`(portfolioId, assertionType)` pair.

**Severity today: Low, and I want to be precise about why.** Two things bound it:

1. The `SENTINEL_ROLE` dispute window is a genuine mitigant — an assertion can be
   flagged before `finalizeAssertion` becomes callable, and the committee resolves
   it. This is the liveness/dispute path the brief asks for, and it works.
2. Nothing on-chain consumes `latestFinalized` for economic effect. The only
   reader in `src/` is `NextBlockLens`, the frontend read model; `ClaimManager`
   mentions the oracle in a comment only. `finalizeAssertion` documents itself as
   *"permissionless housekeeping; NO economic effect"*, and that is accurate.

So the impact today is corrupted reporting, not corrupted accounting — a
competitor can make another cedant's portfolio display wrong premium or loss
figures, subject to the Sentinel noticing within the liveness window. It becomes
Medium the moment UPR recognition, loss ratios or capacity draw on this data,
which is the stated direction of travel.

Filed without a PoC for that reason: the missing check is plain in the source and
the exploit would prove a reporting defect, not a solvency one.

**Fix.** Check `PortfolioRegistry.portfolios(id).cedant == msg.sender` for the
cedant path, exactly as `ClaimManager.submitClaim` already does. Cheap now,
load-bearing later.

---

## F-13 — There is no NAV publication pipeline

`publishNav` is called from exactly one place in the repository: `DemoFlow.s.sol`.
There is no keeper — `.github/workflows` contains only `ci.yml` and
`redemption-keeper.yml`. NAV is therefore published by hand, or not at all.

**Live state (verified on chain).** `NavOracle.getNav(0x47b1…BCa3)` **reverts**.
The feed is not paused; there is no usable attestation. Any lending market pointed
at this vault right now could neither price collateral, nor borrow, nor liquidate.

This is the operational counterpart to the external report's F-01/F-02: a stale
NAV against a live supply is not a hypothetical, because nothing in the system
keeps the NAV fresh in the first place.

**Fix.** Add a NAV keeper workflow alongside `redemption-keeper.yml`, and treat a
`getNav` revert as an alertable condition rather than a silent one.

---

## AIAssessor — assessing the external report's "no authority" thesis

The external report argues `AIAssessor` holds no business authority. For
**positive** authority this is correct and worth stating plainly: it transfers
nothing, calls neither the vault nor the `ClaimManager`, and its recommendation is
advisory — the committee is free to approve against it. The adapter boundary the
brief asks for is respected.

It holds **negative** authority, which the thesis misses. `attachAssessment` is
permissionless, and an assessment flagged anomalous freezes the claim pending
Sentinel review. Anyone able to get an anomalous assessment published can
therefore block a legitimate payout without ever being able to cause one. For a
protocol whose product is paying claims, a denial-of-payout lever is a real lever,
even though it is not a theft lever.

No PoC is filed: publishing requires `ORACLE_ROLE`, so this is a property of the
design rather than an exploitable gap today. It belongs in the threat model.

---

## Reproduction

```bash
cd contracts
forge test --no-match-path "test/fork/*"          # 653 passing

# The five new proofs, individually
forge test --match-contract ClaimVaultBindingExploit -vv
forge test --match-contract GovernanceMigrationGapExploit -vv
forge test --match-contract FactoryVaultClaimGapExploit -vv
forge test --match-contract LiquidationBrickExploit -vv
forge test --match-contract LiquidationBrickFuzz -vv

# Live Base Sepolia state behind F-08, F-09, F-10, F-13
export BASE_SEPOLIA_RPC_URL=https://base-sepolia-rpc.publicnode.com
forge test --match-contract LiveStagingAudit -vv
```

Note: `sepolia.base.org` returns 503 and is not usable as the fork endpoint;
`base-sepolia-rpc.publicnode.com` works.

---

## Remediation (2026-09-17)

F-07, F-08 and F-09 are fixed in source. Each exploit PoC was converted into a
regression test that asserts the fix rather than deleted, and each is paired with
a control proving the legitimate path still works — a refusal that passes because
the protocol refuses everything would prove nothing.

### F-07 — claim-vault binding

`InsuranceVault` gains `mapping(uint256 => bool) public underwrites`, raised when
the vault commits capital to a portfolio (`allocateToPortfolio`) or takes premium
for it (`recordPortfolioPremium`), and emitting `PortfolioUnderwritten` once.
`ClaimManager.submitClaim` refuses a vault that has not.

The flag is **sticky on purpose**. `portfolioAllocation` legitimately returns to
zero — a claim reserve absorbs it, or the allocator unwinds the line — while the
vault remains on risk for losses that occurred during cover. Gating on the
allocation balance would have refused the second claim on a portfolio whose first
claim consumed the line, which is a worse bug than the one being fixed.

The check runs **after** the cedant, status and coverage checks. Those validate
the claim; this one validates the payer. A malformed claim should report the
defect in the claim rather than blaming the vault, and keeping that order left
every pre-existing negative test asserting the error it was written for.

### F-08 — ClaimReceipt under governance

`Ownable` is removed. `setRegistrar` and the revoking half of
`setAuthorizedMinter` are gated on `ProtocolRoles.OWNER_ROLE`, like every other
module. No migration step is needed: the timelock already holds OWNER_ROLE on the
live deployment, so the fix makes it authoritative over ClaimReceipt the moment
the contract is redeployed. Nothing in the app read `ClaimReceipt.owner()`.

The regression test asserts both directions. Governance must be able to revoke a
compromised minter **and restore a legitimate one** — a kill-switch nobody can
reach is as broken as one only a retired key can reach.

**Requires a redeploy to take effect.** The live ClaimReceipt at
`0xcAb4…1b54` is the old `Ownable` build and still answers to the deploy key.

### F-09 — factory wires the claim path

`VaultFactory` takes the ClaimManager as a constructor argument and binds it
inside `_create`, before the vault can take a deposit. `setClaimManager` now
accepts `VAULT_FACTORY_ROLE` **only while the slot is empty**; OWNER_ROLE may
rebind at any time. Bind-once means the factory can bootstrap a vault but can
never displace a manager governance has already chosen, which a test asserts
directly.

`DeployStack` grants VAULT_FACTORY_ROLE immediately after deploying the factory
rather than in the later wiring phase — otherwise the first vault is created
before the grant lands and is born unwired, the exact state the fix exists to
prevent.

**The two live unwired vaults are not repaired by this.** They need a governance
call to `setClaimManager`, or to be superseded by a redeploy.

### Test-suite consequences

Putting a vault on risk is now a precondition for claiming against it, so suites
that filed claims against vaults with no exposure had to be made realistic. That
is the intended direction: those tests were asserting behaviour the protocol
should never have allowed.

`VaultInvariant` gained an `afterInvariant()` hook asserting `ghost_payouts > 0`.
The handler's `claimFlow` returns early on several guards, so a revert-free run
proves nothing on its own — without this, a change that made claims unreachable
would leave every claim invariant green and asserting over an empty set. It is
written as `afterInvariant` and not `invariant_` because the latter is also
evaluated before the first handler call, where no claim can have settled yet.
