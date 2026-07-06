# NextBlock — Claims Control Room — Sub-project 2: Evidence Management — Design Spec

- **Author:** Anton Carlo Santoro
- **Date:** 2026-06-18
- **Status:** Draft — pending owner review (security-sensitive)
- **Branch:** `feat/claims-evidence-management`
- **Maps to:** Figma module 05 — Claims Processing (product roadmap Phase 3), evidence layer.

## 1. Goal

Claims carry an on-chain `evidenceHash` (committed at submission). This sub-project
lets the claimant **upload** the actual evidence document to confidential storage,
and authorized reviewers (Claims Committee / Sentinel / Admin) **list, download and
integrity-verify** it against the on-chain hash. Confidential by design.

## 2. Security model (the crux — review carefully)

- **Private storage.** Supabase Storage **private** bucket `claim-evidence`. No
  public URLs. Objects are reachable only through short-lived signed URLs issued by
  the server after authorization. Bucket creation + the migration apply are **owner
  actions** (not performed from this branch).
- **Server-mediated, on-chain-gated auth** (mirrors `lib/kyb/auth.ts`: wallet
  signature + single-use nonce). The frontend gate is never the boundary:
  - **Upload** (`POST`): signer must be the **claimant** of that claim — verified
    on-chain (`ClaimManager`/lens: `claim.claimant === recoveredSigner`).
  - **List / download** (`GET`/signed URL): signer must hold `CLAIMS_COMMITTEE_ROLE`
    or `SENTINEL_ROLE` or `OWNER_ROLE` on-chain (`ProtocolRoles.hasRole`), **or** be
    the claimant of that claim.
- **RLS deny-by-default.** `claim_evidence` table has RLS enabled with **no public
  policy**; all reads/writes go through the service-role server routes only.
- **Integrity.** Server computes `keccak256(file bytes)` on upload and stores it;
  the UI compares it to the claim's on-chain `evidenceHash` and shows match/mismatch.
  The on-chain hash is the source of truth; storage only holds the matching document.
- **Service-role key** stays server-only (existing `supabase-server.ts`, fail-closed).

## 3. Components

### 3.1 Migration `supabase/migrations/<ts>_0004_claim_evidence.sql`
- Table `claim_evidence`: `id uuid pk`, `claim_id bigint`, `vault text`,
  `storage_path text`, `content_hash text` (0x-keccak), `file_name text`,
  `content_type text`, `size_bytes bigint`, `uploader_addr text`, `created_at timestamptz`.
  Index on `claim_id`.
- RLS enabled, **no policy** (service-role only) — same posture as KYB durable tables.
- Storage bucket `claim-evidence` (private) — created via the Supabase dashboard or a
  storage-schema insert in the migration; documented in the runbook either way.

### 3.2 Pure lib `app/src/lib/evidence/hash.ts`
- `keccak256Hex(bytes: Uint8Array): \`0x${string}\`` (viem `keccak256`).
- `hashesMatch(a, b): boolean` (case-insensitive 0x compare).
- Smoke-testable (no network).

### 3.3 Auth helper
Reuse/extend `lib/kyb/auth.ts` + `lib/kyb/nonces.ts`: a `requireClaimUploader(claimId)`
and `requireClaimReviewer()` verifying the recovered signer against the on-chain claim
claimant / roles. (No new auth primitive; same nonce + signature flow.)

### 3.4 API routes (Next.js, service-role)
- `POST /api/claims/evidence/upload` — multipart: `{ claimId, file, signature, nonce }`;
  verify claimant; hash; upload to bucket (`<claimId>/<uuid>-<file>`); insert row; return
  `{ contentHash }`. Reject if not claimant / bad nonce / oversize.
- `GET /api/claims/evidence/[claimId]` — reviewer/claimant auth; returns metadata rows
  (no bytes): file name, hash, uploader, ts.
- `POST /api/claims/evidence/download` — reviewer/claimant auth; returns a short-lived
  signed URL for a specific evidence row.
- `GET /api/claims/evidence/status` — returns `{ available }` (bucket/table configured),
  so the UI degrades gracefully when the backend is not yet provisioned (like KYB 503).

### 3.5 Frontend `app/src/components/claims/EvidencePanel.tsx`
- Mounted in the claim detail (control room row / `ClaimLifecyclePanel` area).
- Claimant: upload control (file → sign → POST). Reviewer: list + download + a
  **hash-match badge** (computed hash vs on-chain `evidenceHash`).
- States: backend-unavailable (503), not-authorized, no-evidence, uploading, success, error.

## 4. Data flow
Claimant signs → `upload` (server verifies claimant on-chain, hashes, stores private,
inserts row). Reviewer signs → `list` / `download` (server verifies role on-chain,
issues signed URL). UI verifies `content_hash` vs on-chain `evidenceHash`.

## 5. Testing
- `app/scripts/evidence-hash-smoke.ts` (node strip-types): `keccak256Hex` of known
  bytes + `hashesMatch` case/0x handling.
- `tsc --noEmit`, eslint 0 errors, `next build`.
- API routes: validated by review + owner staging test (DB-dependent; not unit-tested
  here). The Supabase Preview CI exercises the migration ordering.

## 6. Owner-gated production steps (NOT done from this branch)
1. Apply migration `0004_claim_evidence` to the canonical project `krycyeiwsplztagajauh`
   (explicit authorization, like 0002/0003).
2. Create the private `claim-evidence` Storage bucket.
3. Confirm `SUPABASE_SERVICE_ROLE_KEY` present in Vercel (already set for KYB).
Until done, `/api/claims/evidence/status` returns unavailable and the panel degrades.

## 7. Out of scope (later)
- Versioning beyond the latest upload; access-audit log (who viewed when) — overlaps
  sub-project 4 (indexer). Virus scanning. Large-file streaming/multipart-resumable.
- Notifications on evidence upload — sub-project 3.
