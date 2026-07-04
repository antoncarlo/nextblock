# Braino.ai / WAVENURE — Oracle & AI Services Specification (v2)

**Audience.** The Braino engineering team. This document is the complete,
self-contained contract for integrating Braino's AI with the NextBlock
protocol (Base; staging on Base Sepolia 84532). It supersedes the NAV/AI
sections of `real-providers.md` and extends them with the allocator, claims
and analytics services.

**One-line summary.** Braino produces **signed, deterministic, evidence-backed
numbers**; NextBlock pulls them, validates them, and publishes them on-chain
through its own keeper. Braino never holds keys, never signs transactions,
and never has final business authority.

---

## 0. Authority boundary (non-negotiable)

| Braino CAN | Braino CANNOT |
|---|---|
| Compute NAV, risk scores, claim assessments, allocation strategies, analytics | Approve or pay a claim (Claims Committee only) |
| Recommend with confidence scores | Move funds or mint/burn shares |
| Trigger *proposals* inside on-chain caps (allocator service) | Exceed concentration caps, TTLs, coverage limits (enforced on-chain) |
| Flag anomalies | Unpause its own feed (Sentinel only) |

Everything Braino outputs is **advisory** and anchored on-chain via a
`sourceHash` (§5). If a number is ever disputed, Braino must be able to
produce the exact report whose keccak256 equals the on-chain hash.

## 1. Architecture (pull model)

```
Braino API (your side)              NextBlock backend                    Base
┌──────────────────────┐  HTTPS +   ┌───────────────────────────┐  tx   ┌──────────────┐
│ models + REST API    │  HMAC     │ scheduled jobs (15 min)    │ ────► │ NavOracle     │
│ (5 services below)   │ ◄───────── │ adapter + publisher keeper │ORACLE │ AIAssessor    │
│ report store (yours) │            │ (dedicated ORACLE_ROLE     │_ROLE  │ VaultAllocator│
└──────────────────────┘            │  and ALLOCATOR_ROLE keys)  │       └──────────────┘
```

- **NextBlock calls Braino** (pull), on a 15-minute cadence for NAV/risk and
  on-demand for claims/allocations. Braino never calls the chain.
- Two dedicated NextBlock-held keys: `ORACLE_ROLE` (publishes attestations)
  and `ALLOCATOR_ROLE` (executes allocation proposals). Compromise of either
  is bounded by on-chain guards (§7).

## 2. Transport & security requirements (all endpoints)

| Requirement | Detail |
|---|---|
| Auth | Every response carries `X-Braino-Signature: hex(hmac_sha256(shared_secret, raw_body))`. Shared secret exchanged out-of-band, rotatable. |
| Idempotency | Same request → same `reportId` → byte-identical `report`. We may re-request at any time. |
| Determinism | Same inputs → same outputs. If a model version changes results, bump `modelVersion`; never silently. |
| Versioning | Path-versioned (`/v1/...`). Breaking changes = new version, 90-day overlap. |
| Confidence | Every quantitative answer includes `confidence` ∈ [0,1]. Below our on-chain minimum it is rejected — return your honest confidence, not 1.0. |
| Latency | ≤ 10 s for NAV/risk/allocation; ≤ 60 s for claim assessment (evidence analysis). |
| Report retention | Full `report` objects retained ≥ 7 years, retrievable by `reportId`. |
| Sandbox | A staging environment with deterministic fixtures, available before production keys. |

Common response envelope:

```json
{
  "reportId": "brn_2026-07-04_...",
  "modelVersion": "wavenure-x.y.z",
  "asOf": "2026-07-04T12:00:00Z",
  "confidence": 0.93,
  "result": { ... service-specific ... },
  "report": { ... full auditable reasoning/evidence, any shape ... }
}
```

## 3. The five services

### S1 — Vault NAV attestation
`POST /v1/nav`

Request (from NextBlock): `{ chainId, vaultAddress, snapshot }` where
`snapshot` is the Lens dashboard for the vault (totalAssets, UPR, claim
reserves, per-portfolio allocations, buffer) plus the active portfolios'
risk context.

`result`: `{ "nav": "1234567.123456", "currency": "USDC" }` (string decimal,
6 dp).

Published on-chain as `NavOracle.publishNav(vault, nav6, confidenceBps,
sourceHash)`. Guards you must expect: max staleness, max deviation vs
previous NAV (breach = feed auto-pause), min confidence.

### S2 — Portfolio risk / underwriting assessment
`POST /v1/risk`

Request: `{ portfolioId, documentHash, bordereauSummary, treatyTerms,
lossHistory? }`. `documentHash` is the on-chain keccak256 of the bordereau —
your report MUST reference it.

`result`:
```json
{
  "expectedLossBps": 420,
  "recommendedPricingBps": 610,
  "maxRecommendedCapacity": "5000000.00",
  "exclusions": ["flood zones X", "..."],
  "riskFactors": [{ "name": "...", "weightBps": 1200, "note": "..." }]
}
```

`expectedLossBps` goes on-chain via `NavOracle.publishPortfolioRisk`; the
full result feeds the Underwriting Curator's approval screen. **The Curator
approves — you prepare the dossier.**

### S3 — Claim assessment (the pay/no-pay recommendation)
`POST /v1/assess`

Request: `{ claimId, portfolioId, requestedAmount, coverageLimit,
policyTerms, evidence: [{ contentHash, url (short-lived signed URL),
contentType }], description, cedantLossHistory? }`.

Your assessment MUST evaluate, explicitly and separately, these criteria
(they appear as structured fields in `report`):

1. **Coverage validity** — event inside policy period, amount ≤ limit.
2. **Evidence integrity & completeness** — analyze the documents at the
   signed URLs; their hashes are already anchored on-chain by NextBlock.
3. **Loss quantification** — independent damage estimate vs requested.
4. **Fraud / anomaly** — patterns, timing, duplicates, inconsistencies.
5. **Terms fit** — exclusions and sub-limits of the treaty.

`result`:
```json
{
  "score": 0.81,
  "anomaly": 0.12,
  "recommendation": "APPROVE" | "REVIEW" | "REJECT",
  "recommendedAmount": "50000.00",
  "criteria": { "coverage": "pass", "evidence": "pass", "quantification": "partial", "fraud": "low", "terms": "pass" }
}
```

Published as `AIAssessor.publishAssessment(claimId, scoreBps,
anomalyScoreBps, confidenceBps, recommendation, recommendedAmount6,
sourceHash)`. The Claims Committee sees it and decides; for non-parametric
claims the committee approval and dispute window are **never bypassed**.
(Parametric claims are settled from objective oracle data — e.g. Chainlink
feeds — and are out of Braino's decision path by design.)

### S4 — Allocation strategy (agentic allocator)
`POST /v1/allocate`

Request: `{ vaultAddress, investableBase, currentAllocations:
[{ portfolioId, amount, expectedLossBps, coverageLimit, cedant }],
pendingPremiums, riskUpdatesSinceLast }`.

`result`:
```json
{
  "targetAllocations": [{ "portfolioId": 3, "targetAmount": "1200000.00", "rationale": "..." }],
  "moves": [{ "action": "allocate" | "deallocate", "portfolioId": 3, "amount": "200000.00" }],
  "urgency": "routine" | "elevated" | "emergency"
}
```

NextBlock's allocator bot turns `moves` into on-chain
`proposeAllocation` / `proposeSplitAllocation` calls. **Hard limits enforced
on-chain, not by you** (return moves inside them or they revert):
per-portfolio concentration ≤ 40% of investable base, per-cedant ≤ 60%,
proposal TTL, vault coverage caps, advisory-NAV guard (anomalous feed blocks
new allocations).

Autonomy is staged on our side: L1 = your moves require human execution;
L2 (pilot) = auto-executed within caps, Sentinel veto; L3 (V2) = 15-minute
rebalance cadence. Design for L3, we ship at L1/L2.

### S5 — Analytics & anomaly monitoring
`POST /v1/analytics/run` (daily) and `GET /v1/analytics/alerts` (polled by
our jobs).

Inputs: Lens snapshots, subgraph exports (redemptions), premium/UPR history,
claims history. Outputs: loss ratios per portfolio/cedant, IBNR trend,
stress scenarios, and `alerts` (e.g. "cedant X claim frequency 3σ above
cohort") with severity — surfaced to Curator/Sentinel dashboards. Alerts
never trigger on-chain actions directly.

## 4. Data NextBlock provides to Braino

| Data | Channel | Notes |
|---|---|---|
| Vault/portfolio/claim state | JSON snapshots from `NextBlockLens` (read-only contract) included in requests | canonical read model |
| Bordereaux / treaty docs / claim evidence | **short-lived signed URLs** (60 s) inside requests | confidential: fetch immediately, never re-host publicly; hashes are anchored on-chain |
| Redemption/flow history | subgraph export bundle | |
| Historical assessments | your own report store | |

## 5. The `sourceHash` evidence protocol

For every published number, NextBlock computes
`sourceHash = keccak256(canonical_json(report))` (canonical = sorted keys,
UTF-8, no insignificant whitespace — we provide the reference serializer)
and anchors it on-chain with the value. Consequences for Braino:

- The `report` you return is **the** audit artifact. Persist it verbatim.
- `GET /v1/reports/{reportId}` must return it byte-identical, ≥ 7 years.
- A disputed number with a non-matching or missing report is treated as a
  provider failure (SLA breach + feed pause).

## 6. On-chain guardrails (context for your team)

Already live in the contracts — your outputs operate inside them:
staleness windows and deviation auto-pause on NAV (`NavOracle`), minimum
confidence, Sentinel pause/unpause per feed, advisory-only assessments
(`AIAssessor` cannot approve/pay), allocation caps/TTL/concentration
(`VaultAllocator` + `InsuranceVault` as final authority), committee + dispute
window on all non-parametric claims (`ClaimManager`).

## 7. SLA & operations

| Item | Target |
|---|---|
| Availability | 99.5% monthly (staging), 99.9% (production) |
| NAV/risk freshness | new attestation ≤ every 15 min when inputs changed; heartbeat ≤ 6 h regardless |
| Claim assessment | ≤ 60 s from request |
| Incident channel | named contact + ≤ 1 h acknowledgement for feed-impacting issues |
| Change management | `modelVersion` bump + changelog for any output-affecting change; 7-day notice for breaking API changes |

## 8. Delivery phases & acceptance

| Phase | Scope | Acceptance test |
|---|---|---|
| P1 | S3 claims + S2 risk (sandbox) | 20 fixture claims: deterministic outputs, signatures verify, reports retrievable by id, criteria fields populated |
| P2 | S1 NAV | 7-day soak on staging: no staleness breaches, deviation guard never tripped by noise |
| P3 | S4 allocator (L1 then L2) | proposals always inside caps across a 100-scenario replay; zero reverts |
| P4 | S5 analytics | alert precision review with Curator |

NextBlock side is ready to consume from P1 day one: the backend adapter is
pluggable (`AI_ASSESSOR_PROVIDER=braino`), the scheduled jobs exist, and the
on-chain functions are deployed. What we need from Braino to start:
**sandbox base URL + HMAC secret + fixture set.**

---

*NextBlock protocol — Base-only. Contacts and keys exchanged out-of-band;
nothing sensitive belongs in this document.*
