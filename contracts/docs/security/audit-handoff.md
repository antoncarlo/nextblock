# NextBlock — External Audit Handoff

**Author:** Anton Carlo Santoro
**Companion to:** `audit-prep.md` (invariant catalogue + per-module threat model).
**Status:** handoff package for an external auditor. The audit itself is separate and mandatory;
nothing here implies an audit has been performed.

## 1. Engagement scope

**In scope (`contracts/src`):**

| Module | LoC focus | Funds at risk |
|---|---|---|
| `InsuranceVault` | ERC-4626 + UPR + buffer + compliance hook | High (LP capital) |
| `RedemptionQueue` | periodic-window pro-rata exit | High (escrowed shares + USDC) |
| `PremiumDistributor` | fee split + pull-pattern fees | Medium (premium + fees) |
| `ClaimManager` + `AIAssessor` | claim lifecycle, AI advisory gate | High (payouts) |
| `VaultAllocator` | concentration/cap-bounded allocation | Medium (commitment accounting) |
| `ComplianceRegistry` | KYC/whitelist/block, approvedVenue | High (transfer eligibility) |
| `ProtocolRoles` + `ProtocolTimelock` | RBAC + governance delay | Critical (privilege) |
| `lending/*` | isolated permissioned market | Medium (collateral + loans) |
| `NavOracle` / `BordereauOracle` | advisory feeds + guards | Low (advisory, gated) |

**Out of scope:** mock providers (`MockUSDC`, `MockOracle`), off-chain backend, frontend,
indexer, and the real NAV/AI/bordereau providers (not yet integrated — see
`docs/integrations/real-providers.md`).

## 2. Trust assumptions

- **USDC** behaves as a standard 6-decimal ERC-20 (no fee-on-transfer, no rebasing). On Base
  Mainnet this is Circle USDC; staging uses MockUSDC.
- **Privileged roles** are held by a Gnosis Safe + ProtocolTimelock post-handover (see
  `docs/governance/safe-handover-runbook.md`); the deployer EOA renounces. Pre-handover staging
  runs with the deployer as OWNER.
- **AI/oracle providers** are advisory and gated (invariant I10); they cannot move funds.
- **Keeper** (RedemptionQueue settlement) is liveness-only: its inaction delays but never loses
  funds (requests stay re-requestable).

## 3. Prioritised risk areas for review

1. **Rounding & dust** across pro-rata settlement (RedemptionQueue) and fee split
   (PremiumDistributor). An internal fuzz run already found + fixed a last-claimer dust underflow
   in `RedemptionQueue.claim` (cap `sharesReturned` at `escrowedShares`); re-examine the boundary.
2. **Liquidity accounting** — `_availableBuffer` vs committed underwriting; confirm capital
   allocated to portfolios is never promised as instantly redeemable (invariant I9).
3. **NAV / share-price** integrity — `totalAssets = balance − UPR − pendingClaims − fees`, floored,
   non-reverting; first-deposit inflation mitigated by `_decimalsOffset()=12`.
4. **Compliance hook** — every share movement routes through `_update → requireCanTransfer`;
   confirm no mint/transfer path bypasses it; blocked-wins precedence.
5. **Claim lifecycle** — AI advisory → dispute window → committee approval → payout; confirm no
   path pays out before conditions (invariant I7).
6. **Role separation** — Sentinel cannot move funds (cross-cutting test `RoleSeparation.t.sol`);
   confirm no privileged role escapes timelock except Sentinel emergency (by design).

## 4. Prior internal findings

| Finding | Status |
|---|---|
| RedemptionQueue last-claimer dust underflow (DoS) | FIXED — cap to escrowed; covered by unit + invariant |
| (Add auditor findings here) | — |

## 5. Test & coverage pointers

- Full suite: **563 passing** (`forge test`). Layout: unit/fuzz per module, `test/invariant/` (4
  suites incl. PremiumDistributor + RedemptionQueue), `test/governance/` (timelock + role
  separation), `test/fork/` (4 Base Sepolia fork suites).
- Invariant catalogue I1–I12 mapped to enforcement + tests in `audit-prep.md`.
- CI: `forge fmt --check`, `forge build --sizes`, `forge test`, gas snapshot.

## 6. Live deployment (staging, Base Sepolia 84532)

| Contract | Address |
|---|---|
| ProtocolRoles | `0x3e961139Ea0EDA926bfE8f7bfe5022D7AA108192` |
| ComplianceRegistry | `0x60AE032A4a315fdd62387271b7649056f951D860` |
| InsuranceVault | `0xc496Bb59e68c95eDC90c95dBF078910542aC08D6` |
| RedemptionQueue | `0x243205af6C2a89C33c67f967901415C06F2a9cc0` |

## 7. Questions for the auditor

- Adequacy of the illustrative SCR/MCR reporting proxy disclosure (it is explicitly non-regulatory).
- Whether the 7-day epoch + buffer model adequately bounds a coordinated mass-exit.
- Whether the advisory-only oracle/AI boundary holds under a compromised provider key.
