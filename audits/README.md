# Audit Status

## Current state: NOT AUDITED

NextBlock has not undergone any external security audit. The protocol runs
on Base Sepolia staging only and must not hold real value until at least one
reputable external audit is completed and findings are remediated.

This directory will hold future audit reports
(`audits/<year>-<firm>-<scope>.pdf`) and remediation notes.

## What exists today (internal verification)

| Layer | Coverage |
|---|---|
| Unit tests | 22 Foundry test suites over 19 contracts; success, revert and event paths |
| Fuzz tests | Deposits, redemptions, claims, caps, NAV, premium and rounding boundaries (profile.ci: 1000 runs, fixed seed) |
| Invariant tests | `test/invariant/VaultInvariant.t.sol` with handler, ghost variables and bounded actors (profile.ci: 256 runs, depth 100) |
| Integration | `test/integration/FullFlow.t.sol` end-to-end lifecycle |
| Totals | 370 tests passing, all green in CI on every push/PR |
| Gas baseline | `contracts/.gas-snapshot` committed; check with `npm run audit:contracts:snapshot` |
| Frontend/API | KYB endpoints smoke-tested in production: fail-closed without env, 401 on unsigned operator access, zero PII on the public status route, service-role key absent from client bundles |

## Known gaps before requesting an external audit

1. Static analysis pass (slither/aderyn) with triaged findings.
2. Coverage thresholds enforced in CI (`npm run audit:contracts:coverage`
   exists and is reviewed manually today).
3. Governance phase 2 completed (deployer EOA renounce after rehearsal) so
   auditors review the final authority topology.
4. Written threat model walkthrough per module (start: `docs/SECURITY_MODEL.md`).
5. Vault-level fork tests against pinned Base Sepolia state (the
   `contracts/test/fork/` surface exists with the governance rehearsal; the
   vault lifecycle variant is still missing).

## Audit Request Checklist

Every box must be checked, with evidence, BEFORE contacting an external
audit firm. The goal is that auditors review the final system, not a moving
target.

- [ ] Governance Phase 2 complete and verified: `GovernanceCheck` shows the
      deployer at `false` for every role; timelock is sole administrator;
      operational roles on dedicated keys; Safe signer policy documented.
- [ ] Branch coverage above 80% overall and no core module below 60%
      (`npm run audit:contracts:coverage`), with the report committed.
- [ ] Slither (or aderyn) executed on `contracts/src/`; every finding
      triaged in `audits/` as fixed, mitigated or accepted-with-rationale.
- [ ] Fork tests present and green for governance AND vault lifecycle at a
      pinned Base Sepolia block.
- [ ] Full CI green on main: build, fmt, full Foundry suite (incl. fuzz and
      invariant profiles), gas snapshot, dependency audit.
- [ ] No open P0/P1 findings in `docs/PRODUCTION_READINESS_AUDIT.md`.
- [ ] Threat model written for each module crossing a trust boundary.
- [ ] Scope freeze: no contract-source change planned during the audit
      window; deployment record and address book final for the audited tag.

## Reporting

Security contact and disclosure policy: see `SECURITY.md`.
