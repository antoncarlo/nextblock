# NextBlock Production Readiness Audit

- **Date:** 2026-06-13
- **Baseline:** `main` @ `6a755be4cb13e5fffa4cf7bad2508b0c1e5205ed` (post PR #7/#8), clean tree, `npm run ci` exit 0 (379/379 tests).
- **Method:** read-only inspection of the repository plus locally executed verification commands (coverage, npm audit, CI suite). No on-chain transaction, no key, no environment change was performed.
- **Scope:** every gap between the current Base Sepolia staging state and a fully secure, operational, production-ready release. "Production" here means Base Mainnet with real value and institutional users.

## Overall readiness estimate: ~55%

Evidence-based, not aspirational. The protocol layer is strong for a staging
system (379 green tests incl. fuzz/invariant/fork, timelock live, honest
security docs) but the distance to production is dominated by items that no
amount of internal testing closes: an external audit, the governance
handover, abuse protection and observability on the public surface, and the
legal/compliance shell. Per area:

| Area | Estimate | Rationale |
|---|---|---|
| Smart contracts (internal quality) | 80% | Full test pyramid; coverage measured; no static analysis, no external audit |
| Governance | 60% | Phase 1 live + rehearsal proven in fork; single-EOA posture still active |
| Frontend | 55% | Working institutional UI; no security headers, no chain guard, multi-chain legacy, silent fallbacks |
| Backend/KYB | 70% | Fail-closed, RLS total-deny, zod, on-chain op auth; replayable window auth, no rate limiting |
| CI/CD | 50% | Repeatable quality gates; no dependency scanning, no coverage/snapshot enforcement, no branch-protection record |
| Observability | 10% | Nothing beyond Vercel defaults: no error tracking, no health endpoint, no structured logs |
| Legal/compliance | 25% | Risk disclosure in UI; no Terms, no Privacy policy despite PII collection |
| Operations | 60% | OPERATIONS.md runbook exists; no rollback/key-rotation/incident-response detail |

## Findings

Severity: P0 = blocks production launch; P1 = required before mainnet or
public exposure at scale; P2 = consolidation, required before audit/launch
window closes; P3 = hygiene.

| # | Area | Sev | Finding | Evidence | Recommended fix |
|---|---|---|---|---|---|
| 1 | Governance | P0 | Deployer EOA `0xfF6f...81d2` still holds OWNER_ROLE + DEFAULT_ADMIN_ROLE + all 7 operational roles: one hot key can bypass the timelock entirely | `script/GovernanceCheck.s.sol` output (verified 2026-06-12); `docs/SECURITY_MODEL.md` §7; `docs/GOVERNANCE_PHASE2.md` §1 | Execute the staged handover: Step 1 rehearsal via Safe on-chain → Stage A key separation to dedicated keys → Stage B renounce. Mechanics already proven by `test/governance/GovernancePhase2Rehearsal.t.sol` and `test/fork/GovernancePhase2Fork.t.sol`; each stage needs explicit owner authorization |
| 2 | Contracts | P0 | No external security audit; protocol must not hold real value | `audits/README.md` ("Current state: NOT AUDITED") | Close pre-audit gaps (#5, #6, #13), then engage a reputable firm; track remediation in `audits/` |
| 3 | Backend | P0 | KYB operator signatures replayable within the 300s window (no nonce store): a captured header set can repeat the same review action | `docs/SECURITY_MODEL.md` §4 ("required before production"); `app/src/lib/kyb/auth.ts` | Nonce-based operator sessions (server-issued nonce, single use); invalidate on use |
| 4 | Frontend | P1 | No HTTP security headers: no CSP, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy | `app/next.config.ts` (no `headers()`); `app/vercel.json` (framework/build only) | Add a `headers()` block in `next.config.ts`; start CSP in report-only, then enforce |
| 5 | Backend | P1 | No rate limiting on any KYB route: public POST can flood the DB (one active application per wallet, but wallets are free); status GET is an unmetered enumeration oracle | No `middleware.ts`; no limiter dependency in `app/package.json`; grep over `app/src/app/api/` | Per-IP rate limit (middleware + KV/Upstash or equivalent) on POST and status GET; consider minimal proof-of-ownership signature on submit |
| 6 | Frontend | P1 | Multi-chain config contradicts the Base-only constraint: `sepolia` and `arcTestnet` ship in the production wallet config (documented as legacy demo) | `app/src/config/chains.ts:25`; `app/src/config/wagmi.ts:10` | Gate legacy chains behind a non-production flag; production bundle exposes Base only |
| 7 | Frontend | P1 | Deposit/withdraw flows never check the active chain id; a wallet on the wrong network attempts the tx and fails opaquely | `useDepositFlow.ts` / `useWithdrawFlow.ts` (no `useChainId`/`chainId` reference) | Guard both flows on `chainId === 84532` (then mainnet id), surface a switch-network prompt |
| 8 | CI/CD | P1 | No dependency scanning anywhere: CI has no audit job, no Dependabot/Renovate config exists; npm audit currently reports 3 high (dev graph: flatted, minimatch, picomatch — fixes available) and 24 moderate (prod graph, wallet stack) | `.github/workflows/ci.yml`; no `.github/dependabot.yml`; `npm audit` run 2026-06-13 | Add `npm audit --omit=dev --audit-level=high` job + Dependabot for npm, actions and git submodules; apply available dev-graph fixes |
| 9 | Observability | P1 | Zero production observability: no error tracking (Sentry or equivalent), no `/api/health`, no structured logs in API routes (zero log statements), no React error boundaries (`error.tsx`/`global-error.tsx` absent) | grep over `app/src/` and `app/src/app/api/`; `app/src/app/layout.tsx`; `find` for error boundaries | Minimal stack: error tracking with PII scrubbing, `/api/health` (env presence + RPC reachability, no secrets), request-scoped structured logs (no PII), top-level error boundary |
| 10 | Legal | P1 | KYB collects PII (names, emails, company data) with no Privacy policy and no Terms of Service anywhere in repo or UI | `supabase/migrations/0001_kyb_applications.sql` (PII columns); no `docs/TERMS.md`/`PRIVACY.md`/`LEGAL.md`; UI grep | Privacy policy (GDPR-grade: lawful basis, retention, deletion path) + ToS; link both from the KYB form and footer |
| 11 | Contracts | P1 | Coverage not enforced and uneven: total 73.64% lines / 61.66% branches; weakest branches: AIAssessor 11.1% (1/9), InsuranceVault 55.9% (33/59), ClaimManager 58.6%, VaultAllocator 58.6% | `npm run audit:contracts:coverage` run 2026-06-13 (full table below) | Raise branch coverage on the four weak modules (failure paths), then enforce a floor in CI |
| 12 | Frontend | P2 | WalletConnect projectId falls back silently to `"nextblock-dev"` when env is missing — production misconfig degrades silently | `app/src/config/wagmi.ts:8-9` | Fail loudly when `NODE_ENV==='production'` and the env var is absent |
| 13 | Contracts | P2 | No static analysis pass (slither/aderyn) has ever run | `audits/README.md` known gap 2 | Run slither, triage findings into `audits/` |
| 14 | Contracts | P2 | Fork surface covers governance only; no vault-level fork test (e.g. `InsuranceVaultFork.t.sol`) exercising deposit/NAV/claim against pinned staging state | `ls contracts/test/fork/` → only `GovernancePhase2Fork.t.sol` | Add a pinned-block vault fork suite reusing the `envOr`+skip pattern |
| 15 | CI/CD | P2 | Gas snapshot check not enforced in CI (now deterministic after PR #8 made it RPC-independent) | `.github/workflows/ci.yml` (no snapshot step) | Add `npm run audit:contracts:snapshot` to the contracts job |
| 16 | Backend | P2 | KYB trigger function `kyb_touch_updated_at()` has no fixed `search_path`; hardening migration 0002 (revokes, explicit append-only trigger) still pending | `supabase/migrations/0001_kyb_applications.sql:73-81`; `docs/SECURITY_MODEL.md` §7 | Write + review migration `0002_kyb_hardening` (apply only with explicit authorization) |
| 17 | Backend | P2 | Operator auth depends on the client clock (max ~5 min drift) — operational failure mode documented but not fixed | `docs/OPERATIONS.md` ("operator auth uses the client clock") | Server-issued timestamp/nonce in the signing payload (folds into #3) |
| 18 | Frontend | P2 | Mobile responsiveness partial: pages built with desktop-first inline styles; breakpoint classes in only 5 files under `app/src/app/` | grep for `sm:|md:|lg:|xl:` (5 app files, 26 components); inline `style={{...}}` throughout pages | Responsive pass on the core flows (deposit, vault, KYB form) before public launch |
| 19 | Operations | P2 | Runbooks incomplete: no Vercel rollback procedure, no key-rotation runbook (one line only), no structured incident response (frontend outage, RPC failure, Safe emergency drill) | `docs/OPERATIONS.md` ("Incident quick reference" is 3 bullets) | Extend OPERATIONS.md: rollback via Vercel deployment pinning, rotation checklists per secret, incident playbooks with owners and drill cadence |
| 20 | CI/CD | P2 | Branch protection not documented or verifiable from the repo (merges to `main` are possible without PR/CI from a local clone — demonstrated by the established local-merge workflow) | No CONTRIBUTING/SECURITY mention; merge history | Enable GitHub branch protection on `main` (require PR + green CI), document it |
| 21 | Backend | P2 | One fictitious KYB test application (E2E smoke, clearly-marked fake data) still present in the production DB | E2E smoke session 2026-06-12 (row id `ee6262f8-…`); `docs/OPERATIONS.md` fictitious-data policy | Reject + purge the row (operator action; needs explicit authorization for DB write) |
| 22 | Security | P2 | 24 moderate advisories in the production dependency graph (Metamask/Reown/WalletConnect cluster), 0 high/critical | `npm audit --omit=dev` 2026-06-13 | Track upstream; bump wallet stack on next minor; covered by #8 once Dependabot lands |
| 23 | Docs | P3 | `audits/README.md` stale: says `contracts/test/fork/` "does not exist yet" — it exists since PR #7 | `audits/README.md` known gap 1 vs `ls contracts/test/fork/` | Refresh the known-gaps list |
| 24 | Docs | P3 | `NEXTBLOCK_GAP_MATRIX.md` snapshot dated 2026-06-11 — predates PR #5–#8 (governance, fork tests, KYB hardening) | File header | Regenerate after P0/P1 wave |
| 25 | Frontend | P3 | Legacy demo addresses hardcoded for non-Base chains (admin hints, per-chain admin map) — labeled non-authoritative but ships in bundle | `app/src/config/constants.ts:54-67`; `docs/SECURITY_MODEL.md` §5 | Remove with the legacy chains (#6) |

Verified non-findings (checked, in good shape): RLS deny-by-default TOTAL with
zero anon/authenticated policies and append-only audit trail
(`0001_kyb_applications.sql`); service-role key server-only, never
NEXT_PUBLIC, fail-closed 503 (`app/src/lib/supabase-server.ts`); zod
validation on submit; public status route returns zero PII (selects
`applicant_type, status, created_at, updated_at` only); risk disclosure
present in the UI (my-company and vault pages); `.env.example` documents all
required variables including the server RPC fallback; address book anti-drift
enforced in CI; README states staging-only/no-real-value posture.

## Coverage detail (forge coverage, 2026-06-13)

Total: **73.64% lines (1671/2269), 71.77% statements, 61.66% branches
(230/373), 84.08% functions**. Per-module branch coverage low points:
AIAssessor 11.11%, InsuranceVault 55.93%, ClaimManager 58.62%,
VaultAllocator 58.62%, PremiumDistributor 64.71%, NavOracle 62.50%. Strong
modules: NextBlockLens 100% everywhere, ClaimReceipt 100%, ProtocolRoles /
ProtocolTimelock / VaultDeployer / MockUSDC 100% lines.

## Ordered fix list (strict order)

1. **(P0-1)** Governance handover: Step 1 rehearsal via Safe → Stage A key
   separation → Stage B renounce; verify with `GovernanceCheck` after each
   stage. Each stage requires explicit owner authorization.
2. **(P0-3)** Nonce-based KYB operator sessions (also closes #17).
3. **(P1-5)** Rate limiting on KYB routes.
4. **(P1-4)** Security headers in `next.config.ts`.
5. **(P1-8)** Dependency scanning: CI audit job + Dependabot; apply the 3
   available dev-graph high fixes immediately.
6. **(P1-9)** Observability minimum: error tracking, `/api/health`,
   structured logs, error boundaries.
7. **(P1-7 + P1-6 + P2-12)** Chain guard in flows; Base-only production
   config; loud projectId failure.
8. **(P1-10)** Privacy policy + ToS linked from the KYB flow.
9. **(P1-11)** Branch-coverage push on AIAssessor / InsuranceVault /
   ClaimManager / VaultAllocator, then CI coverage floor.
10. **(P2-13/14/15)** Slither pass; vault fork suite; snapshot check in CI.
11. **(P2-16/21)** Migration 0002 hardening; purge the fictitious prod row.
12. **(P2-19/20)** Runbooks (rollback, rotation, incident); branch
    protection on `main`.
13. **(P0-2)** External audit engagement (after 1–10), remediation, then
    re-test.
14. **(P3-23/24/25)** Doc refreshes and legacy cleanup.

## What must be true before declaring 100%

- Timelock is the sole administrator on-chain: deployer shows `false` for
  every role in `GovernanceCheck`; operational roles live on dedicated keys;
  Safe signer policy (owners, threshold) documented in-repo and verified.
- At least one external audit completed, findings remediated, report
  committed under `audits/`.
- A production deployment target (Base Mainnet) with its own address book,
  deployment record, and post-deploy verification battery — staging artifacts
  never reused.
- KYB operator auth is single-use (nonce) and all public routes are rate
  limited; abuse tested.
- Security headers enforced (CSP not in report-only); wallet config is
  Base-only; flows are chain-guarded; no silent fallbacks for required env.
- CI blocks on: lint, typecheck, build, full Foundry suite, gas snapshot,
  dependency audit (high+), coverage floor; branch protection requires PR +
  green CI on `main`.
- Observability live: error tracking with alerting, health endpoint
  monitored, structured logs retained; one incident drill executed per
  playbook.
- Privacy policy and Terms published; PII retention/deletion path
  implemented; KYC/AML flow documented end-to-end (UI → API → review →
  on-chain whitelist act).
- All P0/P1/P2 rows above closed or explicitly risk-accepted in writing by
  the owner.

---
*Author: Anton Carlo Santoro. Generated from read-only inspection at commit
`6a755be`; every finding cites in-repo evidence or a command run on
2026-06-13. No on-chain, environment, or configuration change was performed
during this audit.*
