# NextBlock Static Analysis + Coverage Pre-Audit Baseline

- **Date:** 2026-06-13
- **Commit analyzed:** `d709c355fc117244a3199b3d86948a6f04b0fab3` (main; includes the
  merged UPR bounded-loop fix and Claim Lifecycle UI).
- **Scope:** read-only baseline. No contract, deployment, address-book, Supabase,
  governance or env change. No merge, deploy or broadcast.

## 1. Tools run and versions

| Tool | Version | Status |
|---|---|---|
| Foundry `forge` (build/test/coverage) | 1.5.1-stable | Available, run |
| `forge coverage` | (Foundry 1.5.1) | Available, run |
| Slither | n/a | NOT installed (binary + python module absent) |
| Aderyn | n/a | NOT installed |
| solc standalone | n/a | Absent (Foundry uses svm-managed solc) |

Slither/Aderyn require an invasive environment change (pip install
`slither-analyzer` plus a solc on PATH). Per the task's "ask before invasive
changes" rule, automated static analysis was NOT installed in this pass. This
baseline therefore pairs the available `forge coverage` with a manual
detector-category review of the priority contracts; the authorized Slither
setup is proposed in section 7.

## 2. Commands and results

```bash
cd contracts
BASE_SEPOLIA_RPC_URL= forge coverage --report summary     # exit 0
# detector-category greps over src/*.sol (see section 5)
```

Full Foundry suite at this commit: 440 tests, 0 failed (per merged-main CI runs
27472291169 and 27472748062, both 4/4 green).

## 3. Contract coverage summary (forge coverage, 2026-06-13)

**Total: 75.61% lines (1745/2308), 74.53% statements, 70.87% branches
(270/381), 85.57% functions (249/291).**

| Module (priority in bold) | Lines | Branches |
|---|---|---|
| **InsuranceVault.sol** | 95.65% | 82.09% |
| **ClaimManager.sol** | 90.52% | 58.62% |
| **PolicyRegistry.sol** | 100.00% | 88.89% |
| **VaultFactory.sol** | 100.00% | 83.33% |
| **NextBlockLens.sol** | 100.00% | 100.00% |
| **ProtocolRoles.sol** | 100.00% | 100.00% |
| **ProtocolTimelock.sol** | 100.00% | 100.00% |
| AIAssessor.sol | 100.00% | 100.00% |
| ComplianceRegistry.sol | 100.00% | 82.35% |
| VaultAllocator.sol | 95.59% | 93.10% |
| PortfolioRegistry.sol | 97.92% | 78.95% |
| PremiumDistributor.sol | 98.73% | 64.71% |
| NavOracle.sol | 97.62% | 62.50% |
| AdapterRegistry.sol | 100.00% | 66.67% |
| BordereauOracle.sol | 97.22% | 73.33% |
| ClaimReceipt / VaultDeployer / MockUSDC / MockOracle | 100% | 100% |

Trend: total branch coverage rose from the 2026-06-13 production-readiness audit
baseline (61.66%) to 70.87% after the UPR + targeted-coverage work; InsuranceVault
branches 55.93% -> 82.09%. Weakest branch coverage now: ClaimManager 58.62%,
NavOracle 62.50%, PremiumDistributor 64.71%, AdapterRegistry 66.67%.

## 4. Static-analysis findings (manual detector-category review)

Detector categories checked against `contracts/src/*.sol` with grep + targeted
reading, prioritizing InsuranceVault, ClaimManager, PolicyRegistry, VaultFactory,
NextBlockLens and the governance/role contracts (ProtocolRoles, ProtocolTimelock,
ComplianceRegistry).

| ID | Category | Severity | Result / Evidence |
|---|---|---|---|
| S-1 | Reentrancy on fund-moving paths | P2 (clean) | `nonReentrant` on `ClaimManager.executeClaim` and `InsuranceVault.payPortfolioClaim`; CEI respected (state decremented before `safeTransfer`, InsuranceVault.sol payout). No external call before state write. |
| S-2 | Low-level call / delegatecall / selfdestruct / tx.origin / inline assembly | P2 (clean) | grep over `src/*.sol`: 0 occurrences. |
| S-3 | Unchecked ERC20 return / raw transfer | P2 (clean) | SafeERC20 used (InsuranceVault, PremiumDistributor); no raw `.transfer`/`.send`. |
| S-4 | Arbitrary `from` in transferFrom (approval theft) | P2 (clean) | All `safeTransferFrom` use `msg.sender` as `from` (InsuranceVault:451,559; PremiumDistributor:174). |
| S-5 | Missing access control on privileged state changes | P2 (clean) | Every privileged external is role-gated (`onlyProtocolRole`/`onlyVaultManager`/`onlyClaimManager`/`onlyVaultAllocator`/`onlyOwner`). Only ungated state-changing externals are `attachAssessment` and `executeClaim` (intentional, see FP-1/FP-2). |
| S-6 | Privilege escalation / unbounded admin | P1 (known, tracked) | Deployer EOA still holds all roles on staging until Governance Phase 2 Stage A executes. Mitigated in UI/docs; tracked in PRODUCTION_READINESS_AUDIT P0-1 and GOVERNANCE_PREFLIGHT. Not introduced here. |
| S-7 | Oracle/AI authority | P2 (clean) | NAV/AI behind adapters; AIAssessor cannot approve/pay; committee-only approval + dispute window enforced in ClaimManager. |
| S-8 | Unbounded loops (DoS) | P2 (closed) | Previously P-class; closed by the merged UPR fix (bounded active sets + pruning). No remaining unbounded iteration over historical arrays. |
| S-9 | Block-timestamp dependence | P2 (acceptable) | Used for UPR linear accrual and liveness/dispute windows by design (registry virtual clock = block.timestamp + offset). Manipulation surface negligible on Base; windows are >= hours/days. |
| S-10 | Constructor zero-address validation | P2 (clean) | InsuranceVault, ClaimManager, VaultAllocator, AIAssessor revert on zero core addresses. |

No P0 (real exploit) finding from the manual review.

## 5. False positives / accepted-by-design

| FP | Item | Rationale |
|---|---|---|
| FP-1 | `ClaimManager.attachAssessment` is permissionless (no role modifier) | By design: it only mirrors the AIAssessor advisory data into the claim lifecycle and can at most FREEZE an anomalous claim. It cannot approve, reject or move funds; the Sentinel unfreezes after review. Documented in NatSpec. |
| FP-2 | `ClaimManager.executeClaim` is permissionless | By design: it only triggers the vault payout of a claim the Claims Committee already APPROVED and the vault already RESERVED, under `nonReentrant` and the vault's solvency checks. Permissionless execution is a liveness feature (anyone can poke a matured, approved claim), not an authority. |
| FP-3 | `block.timestamp` usage flagged by generic detectors | Intentional time model; see S-9. |
| FP-4 | F2 hot-path pruning gas (from UPR fix) | Bounded (<= cap), ~+2-4k gas typical; documented non-blocking optimization, not a security issue. |

## 6. Required fixes
**None blocking.** No P0 introduced or found. The manual review surfaced no
confirmed exploit. The only standing security-class item is S-6 (single-EOA
governance), which is a pre-existing, separately-tracked P0-for-production that
is closed by executing Governance Phase 2 Stage A (payload already prepared) and
is out of scope for this contracts-only baseline.

## 7. Proposed Slither setup (requires explicit authorization — invasive)

To replace the manual review with a reproducible automated pass:

```bash
# one-time, in an isolated venv (does not touch repo deps)
python -m venv .slither-venv && . .slither-venv/Scripts/activate
pip install slither-analyzer
# Foundry's svm solc is auto-detected by slither's foundry integration:
cd contracts && slither . --foundry-compile-all
```

Optionally add a CI job (`slither-analyzer` GitHub Action) gated to fail on
High/Medium only, with a triaged `slither.db.json` baseline so accepted FPs do
not re-alarm. I have NOT made any of these changes; awaiting your go-ahead.

## 8. Recommendation

**Proceed to pilot-readiness, with two pre-external-audit follow-ups (non-blocking
for pilot):**
1. Run the authorized Slither pass (section 7) and triage into this report before
   engaging an external auditor.
2. Lift branch coverage on the weak modules (ClaimManager 58.62%, NavOracle,
   PremiumDistributor, AdapterRegistry) toward the >=80% audit-readiness target;
   the protocol-wide branch figure is 70.87% today.

Solvency-critical paths (vault accounting, claim payout, role separation,
oracle/AI authority) show clean manual results and strong coverage
(InsuranceVault 95.65% lines / 82.09% branches; Lens/Roles/Timelock 100%). No
correctness regression from the recently merged UPR fix or Claim UI.

---
*Author: Anton Carlo Santoro. Baseline produced read-only at commit `d709c35`
on 2026-06-13. Automated static analysis (Slither/Aderyn) pending authorized
setup; this pass is `forge coverage` + manual detector-category review.*
