# NextBlock — Operational Runbook

Step-by-step procedures for the operational roles in the pilot. Each file
covers a single role; the checklists assume the actor holds the required
on-chain role and has the Safe set up.

| File | Role | Scope |
|---|---|---|
| [`01-sentinel-actions.md`](./01-sentinel-actions.md) | Sentinel | Sanctions resolution, claim disputes, address freeze, anomaly response |
| [`02-curator-actions.md`](./02-curator-actions.md) | Underwriting Curator | Vault provisioning, policy register + activate + addPolicy, capacity caps, role grants |
| [`03-committee-actions.md`](./03-committee-actions.md) | Claims Committee | Claim approve / reject, dispute resolution |
| [`04-incident-response.md`](./04-incident-response.md) | All ops | RPC outage, oracle stale, sanctions match storm, Supabase down, evidence backend down |

## How these are used

1. The Sentinel / Curator / Committee operator opens the file matching the alert or queue item.
2. Each procedure ends with a **verify** step listing exactly what to check (table row, on-chain event, balance) before declaring the action complete.
3. Anything that touches the chain is **always** a Safe transaction — these are not zero-touch routines. The app's UI prepares the call data; the operator firma on the Safe.

## Cross-references

- Audit-of-record:
  - `claim_audit_trail` mirror (on-chain logs) — visible in `/app/claims` expanded row
  - `sanctions_screening_runs` / `sanctions_matches` — visible in `/app/admin/sanctions`
  - `ai_assessments_pending` — visible in `/app/admin/ai-assessments`
  - `bordereau_assertions_pending` + `bordereau_files` — visible in `/app/admin/bordereau`
  - `kyb_review_events` — visible in the KYB admin queue
- System health: `/app/admin/system-status`
- Deployed contract addresses: [`app/src/config/generated/addressBook.ts`](../../app/src/config/generated/addressBook.ts)

## What this runbook is NOT

- It is not the protocol spec — see `docs/architecture/` (canonical brief alignment) and the contract NatSpec for definitions.
- It is not legal counsel — see `docs/legal/` for counsel-bound templates.
- It is not a marketing or onboarding guide — see the in-app `/app/cedant/onboard` flow.
