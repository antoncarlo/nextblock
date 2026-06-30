# NextBlock — Claims Control Room — Sub-project 1: Queue + Timeline UI — Design Spec

- **Author:** Anton Carlo Santoro
- **Date:** 2026-06-16
- **Status:** Draft — pending owner review
- **Branch:** `feat/claims-control-room-ui`
- **Maps to:** Figma module 05 — Claims Processing (Manus roadmap Phase 3).

## 1. Context & decomposition

Full Claims Control Room (owner chose the backend-inclusive version) is a
multi-subsystem platform, decomposed and sequenced **1 → 2 → 3 → 4**:

1. **Queue + timeline UI** (this spec) — frontend, on-chain reads. Foundation.
2. Evidence management (Supabase Storage + on-chain hash) — backend.
3. Notifications (email/in-app + preferences) — backend.
4. Indexed audit trail (actors/tx/timestamps) — needs the event indexer.

This spec covers **sub-project 1 only**. It builds on the existing claim
infrastructure (`ClaimManager`, `NextBlockLens.getClaimDashboard`,
`useAllClaims`/`ClaimView`, `ClaimLifecyclePanel`) — nothing on-chain changes.

## 2. Scope

### In scope
- A claims **queue / control room** at `/app/claims`: lists all claims via
  `useAllClaims`, filterable by status / vault / anomaly, sortable, with an
  SLA-age badge.
- A per-claim **decision timeline** derived from on-chain claim state
  (Submitted → Assessed → Disputed → Approved → Paid/Rejected + dispute window).
- Role-aware actions via the existing `ClaimLifecyclePanel` (committee/sentinel/
  admin); read-only otherwise.
- A pure derivation lib (`claimsqueue.ts`) + smoke test; `tsc`/eslint/`next build`.

### Out of scope (later sub-projects)
- Evidence upload/storage/download (sub-project 2).
- Notifications (sub-project 3).
- Per-state actor/tx/timestamp audit trail (sub-project 4 — needs indexer). The
  timeline shows reached states + the two on-chain timestamps (`submittedAt`,
  `challengeDeadline`); full per-transition history is deferred.

## 3. Approach
Frontend, reusing `useAllClaims` (canonical lens read). Pure lib for filtering,
SLA and timeline derivation. No contract change, no backend. Mirrors the Money
Flow / lending-UI pattern (pure `lib/` + hook + components + route + smoke).

## 4. Components (frontend)

### 4.1 `app/src/lib/claimsqueue.ts` (pure)
- `filterClaims(claims, { status?, vault?, anomalyOnly? })`
- `sortClaims(claims)` — newest-first (already from `useAllClaims`; stable helper).
- `claimAgeSeconds(claim, nowSec)` and `isOverdue(claim, nowSec, thresholdSec)` —
  overdue only when status is pending (Submitted/Assessed/Disputed).
- `severityOf(claim)` — `anomalous` / high `assessmentAnomalyBps` → high; else normal.
- `deriveClaimTimeline(claim)` → ordered steps `{ key, label, reached, timestamp? }`
  for Submitted, Assessed, Disputed, DisputeWindow, Approved, Paid/Rejected.
- Uses `ClaimStatus`/labels from `useClaimLifecycle` (single source of truth).

### 4.2 `app/src/components/claims/ClaimsControlRoom.tsx`
Queue table: id, vault, portfolio, amount, type, status (existing label/colors),
age (SLA badge), dispute-window, anomaly. Filter controls (status/vault/anomaly).
Empty / unavailable states. Selecting a row reveals the decision timeline + the
existing `ClaimLifecyclePanel` for that claim.

### 4.3 `app/src/components/claims/ClaimTimeline.tsx`
Renders `deriveClaimTimeline(claim)` as a vertical timeline with reached/pending
states and the known timestamps; a note that full per-state history needs the ledger.

### 4.4 Route + nav
`/app/claims` page rendering `ClaimsControlRoom` (role-aware via existing
`useProtocolAccess`/`useWalletRole`); nav link in the header.

## 5. Data flow
`ClaimManager`/`NextBlockLens` (on-chain) → `useAllClaims` (existing) →
`filterClaims`/`deriveClaimTimeline` (pure) → `ClaimsControlRoom`/`ClaimTimeline`.
Actions flow through the existing `ClaimLifecyclePanel` (`useClaimActions`).

## 6. Testing
- `app/scripts/claimsqueue-smoke.ts` (node strip-types): filter by status/vault/
  anomaly, SLA age + overdue threshold (pending vs settled), timeline reached/pending
  derivation across statuses, severity.
- `tsc --noEmit`, eslint 0 errors, `next build` (`/app/claims` route emitted).

## 7. Honest limitations
- Timeline shows reached states + `submittedAt`/`challengeDeadline` only; per-state
  actor/tx/timestamp history needs the event indexer (sub-project 4).
- SLA is display-only (no persistence/alerting; alerting is the monitoring workstream).
- Evidence is shown as the on-chain `evidenceHash` only; document upload/preview is
  sub-project 2.
