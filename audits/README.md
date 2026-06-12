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

1. Fork tests against pinned Base Sepolia blocks (`contracts/test/fork/` does
   not exist yet).
2. Static analysis pass (slither/aderyn) with triaged findings.
3. Coverage report published and reviewed (`npm run audit:contracts:coverage`
   exists; thresholds not yet enforced).
4. Governance phase 2 completed (deployer EOA renounce after rehearsal) so
   auditors review the final authority topology.
5. KYB operator auth upgraded from windowed signatures to nonce-based
   sessions.
6. Written threat model walkthrough per module (start: `docs/SECURITY_MODEL.md`).

## Reporting

Security contact and disclosure policy: see `SECURITY.md`.
