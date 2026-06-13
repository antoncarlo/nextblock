# NextBlock v1.0.0-rc.1 — Production-Ready Staging Release

**Version:** v1.0.0-rc.1
**Release date:** 2026-06-13
**Network:** Base Sepolia (chain ID 84532) — staging only
**Status:** Production-Ready Staging Release

## Summary

NextBlock is an institutional protocol for tokenizing reinsurance
portfolios on Base: whitelisted cedants cede premium flows into
ERC-4626-style USDC vaults whose restricted shares (nbUSDC) are held by
whitelisted institutional liquidity providers, with underwriting
governance, AI-assisted assessment behind adapters, claim management with
dispute paths, and timelocked protocol administration. This release
candidate marks the point where the Base Sepolia staging deployment is
production-ready for its stated scope: every P0/P1 finding from the
production readiness audit is closed in code and documentation, governance
handover is fully prepared and rehearsed, the legal and operational shell
is in place, and the full CI surface is green (including the Supabase
Preview integration). No real value is at risk: the staging settlement
asset is a test USDC mock.

## What is included

- Protocol baseline: 18 core contracts (vault factory and independent
  insurance vaults, registries, compliance, oracles, claim management,
  allocator, lens) deployed on Base Sepolia with canonical address book
  codegen and anti-drift CI.
- Governance Phase 1 live: ProtocolTimelock (minDelay 3600s) holds
  OWNER_ROLE and DEFAULT_ADMIN_ROLE on ProtocolRoles; Safe is proposer,
  executor and canceller.
- Governance Phase 2 rehearsal proven in code: deterministic local
  rehearsal plus fork rehearsal against pinned live state (PR #7, merge
  47358b5; assertion tightening in PR #8, merge 6a755be).
- Production readiness audit: docs/PRODUCTION_READINESS_AUDIT.md with 25
  evidence-based findings (PR #9, merge ae08214).
- P0/P1 remediation (PR #10, merge 96eafe3): HTTP security headers (CSP,
  HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy);
  IP rate limiting on KYB routes; single-use server nonce for KYB operator
  review actions; wrong-network guard in deposit/withdraw flows;
  /api/health endpoint, route error boundary and structured PII-free API
  logging; Terms and Privacy linked from the footer; network and
  deployer-key warnings across the app; dependency audit job in CI with
  high advisories resolved; branch coverage raised to 71.31% with three
  new targeted test suites (55 tests).
- Governance Stage A pre-flight (PR #11 merge a4f08ca, PR #12 merge
  15d7321): docs/GOVERNANCE_PREFLIGHT.md with the seven dedicated role
  addresses verified as fresh EOAs, salts, precomputed operation ids and
  final import-ready Safe Transaction Builder payloads (schedule and
  execute batches).
- Legal and compliance finalization (PR #13, merge a7820b6): complete
  Terms of Service, Privacy Policy, legal structure document and the
  IR-1..IR-5 incident response runbook in docs/OPERATIONS.md.
- Supabase migration history sync (95fed6c, e305a11): local
  supabase/migrations/ now mirrors the remote history exactly; the
  Supabase Preview check passes.

## Security posture

Measured on main at e305a11 (2026-06-13):

- Tests: 434 passed, 0 failed (unit, fuzz, invariant, integration,
  governance rehearsal; fork tests additionally pass against pinned live
  state where an RPC is available).
- Branch coverage: 71.31% overall (AIAssessor 100%, InsuranceVault 86.4%,
  VaultAllocator 93.1%); lines 75.4%.
- Dependency audit: 0 high, 0 critical (npm audit --audit-level=high exit
  0); enforced on every push by the CI security job.
- HTTP security headers enforced on all routes, including a
  Content-Security-Policy with frame-ancestors 'none' and HSTS preload.
- KYB pipeline: Supabase RLS deny-by-default TOTAL (zero anon/authenticated
  policies, append-only audit trail); server-only service-role credential,
  fail-closed 503 without configuration; zod validation; EIP-191 operator
  authentication bound to on-chain roles with single-use server nonces;
  IP rate limiting on submit, review and nonce issuance.
- Frontend: deposit and withdraw flows hard-guarded to chain 84532;
  permanent warnings when a wrong network or the deployer key is
  connected; gas snapshot baseline enforced via audit script; address book
  anti-drift in CI.

## Governance

- Safe 0x8Fd8b45Ba2612E7535bbeB21615554701CfaF870 active as proposer,
  executor and canceller on ProtocolTimelock
  0x6e2927627d83A90EDC9cDA3c626B49875f9449CF (minDelay 3600 seconds,
  self-administered).
- The timelock holds OWNER_ROLE and DEFAULT_ADMIN_ROLE on ProtocolRoles
  0xEE93166a2cf213243eF330a664682290b195c976 (Phase 1, verified on-chain).
- The deployer EOA still holds OWNER_ROLE, DEFAULT_ADMIN_ROLE and all
  seven operational roles: Stage A (key separation) is fully prepared but
  NOT yet executed. The final Safe payloads (schedule and execute batches
  with precomputed operation ids) are in docs/GOVERNANCE_PREFLIGHT.md and
  await manual execution through the Safe UI; Stage B (deployer renounce)
  remains blocked behind Stage A confirmation and a separate explicit
  authorization. Until then the PRODUCTION BLOCK in docs/OPERATIONS.md
  applies.

## Legal and compliance

- docs/TERMS.md: complete Terms of Service - staging-only scope,
  institutional entities only (no retail), KYB required before any vault
  interaction, risk acknowledgment, limitation of liability, governing law
  Saint Kitts and Nevis.
- docs/PRIVACY.md: complete Privacy Policy - exact data inventory,
  Supabase as processor, retention bounded to terminal KYB status plus 90
  days, no PII on-chain, deletion request path.
- docs/LEGAL.md: platform structure (NextBlock protocol layer; Klapton Re,
  Saint Kitts and Nevis IBC with SPV structure, as reinsurance entity;
  Braino as technology provider), depositor risk disclosure and KYC/AML
  policy summary.
- docs/OPERATIONS.md: operational runbook including incident response
  IR-1..IR-5 (frontend outage, RPC failure, contract pause, Safe/timelock
  emergency, key rotation).
- Counsel review of the legal documents remains a pre-mainnet requirement
  and is tracked in the documents themselves.

## Known limitations

- No external security audit yet: the protocol must not hold real value
  until at least one reputable external audit is completed; the
  prerequisites checklist lives in audits/README.md.
- Staging only: Base Sepolia (84532); there is no mainnet deployment and
  none may be prepared until governance Stage A and Stage B complete.
- Stage A not yet executed: the deployer EOA retains full control until
  the prepared Safe payload is executed and verified; the in-app deployer
  warning and the PRODUCTION BLOCK stay in force.
- Branch coverage 71.31%: above the release-candidate gate, below the 80%
  target required before requesting the external audit and any mainnet
  review.

## Next steps

1. Execute Stage A via Safe UI at app.safe.global using
   docs/GOVERNANCE_PREFLIGHT.md payload.
2. Engage external auditor using audits/README.md checklist.
3. Mainnet readiness review after Stage A confirmed operational.

**Author:** Anton Carlo Santoro
