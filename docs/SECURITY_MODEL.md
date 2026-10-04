# NextBlock Security Model

This document states what is a security boundary in NextBlock and what is
not. Anything not listed as authoritative must be assumed bypassable.

## 1. On-chain RBAC (authoritative)

`ProtocolRoles` (OpenZeppelin AccessControl) is the single source of truth
for protocol authorization. Every module gates privileged functions through
it; there are no frontend whitelists with authority.

| Role | Powers | Bounded by |
|---|---|---|
| OWNER_ROLE | Risk-increasing configuration: caps, premium splits, dispute windows, adapter activation, fee claims, role grants (admin of all operational roles) | ProtocolTimelock (phase 1 live) |
| UNDERWRITING_CURATOR_ROLE | Portfolio approval, risk terms, vault strategy | Caps and registries |
| ALLOCATOR_ROLE | Capacity distribution within approved limits | Caps, queues |
| SENTINEL_ROLE | Pause, dispute, block flags, risk reduction | Cannot move funds; intentionally NOT timelocked |
| CLAIMS_COMMITTEE_ROLE | Off-chain claim approval after AI advisory | Dispute/liveness path cannot be bypassed |
| KYC_OPERATOR_ROLE | ComplianceRegistry whitelist, jurisdiction, KYC expiry | Cannot move funds |
| AUTHORIZED_CEDANT_ROLE | Portfolio/claim submission, premium transfer | Vault accounting |

## 2. Governance: timelock and Safe (authoritative)

Phase 1 (live on Base Sepolia): `ProtocolTimelock` at
`0xD94ea36FD19a0D3Cb3A8EA1214C6F97A947e5950` (min delay 3600s, deploy-time
floor 1h) holds OWNER_ROLE and DEFAULT_ADMIN_ROLE on ProtocolRoles. The Safe
`0x0969B20f1d8a5628613f00fa6aDBE85e715fEf15` is proposer, executor and
canceller; the timelock is self-administered. Every risk-increasing action
flows schedule -> delay -> execute.

Phase 2 (done on Base Sepolia, 2026-10-02, after a timelocked operation was
rehearsed through the Safe, executed after the delay): the deployer EOA renounced OWNER_ROLE and
DEFAULT_ADMIN_ROLE and holds no role. The timelock is the sole holder of
DEFAULT_ADMIN_ROLE, and OWNER_ROLE sits with the timelock and the Safe.

Known limit: the Safe has one signer (threshold 1, and that signer is a
smart-contract wallet) and the timelock delay is the one-hour floor. That is
testnet governance. Before real value it has to become a multi-signer Safe with
a longer delay.

## 3. Compliance gate (authoritative)

`ComplianceRegistry` enforces LP whitelist, jurisdiction codes, KYC expiry
and block flags on-chain; vault mint/transfer paths check it. The KYB
database is instructional only: a DB approval never whitelists anyone — the
on-chain `setWhitelist` remains a separate KYC Operator act via the Safe.

## 4. Server-side KYB API (authoritative)

- All KYB data access goes through Next.js route handlers using the
  Supabase service-role key (server-only env var, no NEXT_PUBLIC_ prefix,
  verified absent from the client bundle). Handlers fail closed (503) when
  the configuration is missing.
- Database RLS is deny-by-default TOTAL: RLS enabled on `kyb_applications`
  and `kyb_review_events` with zero policies for anon/authenticated, in any
  direction. The audit-trail table is append-only by design.
- Operator endpoints require an EIP-191 signature over a message binding
  action, application id, target status and a timestamp (300s window + 60s
  skew), verified server-side together with on-chain KYC_OPERATOR_ROLE /
  OWNER_ROLE membership. Known limit: signatures are replayable within the
  window (no nonce store yet); nonce-based sessions are required before
  production.
- The only public read endpoint returns applicant type, status and
  timestamps — never PII.

## 5. UI gates (NOT security boundaries)

- The admin dashboard visibility check (on-chain role read with a
  `LEGACY_ADMIN_UI_HINT` fallback in `app/src/config/constants.ts`) only
  decides whether UI renders. Editing the bundle bypasses it; nothing
  privileged is reachable through it.
- All protocol figures shown in the UI carry a `DataSourceBadge`
  (onchain / backend / backend-mock / demo-legacy / unavailable); data that
  cannot be read is shown as unavailable, never invented.

## 6. Oracle and AI posture

NAV, risk scores and claim assessments are advisory inputs behind adapters
(NavOracle, AIAssessor, BordereauOracle with liveness/dispute). They never
hold unilateral business authority; committee/sentinel paths and timelocked
configuration bound their impact. The legacy MockOracle panel is a demo
write tool, labeled as such, and is not a canonical source.

## 7. Known accepted residuals (tracked in the gap matrix)

- Governance is testnet-grade: the deployer EOA holds no role (renounced 2026-10-02), but the Safe's signer set and the timelock delay are being hardened and the operational roles are still held by simulation identities; see `docs/GOVERNANCE_HARDENING.md`.
- Operator auth replay window (no nonce store yet).
- Moderate transitive npm advisories in the wallet stack (0 high/critical in the production graph). One dev-only high advisory with no patched release is carried with an expiry; see "Dependency advisories the build carries".
- Function search_path advisor warning on the KYB trigger function (fix
  planned in migration 0002).

## Dependency advisories the build carries

CI runs `scripts/audit-gate.mjs`, which is `npm audit --audit-level=high` over the whole
dependency graph with one allowance: an advisory with **no patched release** that **cannot reach
production code** may be carried, with a written reason and an expiry date, after which the gate
fails again. An audit that cannot run fails the gate.

| Advisory | Package | Why it is carried | Until |
|---|---|---|---|
| GHSA-vfj7-8cjw-p6xm (high, stack exhaustion on nested brace patterns) | `braces` ≤ 3.0.3 | No patched release exists (3.0.3 is the latest). Reached only through `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch`: lint tooling expanding patterns from our own config, never from user input. `npm ls braces --omit=dev` shows it dev-only; `npm audit --omit=dev --audit-level=high` is clean | 2026-12-31 |

When a patched `braces` is published, upgrade and delete the entry; the gate says so when the
advisory is no longer reported.
