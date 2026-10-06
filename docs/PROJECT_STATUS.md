# Project status — what is real, what is advisory, what remains

**Snapshot: 2026-07-08** (post PR #84). Update this file whenever a
workstream lands or a mock becomes real — it supersedes the historical
[NEXTBLOCK_GAP_MATRIX](../NEXTBLOCK_GAP_MATRIX.md) (2026-06-11 baseline) as
the single answer to "where is the project?".

A new engineer reading only this page should know exactly what exists, what
to trust, and what to build next.

## 1. Module map (canonical MVP sequence)

| # | Module | Status | Notes |
|---|---|---|---|
| 1 | `ProtocolRoles` / `ComplianceRegistry` / `ProtocolTimelock` | **Present** | On-chain RBAC + ERC-3643-style gate (transfer hook `_update`, KYC expiry, venue approval). Governance phases 1 and 2 done on the 2026-10-02 generation (timelock `0xD94ea36FD19a0D3Cb3A8EA1214C6F97A947e5950` holds OWNER_ROLE and DEFAULT_ADMIN_ROLE, Safe proposer, deployer renounced) |
| 2 | `VaultFactory` / `VaultDeployer` | **Present** | Permissioned independent vault instances |
| 3 | `InsuranceVault` (nbUSDC) | **Present** | ERC-4626 + UPR + 20% buffer + compliance hook + management fee. No performance fee (open business decision) |
| 4 | `PolicyRegistry` | **Present** | Incl. one-way `lockRealTime()` — flips the whole protocol to the real block clock for truthful tests |
| 5 | `AdapterRegistry` / `IRiskPoolAdapter` | **Partial** | Registry + interface only; no external risk-pool adapter integrated (needs a vendor decision) |
| 6 | `PremiumDistributor` | **Present** | Real USDC `safeTransferFrom` splits. Single-vault-per-portfolio (MVP) |
| 7 | `NavOracle` | **Partial — advisory** | Real attestation store + staleness guards + **publisher node** (reference canonical serializer, HMAC auth, fail-closed CLI — #83); the NAV keeper (pull from Braino, HMAC-verified, deviation-aware) is built and idle; **the feed stays off** until the Braino sandbox keys exist — [AI_INTEGRATION.md](AI_INTEGRATION.md) |
| 8 | `ClaimManager` / `ClaimReceipt` | **Present** | 3 verification types, liveness/dispute, committee approval, CEI payout |
| 9 | `AIAssessor` | **Partial — advisory** | Store is real, can never approve/trigger payouts; the Braino claim-assessment client is built and idle, and the mock provider is refused on production — vendor not connected |
| 10 | `VaultAllocator` | **Present** | Proposal+TTL, concentration caps, advisory NAV guard, fully curator-parametrized (demo split removed) |
| 11 | `BordereauOracle` | **Partial — advisory** | Deployed: UMA-style liveness (2d) + committee verify, **no economic bonds**. `UmaBordereauOracle` (real UMA OOv3 bonds, no committee override) is built and fork-tested, awaiting the next deployment |
| 12 | `NextBlockLens` / frontend / indexer | **Present** | Lens read-model, 24+ app routes, **full-protocol subgraph** (12 datasources + vault factory template, #76) + typed SDK with staleness (#77) — subgraph deploy owner-gated; Supabase backend; DataSource badges label anything mock-fed |
| + | `RedemptionQueue` | **Present, live** | Periodic-window pro-rata LP exit + keeper workflow + subgraph |
| + | `lending/` (LendingMarket + NavShareOracle) | **Present** | nbUSDC-collateral borrow market (guarded NAV attestation) |

## 2. Real vs mock — the honest table

The full register of what is not real, what closed it and what is left is [NOT_REAL_YET.md](NOT_REAL_YET.md).

| Concern | Verdict |
|---|---|
| USDC flows (deposits, premiums, redemptions, claim payouts) | ✅ **Real code on a real token**: the vaults settle in Circle's USDC on Base Sepolia (testnet, no monetary value); mainnet will use native USDC |
| Compliance gate (whitelist, KYC expiry, transfer hooks) | ✅ **Real, on-chain** — never frontend-only |
| Time (UPR / fees / expiry) | ✅ **Real and locked**: `lockRealTime()` was executed through the Safe on 2026-10-02 (block 47592962); the clock is the block clock for good and `advanceTime` reverts ([runbook](../contracts/REDEPLOY_RUNBOOK.md)) |
| Documents (bordereau/treaty/SOV) | ✅ **Real & confidential**: keccak256 of actual bytes on-chain, file in private bucket, public IPFS manifest only |
| Bordereau ingestion | ✅ Real parser (native .xlsx + CSV, zero-dep) prefilling the on-chain submission |
| NAV / risk score / AI assessment | ⚠️ **Advisory, not fed** — nothing is produced by an AI today; the NextBlock side is ready ([AI_INTEGRATION.md](AI_INTEGRATION.md)) and waits for the Braino/WAVENURE sandbox (Bucket B) |
| Records already in the database | ⚠️ **Test records, not counterparties**: 8 KYB applications, all approved (one is labelled fictitious, the others are the owner's own test entries), and one set of curator-published offering terms for the previous generation's vault. They are not hidden; they should be confirmed or deleted by the owner |
| Sanctions audit log before 2026-10-05 | ❌ **All 49 recorded screening runs (42 entities, 7 wallets, July to October) were made by the fixture provider, which answers "clear" to everything.** They prove nothing. On 2026-10-05 the 8 approved applications and their 4 wallets were screened for real, read-only: no wallet is sanctioned and no name is listed, except that the one-word names `CARL` and `Carl` equal an OFAC entry of the same name and would be held for Sentinel review. The old rows are kept as history and must not be cited as screening; the monthly re-screening job writes real runs from now on |
| Sanctions screening of entities | ✅ **Real, no account needed, limited coverage**: the official OFAC SDN, OFAC consolidated and UN Security Council lists, matched by name; every run records the exact lists consulted (size, SHA-256). It does **not** cover the EU or UK lists, PEP status or adverse media: those need a commercial provider (`SANCTIONS_PROVIDER=complyadvantage`) |
| Sanctions screening of wallets | ✅ **Real, no account needed, yes/no only**: Chainalysis's public sanctions oracle on Base. No risk scoring, mixers or scam clusters |
| E-mail | ⚠️ **Not configured**: nothing is sent and nothing says it was. Needs a Resend account and a verified domain |
| Providers that fabricate answers (sanctions, wallet, e-mail, AI fixtures) | ✅ **Cannot run on production**: the factories refuse them, the admin status page reports each surface as live / idle / misconfigured, and `app/scripts/providers-smoke.ts` pins it |
| Bordereau attestation economics | ⚠️ Liveness real, **no bonds** on what is deployed. The UMA-backed contract is built and tested against the real oracle; it goes live with the next deployment |
| External risk-pool adapters | ⚠️ Interface only (vendor decision) |
| KYB/KYC pipeline | ⚠️ Real workflow (queue, review, one-click on-chain whitelist, notifications) but **no licensed KYC provider** behind it (Bucket B) |
| Governance | ⚠️ Timelock + Safe live; the deployer renounced (2026-10-02); the timelock delay is now **24 h** (2026-10-05); the Safe has **three owners and threshold 2**, but the third owner has never signed, so it is not yet proven; the operational roles are still held by **simulation identities**. Testnet-grade: [GOVERNANCE_HARDENING.md](GOVERNANCE_HARDENING.md) |
| Legacy contracts | ⚠️ `MockOracle` (BTC price / flight delay) is still referenced by `InsuranceVault.oracle` from the original design; nothing in the vault reads it, and removing it needs a new vault generation. The deployed lens labels oracle-fed figures `MOCK_ORACLE`, a historical name fixed in its bytecode; the site shows them as "Oracle-attested" once something is published |
| Market figures on the landing page | ✅ Sourced: Gallagher Re, Reinsurance Market Report, full-year 2025 (capital $648B, of which alternative $135B, +11%). Unsourced figures and the correlation table were removed |
| Underlying risk | ❌ **Requires the legal wrapper** — SPV/cell + pilot treaty ([Bucket C spec](BUCKET_C_SPV_PILOT.md)). No code makes this real |

## 3. Shipped workstreams (chronological, with PRs)

| Workstream | Landed |
|---|---|
| Core protocol phases 1–12 + demo flow | pre-June baseline |
| Claims Control Room + evidence management (private storage, hash-verified) | #28, #29 |
| Money Flow ledger + investor statement | #27 |
| Permissioned lending market (nbUSDC collateral) | #25, #26 |
| Security overrides + workspace lockfile relocation | #31 |
| KYB durable state, hybrid email+wallet RBAC, role handoff | mid-June series |
| Notifications (in-app + pluggable email) + claims audit trail + sanctions screening | #43 era |
| RedemptionQueue: 3-layer tests, live deploy, keeper cron, subgraph, UI | #45–#51 era |
| 3-role apply (Reinsurer / Syndicate Curator / Institutional LP) | #52 |
| Testnet nav admin-gating; LP KYB enum + build unblock | #53, #54 |
| Vercel deploy unfreeze (Hobby-plan crons removed) | #55 |
| LP admin approval flow (pending banner, role badges, email alert) | #56 |
| **Real spine**: `lockRealTime`, confidential-capable IPFS pinning, curator-parametrized allocation | #57 |
| Bordereau parser (CSV + native .xlsx) | #58 |
| Confidential pinning (private bucket + public manifest + reviewer download) | #59 |
| Ops hardening: scheduled-jobs workflow, redeploy runbook, Bucket C legal spec | #60 |
| UX frictions: one-click whitelist, next-step CTAs, LP nudge, admin cleanup, cedant path steps | #61 |
| Institutional documentation suite (docs index, onboarding, this file) + observability (structured logs, health endpoint, error boundary) | #62 |
| Mobile responsiveness (landing + app nav) and desktop header regression fix | #63, #65 |
| Internal analytics: pageviews + behavioral events + admin dashboard → v2 (all-time history, cities, click geo, Vercel Analytics) → client pageview fallback | #64, #69, #70 |
| Braino v2 oracle & AI-services specification (ready for the Braino team) | #66 |
| Site polish: legal pages (privacy/terms), SEO (robots/sitemap), data-retention purge, monthly backup workflow | #67 |
| 100% NatSpec coverage of the contracts public surface + CI gate | #68 |
| Docs author-attribution cleanup | #72 |
| CI hard gates: gas ratchet (concrete tests), 95% coverage floor, Slither fail-on-high; monthly-backup phantom-run fix | #74, #82 |
| Compliance copy (illustrative-APY labeling, honest exit copy) + env health check + zero-vendor uptime alert | #75 |
| Full-protocol event indexer (12 datasources + vault factory template, 21 entities) | #76 |
| Typed subgraph SDK with _meta staleness verdicts | #77 |
| Curator-published vault offering terms (DB+API+console+UI labeling; replaces the static demo metadata) | #78 |
| Claims finalization keeper (pays approved claims, finalizes elapsed assertions; 6h cron) | #79 |
| Settlement reporting from indexed history (per-portfolio statements + vault rollup) | #80 |
| Governance execution console (Safe→timelock batches, cast-parity operation ids) | #81 |
| NAV oracle publisher node (canonical serializer, HMAC, fail-closed publish CLI) | #83 |
| Read-path E2E suite (Playwright vs production build + live chain reads) + CI job | #84 |
| Redeploy preparation: separated-roles guard, deployer gives back borrowed roles, governance phase 1 records the timelock, generated ABIs with a CI drift check, rehearsal script | this PR |
| Lending layer on an already-deployed generation (`DeployLendingLayer`), fees to the governance Safe | this PR |

## 4. Open scope (what to build next)

**Owner-gated operational (hours):**
1. **Fresh generation deployed and handed over, 2026-10-02** on Base Sepolia, settling in Circle's USDC: roles on separate holders, lending layer added, governance phases 1 and 2 done (timelock rehearsal executed, then the deployer renounced), security-review fixes F-07…F-12 live, all verified on-chain read-only. The site, the keeper variables and the Goldsky subgraph (`indexer/subgraph.yaml`, v3) point at this generation. Real time locked the same day through the Safe (`lockRealTime()`, block 47592962) — [runbook](../contracts/REDEPLOY_RUNBOOK.md). Owner-gated wiring to keep aligned with `contracts/deployments/84532-staging.json`: GitHub variable `REDEMPTION_QUEUE_ADDRESS` and secrets `KEEPER_PRIVATE_KEY`, `BASE_SEPOLIA_RPC_URL`, `CRON_SECRET`. The Safe is single-signer: make it a real multisig before real value.
1b. **Governance hardening** — Safe to 2-of-3, timelock delay to 24 h (data prepared and rehearsed on a fork), simulation identities replaced by the real operators: [GOVERNANCE_HARDENING.md](GOVERNANCE_HARDENING.md). Everything in the code that can be made real without a vendor account already is; what is left below is what only an outside party can supply.

**Bucket B — external vendors (blocked on accounts/keys, adapters ready):**
2. Braino/WAVENURE integration → `NavOracle`/`AIAssessor`/`VaultAllocator` — **formal v2 spec ready to send to the Braino team**: [braino-oracle-spec.md](../contracts/docs/integrations/braino-oracle-spec.md) (5 services incl. agentic allocator; see also [real-providers.md](../contracts/docs/integrations/real-providers.md))
3. Real UMA OOv3 bordereau assertions with bonds. The contract is built (`UmaBordereauOracle`, [UMA_BORDEREAU_ORACLE.md](UMA_BORDEREAU_ORACLE.md)); the app and the subgraph already handle it, so what remains is deploying it and pointing the subgraph at the new address ([NOT_REAL_YET.md](NOT_REAL_YET.md) §3b)
4. Licensed KYC/KYB provider → in front of `ComplianceRegistry`
4b. E-mail: a Resend account and a verified sending domain (`EMAIL_PROVIDER=resend`)
4c. If EU/UK lists, PEP or adverse-media screening is required: a ComplyAdvantage account (the adapter exists)

**Bucket C — legal (weeks, parallel):**
5. SPV/cell + pilot treaty — [spec for counsel](BUCKET_C_SPV_PILOT.md)

**Product backlog (unordered):**
6. Performance fee (business decision) · multi-vault-per-portfolio splits ·
   secondary nbUSDC transfers UX (hook ready) · statement PDF export ·
   fiat on/off-ramp + qualified custody · external security audit + bounty ·
   mainnet deployment plan (native USDC)

## 5. Update protocol for this file

When you land a workstream: add the PR to §3, flip any §1/§2 rows it changes,
prune §4. If you make a mock real, move it explicitly — this table is the
contract between the code and whoever reads it next.
