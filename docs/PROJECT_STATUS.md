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
| 1 | `ProtocolRoles` / `ComplianceRegistry` / `ProtocolTimelock` | **Present** | On-chain RBAC + ERC-3643-style gate (transfer hook `_update`, KYC expiry, venue approval). Governance phase 1 live (timelock holds OWNER_ROLE, Safe proposer); phase-2 EOA handover pending rehearsal |
| 2 | `VaultFactory` / `VaultDeployer` | **Present** | Permissioned independent vault instances |
| 3 | `InsuranceVault` (nbUSDC) | **Present** | ERC-4626 + UPR + 20% buffer + compliance hook + management fee. No performance fee (open business decision) |
| 4 | `PolicyRegistry` | **Present** | Incl. one-way `lockRealTime()` — flips the whole protocol to the real block clock for truthful tests |
| 5 | `AdapterRegistry` / `IRiskPoolAdapter` | **Partial** | Registry + interface only; no external risk-pool adapter integrated (needs a vendor decision) |
| 6 | `PremiumDistributor` | **Present** | Real USDC `safeTransferFrom` splits. Single-vault-per-portfolio (MVP) |
| 7 | `NavOracle` | **Partial — advisory** | Real attestation store + staleness guards + **publisher node** (reference canonical serializer, HMAC auth, fail-closed CLI — #83); **feed stays manual** until Braino sandbox keys exist |
| 8 | `ClaimManager` / `ClaimReceipt` | **Present** | 3 verification types, liveness/dispute, committee approval, CEI payout |
| 9 | `AIAssessor` | **Partial — advisory** | Store is real, can never approve/trigger payouts; Braino/WAVENURE feed not wired |
| 10 | `VaultAllocator` | **Present** | Proposal+TTL, concentration caps, advisory NAV guard, fully curator-parametrized (demo split removed) |
| 11 | `BordereauOracle` | **Partial — advisory** | UMA-style liveness (2d) + committee verify; **no economic bonds** (real UMA OOv3 is future work) |
| 12 | `NextBlockLens` / frontend / indexer | **Present** | Lens read-model, 24+ app routes, **full-protocol subgraph** (12 datasources + vault factory template, #76) + typed SDK with staleness (#77) — subgraph deploy owner-gated; Supabase backend; DataSource badges label anything mock-fed |
| + | `RedemptionQueue` | **Present, live** | Periodic-window pro-rata LP exit + keeper workflow + subgraph |
| + | `lending/` (LendingMarket + NavShareOracle) | **Present** | nbUSDC-collateral borrow market (guarded NAV attestation) |

## 2. Real vs mock — the honest table

| Concern | Verdict |
|---|---|
| USDC flows (deposits, premiums, redemptions, claim payouts) | ✅ **Real** (staging asset is MockUSDC; mainnet will use native USDC) |
| Compliance gate (whitelist, KYC expiry, transfer hooks) | ✅ **Real, on-chain** — never frontend-only |
| Time (UPR / fees / expiry) | ✅ Real in code via `lockRealTime()` — **flip it on the fresh generation before any company test** ([runbook](../contracts/REDEPLOY_RUNBOOK.md)) |
| Documents (bordereau/treaty/SOV) | ✅ **Real & confidential**: keccak256 of actual bytes on-chain, file in private bucket, public IPFS manifest only |
| Bordereau ingestion | ✅ Real parser (native .xlsx + CSV, zero-dep) prefilling the on-chain submission |
| NAV / risk score / AI assessment | ⚠️ **Advisory, manually fed** — needs Braino/WAVENURE API (Bucket B) |
| Bordereau attestation economics | ⚠️ Liveness real, **no bonds** — needs real UMA OOv3 (Bucket B) |
| External risk-pool adapters | ⚠️ Interface only (vendor decision) |
| KYB/KYC pipeline | ⚠️ Real workflow (queue, review, one-click on-chain whitelist, notifications) but **no licensed KYC provider** behind it (Bucket B) |
| Governance | ⚠️ Phase 1 (timelock+Safe) live; deployer EOA retained until rehearsed phase-2 handover |
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

## 4. Open scope (what to build next)

**Owner-gated operational (hours):**
1. Fresh-generation redeploy + `lockRealTime()` + governance phase 2 — [runbook](../contracts/REDEPLOY_RUNBOOK.md). The deployed staging generation predates the real-spine code.

**Bucket B — external vendors (blocked on accounts/keys, adapters ready):**
2. Braino/WAVENURE integration → `NavOracle`/`AIAssessor`/`VaultAllocator` — **formal v2 spec ready to send to the Braino team**: [braino-oracle-spec.md](../contracts/docs/integrations/braino-oracle-spec.md) (5 services incl. agentic allocator; see also [real-providers.md](../contracts/docs/integrations/real-providers.md))
3. Real UMA OOv3 bordereau assertions with bonds → `BordereauOracle`
4. Licensed KYC/KYB provider → in front of `ComplianceRegistry`

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
