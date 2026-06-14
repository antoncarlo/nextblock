# Operator Runbook — NextBlock Pilot (Base Sepolia)

For the protocol operator / admin running the testnet pilot. Covers KYB review,
on-chain role grants, error handling and operational rollback.

> Testnet only. No real funds. The operator wallet (deployer) still holds
> protocol roles because Governance Stage A has not been executed. This is
> pilot operational tooling, not mainnet governance.

## Prerequisites

- Operator wallet connected on **Base Sepolia (84532)** holding `OWNER_ROLE` on
  ProtocolRoles (the deployer wallet in the pilot).
- KYB backend enabled: `SUPABASE_SERVICE_ROLE_KEY` set on the server (Vercel).
  If unset, KYB routes fail closed (HTTP 503) by design.
- Admin screens available at **`/app/admin`** (KYB review queue + role handoff).

## Daily pilot checklist

| # | Check | How |
|---|---|---|
| 1 | App reachable | open the public URL; load `/app/pilot` |
| 2 | Backend healthy | `GET /api/health` returns 200 |
| 3 | KYB backend live | open `/app/admin` KYB queue; it loads (not "unavailable") |
| 4 | New KYB applications | review `submitted` / `under_review` items |
| 5 | Pending role grants | grant roles for approved applicants who shared a wallet |
| 6 | Blocked users | resolve support requests; communicate next step |

## Reviewing KYB

The KYB review queue (`/app/admin`, KYC Operator) is access-controlled by a
wallet signature verified server-side against the on-chain KYC Operator / Owner
role. Statuses and valid transitions:

| Status | Meaning | Next |
|---|---|---|
| `submitted` | new application | `under_review`, `rejected`, `needs_info` |
| `under_review` | being reviewed | `approved`, `rejected`, `needs_info` |
| `needs_info` | awaiting applicant | `under_review`, `rejected` |
| `approved` | passed review (terminal) | proceed to role grant |
| `rejected` | declined (terminal) | communicate reason |

Review actions are signed per-action and bound to a single-use server nonce, so
a captured request cannot be replayed (note: in the current pilot the nonce and
rate-limit stores are in-memory per server instance — see Known limitations).

DB approval is instructional: it does **not** by itself grant on-chain rights.

## Granting on-chain roles

After KYB approval, grant the applicant's wallet the matching operational role
via the Role Handoff panel on `/app/admin`:

| Pilot actor | Role to grant |
|---|---|
| Cedant | `AUTHORIZED_CEDANT_ROLE` |
| Curator / underwriting | `UNDERWRITING_CURATOR_ROLE` |
| Committee member | `CLAIMS_COMMITTEE_ROLE` |
| Sentinel / admin | `SENTINEL_ROLE` |
| Allocator | `ALLOCATOR_ROLE` |
| KYC operator | `KYC_OPERATOR_ROLE` |
| Oracle / attestor | `ORACLE_ROLE` |
| Premium depositor | `PREMIUM_DEPOSITOR_ROLE` |

`OWNER_ROLE`, `DEFAULT_ADMIN_ROLE` and `VAULT_FACTORY_ROLE` are intentionally
not grantable from the UI.

Two paths (hybrid model):

1. **Direct staging grant** — if your connected wallet holds `OWNER_ROLE`, the
   panel enables a direct `grantRole(role, wallet)` transaction.
2. **Safe / Timelock calldata** — if you are not the owner wallet, the panel
   shows ready-to-use `grantRole` calldata to execute through the protocol Safe.

Investor / LP eligibility is separate from ProtocolRoles: enable it by recording
the wallet in the ComplianceRegistry (KYC Operator `setWhitelist`) so the wallet
satisfies `canReceive`.

## Verifying a role grant took effect

- In the Role Handoff panel, the per-wallet/role status chip flips to "granted".
- Independently: read `ProtocolRoles.hasRole(role, wallet)` (true) via a block
  explorer or `cast call`. The applicant's Pilot Hub will also show the role as
  granted and the matching track "Unlocked".

## Handling Supabase / KYB unavailable

| Symptom | Cause | Action |
|---|---|---|
| KYB queue "unavailable" / 503 | `SUPABASE_SERVICE_ROLE_KEY` not set or DB unreachable | set the server env var; verify Supabase project reachable |
| 429 on KYB actions | rate limit hit | wait for the window; retry |
| Status endpoint empty | no application for that wallet | confirm the applicant submitted with the same wallet |

## Communicating the next step

Map the applicant's state to a one-line instruction:

| State | Tell the user |
|---|---|
| No wallet / wrong chain | connect and switch to Base Sepolia (84532) |
| No gas / no USDC | use the ETH faucet; mint test USDC in the Pilot Hub |
| KYB not submitted | apply at `/app/apply` |
| KYB under review | wait for review |
| Approved, no role | role grant in progress; confirm their wallet address |
| Role granted | open their role screen from the Pilot Hub |

## Operational rollback

- **Disable KYB fast**: unset `SUPABASE_SERVICE_ROLE_KEY` on the server. KYB
  routes then fail closed (503) without exposing data. Re-set to re-enable.
- **Frontend rollback**: promote the previous known-good deployment. No on-chain
  rollback is needed because the pilot does not deploy or change contracts.
- **Do not** rotate keys, change contracts, or perform Governance Stage A as part
  of routine pilot operations.

## Known limitations (pilot)

- Nonce and rate-limit stores are in-memory per server instance; on a
  multi-instance serverless deployment the single-use / throttle guarantees are
  not shared across instances. A shared store is planned (`feat/kyb-durable-state`).
- Allocation and premium (UPR/NAV) flows are operator-facilitated until the
  related UIs ship.
