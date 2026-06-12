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
`0x6e2927627d83A90EDC9cDA3c626B49875f9449CF` (min delay 3600s, deploy-time
floor 1h) holds OWNER_ROLE and DEFAULT_ADMIN_ROLE on ProtocolRoles. The Safe
`0x8Fd8b45Ba2612E7535bbeB21615554701CfaF870` is proposer, executor and
canceller; the timelock is self-administered. Every risk-increasing action
flows schedule -> delay -> execute.

Phase 2 (BLOCKED until explicit owner authorization, after a rehearsed
timelocked operation): the deployer EOA renounces OWNER_ROLE and
DEFAULT_ADMIN_ROLE, leaving the timelock as sole administrator. Until then
the deployer retains roles by design; this is a known, accepted staging
posture, not an oversight.

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

- Deployer EOA still holds owner roles (phase 2 pending authorization).
- Operator auth replay window (no nonce store yet).
- Moderate transitive npm advisories in the wallet stack (0 high/critical).
- Function search_path advisor warning on the KYB trigger function (fix
  planned in migration 0002).
