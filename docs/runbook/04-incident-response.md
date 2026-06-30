# Incident response — operational runbook

What to do when something goes wrong in production. Each scenario lists the **detection signal**, the **immediate action** (what stops the bleeding) and the **follow-up** (root cause + rollback plan).

For role-specific procedures, see the matching `01-…` / `02-…` / `03-…` file. This file covers cross-cutting failures.

---

## 1. RPC outage

**Detection**:
- `/app/admin/system-status` → "RPC + Supabase" card → `latest block: —` and an error string
- Vercel runtime logs: repeated `notifications/refresh: claim_count_failed` and similar `on-chain read unavailable` 502s
- Cron jobs (notifications, audit trail, AI assess) silently fall back to no-op pages, no inserts in their tables

**Immediate action**:
1. Confirm via independent source: `curl -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","method":"eth_blockNumber","id":1}' https://sepolia.base.org`
2. If it's a single provider issue: change `BASE_SEPOLIA_RPC_URL` on Vercel to an alternative (Alchemy / QuickNode / Coinbase Cloud). Redeploy or wait for next cron tick.
3. The frontend `useReadContract` hooks will retry automatically once the RPC comes back; no UI action needed.

**Follow-up**:
- File a ticket with the RPC provider if it was theirs.
- Consider adding a redundant RPC fall-back to `lib/rpc.ts` (currently single endpoint).

---

## 2. Oracle data stale

**Detection**:
- `NavOracle.publishNav` not called for `> staleness` seconds → NAV consumers (lens, deposit) revert with `OracleStale` error
- Cedant cannot deposit premium → premium payment panel shows the revert reason
- Frontend vault NAV reads via `getVaultInfo` start failing

**Immediate action**:
1. Identify which oracle is stale: NavOracle (NAV per vault) or BordereauOracle (assertion liveness) or AIAssessor (advisory only, doesn't block).
2. **NavOracle**: from the Oracle Safe, publish a fresh NAV with `publishNav(vault, totalAssets, anomalyBps, sourceHash)`. The fresh NAV defrosts deposits + redemptions.
3. **BordereauOracle**: less time-critical — assertions can be re-proposed.
4. **AIAssessor**: not an emergency; assessments are advisory.

**Follow-up**:
- If the Oracle service is down (Braino / WAVENURE), failover to manual NAV publish from the Curator until restored.
- Audit the staleness window — is `staleness` too tight for the cron cadence?

---

## 3. Sanctions match storm (many false positives)

**Detection**:
- `/app/admin/sanctions` queue grows by tens per minute
- KYB approves block en masse (422 across the board)
- Vercel logs show repeated `sanctions match — Sentinel review required`

**Immediate action**:
1. Triage by severity first (high → medium → low).
2. Confirm the provider isn't returning a bad response (open ComplyAdvantage dashboard, look at recent searches).
3. If the provider is the issue:
   - Document the incident.
   - Optionally flip `SANCTIONS_PROVIDER=mock` on Vercel **temporarily** to unblock onboarding (⚠️ this means **no screening**; do it ONLY for non-counterparty-facing test environments, or with regulator clearance).
4. If the matches are real but the queue is unmanageable, escalate Sentinel staffing.

**Follow-up**:
- Tune `fuzziness` in `ComplyAdvantageProvider.screen` (currently 0.6) to reduce false positives.
- Review the matched-name heuristic; consider adding country filter when high confidence.

---

## 4. Supabase down

**Detection**:
- `/app/admin/system-status` → Supabase card → "unreachable"
- All `/api/*` routes touching DB return 503 ("backend unavailable") or 502 ("storage error")
- KYB submit, claim list, evidence list, notifications all degrade

**Immediate action**:
1. Confirm on Supabase status page: status.supabase.com
2. If it's an outage: the app degrades gracefully — frontend KYB shows "unavailable" 503, in-app notifications return empty queue, audit trail polling silently no-ops. On-chain protocol continues to work normally because contracts don't depend on Supabase.
3. **Do not** retry-write loops by hand. Wait for Supabase to recover; the cron jobs will resume.

**Follow-up**:
- Inspect logs for any partial-write states (rows missing their join, etc) — `bordereau_assertions_pending` without `bordereau_files` is the only one with this risk in current design, and the upload route already deletes the kyb_application row on partial failure to keep the 1:1 invariant.

---

## 5. Evidence backend down (Supabase Storage outage)

**Detection**:
- `/api/claims/evidence/status` returns `{ available: false }` or 503
- Claim evidence panel shows "Evidence backend not configured" even when it was working
- Same for `/api/bordereau/status`

**Immediate action**:
1. Same as Supabase down — Storage is part of Supabase.
2. The on-chain `evidenceHash` is the source of truth — when Storage comes back, file uploads resume. **Existing files are not lost** (they live in Supabase Storage backup).

**Follow-up**:
- Confirm in Supabase dashboard that the `claim-evidence` and `bordereau-files` buckets are still private (post-outage some providers re-default to public on restore).

---

## 6. Vercel deploy stuck or failed

**Detection**:
- New endpoints return 404 even after a successful merge (the very symptom we hit before — `/api/sanctions/matches` returned 404 while `/api/health` was fine)
- Vercel "Deployments" tab shows the latest commit as "Failed" or "Queued" for too long

**Immediate action**:
1. Vercel dashboard → Deployments → latest production → "View Logs". Most common causes:
   - Build error: missing env var, type error somehow, lockfile drift
   - Limit reached (Pro/Team plan): wait or upgrade
2. If failed: read the log, fix or revert the offending commit, push.
3. If queued forever: cancel and "Redeploy".

**Follow-up**:
- Add a CI guard: `npm ci && npm run build` on PR before merge (already done via `frontend` job).
- Confirm Vercel Settings → Git → "Production Branch = main" + "Automatic Deployments = ON".

---

## 7. Rotation / loss of an operational wallet

**Detection**: a Sentinel / Committee / Owner / Curator wallet is compromised, lost, or rotated.

**Immediate action** (Owner-led):
1. Convene the multisig signers off-chain.
2. From the Owner Safe, call `ProtocolRoles.revokeRole(role, oldAddress)` followed by `grantRole(role, newAddress)`.
3. If the lost wallet was an Owner signer: replace the Safe signer set first (Safe → Settings → Owners).
4. If the lost wallet was on the `REVIEWER_ADDRESSES` env var (notifications broadcast): edit on Vercel and redeploy.

**Follow-up**:
- Update the role-handoff log (`/app/admin` role-handoff panel records grants).
- If the lost wallet had pending Safe transactions, cancel them.
- Review whether any contract function had been called by the lost wallet recently — assess potential exposure window.
