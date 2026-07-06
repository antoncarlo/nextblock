# Developer & DevOps onboarding

Goal: from `git clone` to productive **without asking anyone anything**.
Read [PROJECT_STATUS.md](PROJECT_STATUS.md) first for what exists;
this page is how to run, verify and extend it.

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node | 22.x | frontend + smoke scripts (`--experimental-strip-types`) |
| npm | 10+ | **always via root scripts** — the root workspace anchors npm to `app/` and its lockfile |
| Foundry | recent stable | `forge`/`cast`/`anvil` for everything under `contracts/` |
| Git submodules | — | `git submodule update --init --recursive` (forge-std + OpenZeppelin are pinned) |

## 2. First build (all local, no secrets)

```bash
git clone https://github.com/antoncarlo/nextblock && cd nextblock
git submodule update --init --recursive

# contracts: full pyramid (unit + fuzz + invariant + integration; fork tests skip without RPC)
cd contracts && forge build && forge test && forge fmt --check && cd ..

# frontend
npm run ci:frontend:install
npm run ci:frontend:lint && npm run ci:frontend:typecheck && npm run ci:frontend:build

# generated code must never drift from the deployment record
npm run check:addressbook
```

Pure-logic smoke scripts (no network, node strip-types) live in
`app/scripts/*-smoke.ts` — run any of them directly, e.g.:

```bash
cd app && node --experimental-strip-types scripts/bordereau-smoke.ts
```

## 3. Environment variables — complete reference

Local dev: copy `app/.env.example` → `app/.env.local`. Production lives in
Vercel (project `nextblock2`); automation secrets live in GitHub Actions.
Server-only values must never reach client bundles (only `NEXT_PUBLIC_*` is
browser-safe).

### App (Vercel / .env.local)

| Var | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | Supabase project + anon key (RLS deny-by-default makes anon harmless) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | powers all API routes (KYB, evidence, notifications, documents) |
| `BASE_SEPOLIA_RPC_URL` | server | read-only RPC for on-chain role checks (defaults to public endpoint) |
| `CRON_SECRET` | server | Bearer auth for the scheduled-job endpoints — **must equal the GitHub secret** |
| `PINATA_JWT` / `PINATA_GATEWAY` | server | IPFS pinning of the public integrity manifest (503 fail-closed when unset) |
| `EMAIL_PROVIDER` (`mock`\|`resend`) + `RESEND_API_KEY` + `EMAIL_FROM` | server | email channel; `mock` (default) logs instead of sending |
| `KYB_NOTIFY_EMAIL` | server | admin alert recipient for new KYB applications (optional) |
| `NEXT_PUBLIC_APP_URL` | client | canonical URL in emails (defaults to nextblock.finance) |
| `NEXT_PUBLIC_SUBGRAPH_URL` | client | legacy no-code Goldsky subgraph (redemption history UI) |
| `NEXT_PUBLIC_PROTOCOL_SUBGRAPH_URL` | client | nextblock-protocol subgraph (full event indexing; SDK in `app/src/lib/protocol-subgraph/`) — unset = SDK reports "not deployed", no silent fallback |
| `NEXT_PUBLIC_REDEMPTION_QUEUE_ADDRESS` | client | live RedemptionQueue address |
| `NEXT_PUBLIC_LENDING_MARKET_ADDRESS` | client | live LendingMarket address |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | client | WalletConnect |
| `REVIEWER_ADDRESSES` | server | optional email-RBAC reviewer allowlist |

### GitHub Actions (repo settings)

| Name | Kind | Used by |
|---|---|---|
| `CRON_SECRET` | secret | `scheduled-jobs.yml` — same value as Vercel |
| `KEEPER_PRIVATE_KEY` | secret | `redemption-keeper.yml` — dedicated ALLOCATOR_ROLE key, **never the deployer** |
| `BASE_SEPOLIA_RPC_URL` | secret | keeper RPC |
| `REDEMPTION_QUEUE_ADDRESS` | variable | keeper target |
| `APP_URL` | variable (optional) | scheduled-jobs target override |

Env changes on Vercel take effect **only on the next deploy** — redeploy
after adding one (a 401 from a cron endpoint right after arming usually means
exactly this).

## 4. How the pieces fit

- **Contracts → frontend**: `contracts/deployments/84532-staging.json` is the
  single source of truth; `npm run codegen:addressbook` generates
  `app/src/config/generated/addressBook.ts`; CI fails on drift. Never edit
  generated files by hand.
- **Server APIs**: every privileged route re-verifies authority
  independently — EIP-191 wallet signature + **on-chain role check**
  (`hasRole` via RPC), or a Supabase email session with app RBAC. The UI is
  never the security boundary.
- **Documents**: raw bytes → private Supabase bucket; keccak256 → on-chain;
  public IPFS manifest only. Reviewer downloads go through 60s signed URLs.
- **Async lifecycle**: nothing assumes atomic finality — states are indexed
  (`Submitted`, `Approved`, `Queued`, `Claimable`, `Settled`, …) and surfaced
  with `DataSourceBadge` (onchain / backend / mock-fed labeling).

## 5. Conventions (enforced by review)

- **Audit-first**: read the module + its tests before changing it; follow the
  pre-code protocol in [contracts/README](../contracts/README.md).
- **TDD**: a change without a test does not merge. Contracts: unit + fuzz for
  value paths, invariant handlers for cross-module accounting. App: pure libs
  get a `scripts/*-smoke.ts`.
- **Rounding**: down for user-receivable, up for liabilities. Never flip.
- **Fail-closed**: missing config ⇒ 503, never a silent mock response.
- **No secrets in the repo** — env only; `.env*` is gitignored.
- **Branch → PR → merge by owner**; direct pushes to `main` are blocked.
  Merges auto-deploy via Vercel.
- Every workstream ships with docs: spec/plan under `docs/plans/` or
  `docs/*/specs/`, and a [PROJECT_STATUS](PROJECT_STATUS.md) update.

## 6. Operational surfaces (devops)

| Surface | Where | Runbook |
|---|---|---|
| CI | `.github/workflows/ci.yml` | red `frontend` job blocks Vercel — fix before merge |
| "Supabase Preview" check | GitHub integration (not our CI) | fails on every commit because Supabase branching is not enabled on this plan — **known noise, safe to ignore**; our checks are `contracts` / `frontend` / `security` / `addressbook` |
| Scheduled jobs | `scheduled-jobs.yml` | [ops notes in-file]; endpoints are idempotent, jitter-safe |
| Redemption keeper | `redemption-keeper.yml` | no-ops until an epoch matures |
| Contract (re)deploy | owner terminal | [contracts/REDEPLOY_RUNBOOK.md](../contracts/REDEPLOY_RUNBOOK.md) |
| Incidents / role actions | — | [runbook/](runbook/README.md) per role |
| DB | Supabase project (see Vercel env) | migrations in `supabase/migrations/`, applied idempotently |

## 7. Where to ask "what's next?"

[PROJECT_STATUS.md §4](PROJECT_STATUS.md) is the maintained open-scope list.
If you finish something on it, update the status file in the same PR.
