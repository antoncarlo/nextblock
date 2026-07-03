# NextBlock documentation index

Everything in this repository is documented. This page is the map: pick your
entry point by role. New here? Read in this order —
**[PROJECT_STATUS](PROJECT_STATUS.md) → [DEVELOPER_ONBOARDING](DEVELOPER_ONBOARDING.md) →
[SECURITY_MODEL](SECURITY_MODEL.md)** — and you can work autonomously from
there: what exists, what is real vs advisory, and what remains, without ever
needing the source walked through for you.

## For a new developer / devops

| Doc | What it gives you |
|---|---|
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | Dated snapshot: every module Present/Partial, **real vs mock/advisory**, completed workstreams, open scope |
| [DEVELOPER_ONBOARDING.md](DEVELOPER_ONBOARDING.md) | Zero-to-productive: setup, complete env-var tables (Vercel + GitHub), test matrix, CI, conventions, how to add a module |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Workspace rules (lockfile anchoring, submodules, secrets hygiene) |
| [../contracts/README.md](../contracts/README.md) | Contract-by-contract map, Foundry standards, invariants |
| [../app/README.md](../app/README.md) | Frontend: routes by role, API surface, hooks, data-source labeling |
| [../indexer/README.md](../indexer/README.md) | Goldsky subgraph (redemption events) |

## Architecture & security

| Doc | Content |
|---|---|
| [SECURITY_MODEL.md](SECURITY_MODEL.md) | Trust model, invariants, role separation, fail-closed posture |
| [../SECURITY.md](../SECURITY.md) | Responsible disclosure policy |
| [PRODUCTION_READINESS_AUDIT.md](PRODUCTION_READINESS_AUDIT.md) | Pre-mainnet readiness review |
| [../contracts/docs/security/audit-prep.md](../contracts/docs/security/audit-prep.md) · [audit-handoff.md](../contracts/docs/security/audit-handoff.md) | External-audit package |
| [../NEXTBLOCK_GAP_MATRIX.md](../NEXTBLOCK_GAP_MATRIX.md) | Historical gap baseline (2026-06-11) — superseded by PROJECT_STATUS |

## Operations (owner / operators)

| Doc | Content |
|---|---|
| [OPERATIONS.md](OPERATIONS.md) | Operational model, governance phases |
| [../contracts/REDEPLOY_RUNBOOK.md](../contracts/REDEPLOY_RUNBOOK.md) | Fresh-generation deploy, one-way real-time lock, governance migration — the pre-pilot checklist |
| [GOVERNANCE_PREFLIGHT.md](GOVERNANCE_PREFLIGHT.md) · [GOVERNANCE_PHASE2.md](GOVERNANCE_PHASE2.md) · [../contracts/docs/governance/safe-handover-runbook.md](../contracts/docs/governance/safe-handover-runbook.md) | Safe/timelock handover path |
| [runbook/](runbook/README.md) | Per-role action runbooks: Sentinel, Curator, Committee, incident response |
| [../contracts/DEMO_FLOW.md](../contracts/DEMO_FLOW.md) | 15-minute investor walkthrough (legacy virtual-clock demo) |

## Pilot (Base Sepolia)

| Doc | Content |
|---|---|
| [pilot/README.md](pilot/README.md) | Pilot scope and disclaimer |
| [pilot/investor-guide.md](pilot/investor-guide.md) · [pilot/cedant-guide.md](pilot/cedant-guide.md) | Role guides for pilot participants |
| [pilot/operator-runbook.md](pilot/operator-runbook.md) · [pilot/manual-test-checklist.md](pilot/manual-test-checklist.md) | Operating + acceptance checklists |

## Legal & compliance

| Doc | Content |
|---|---|
| [BUCKET_C_SPV_PILOT.md](BUCKET_C_SPV_PILOT.md) | **The legal bridge spec**: SPV/cell options, pilot treaty mapped clause-by-clause to on-chain values, lawyer checklist |
| [legal/](legal/README.md) | LP terms, cedant terms, risk disclosure, privacy notice |
| [LEGAL.md](LEGAL.md) · [TERMS.md](TERMS.md) · [PRIVACY.md](PRIVACY.md) | Platform-level notices |

## Integrations & future work

| Doc | Content |
|---|---|
| [../contracts/docs/integrations/real-providers.md](../contracts/docs/integrations/real-providers.md) | Wiring real data vendors (Braino NAV/risk, UMA, KYC) behind the existing adapters |
| [../contracts/docs/superpowers/specs/2026-06-30-institutional-grade-roadmap.md](../contracts/docs/superpowers/specs/2026-06-30-institutional-grade-roadmap.md) | Institutional-grade roadmap (8 phases, progress log) |
| [superpowers/specs/](superpowers/specs/) · [plans/](plans/) · [reports/](reports/) | Design specs, implementation plans and delivery reports for shipped workstreams (claims control room, money flow, lending market, evidence management, KYB durable state, hybrid RBAC) |

**Convention:** every substantial workstream lands with (1) a design spec or
plan under `docs/plans/` / `docs/*/specs/`, (2) implementation + tests, and
(3) an entry in [PROJECT_STATUS.md](PROJECT_STATUS.md). Keep it that way —
the repo must always be self-explanatory without access to anyone's memory.
