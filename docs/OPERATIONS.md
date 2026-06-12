# NextBlock Operations Runbook (Base Sepolia staging)

## Environments

| Surface | Where | Notes |
|---|---|---|
| Frontend production | https://www.nextblock.finance (Vercel project `nextblock2`) | Deploys from `main` |
| Chain | Base Sepolia (84532) only | Addresses: `contracts/deployments/84532-staging.json` |
| Database | Supabase project ref `krycyeiwsplztagajauh` ("nextblock hackaton", antoncarlo's Org) | KYB tables, RLS deny-by-default. Caution: other projects exist in the same org with similar names — this ref is the only correct target |

## Required environment variables

Documented in `app/.env.example`. Public: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Server-only:
`SUPABASE_SERVICE_ROLE_KEY` (Vercel encrypted env; rotate from the Supabase
dashboard if ever exposed), optional `BASE_SEPOLIA_RPC_URL` (defaults to the
public endpoint; used for read-only on-chain role checks in the KYB API).

## Routine checks

```bash
# Repo/CI sanity
git status --short && git log --oneline -3
npm run check:addressbook

# Frontend gates
npm run ci:frontend:lint && npm run ci:frontend:typecheck && npm run ci:frontend:build

# Contracts (Foundry required)
npm run ci:contracts:fmt && npm run ci:contracts:build && npm run ci:contracts:test

# Audit-prep (manual)
npm run audit:contracts:snapshot   # fails if gas profile drifted from baseline
npm run audit:contracts:coverage
```

## KYB production smoke (no secrets required)

```bash
B=https://www.nextblock.finance
curl -s "$B/api/kyb/applications/status?wallet=0x1111111111111111111111111111111111111111"
# expect {"available":true,...}; 503 means server env missing (fail-closed)
curl -s -o /dev/null -w '%{http_code}\n' "$B/api/kyb/applications"   # expect 401 (operator auth required)
```

Submissions use only clearly-marked fictitious data. Operator review happens
from the admin dashboard (wallet signature; requires on-chain KYC Operator or
Owner role). Note: operator auth uses the client clock — if reviews fail with
"signature expired", check the operator machine clock (max drift ~5 minutes).

## CI and deploy

- CI (`.github/workflows/ci.yml`): jobs addressbook / frontend / contracts on
  every push and PR; no secrets.
- Production deploy: Vercel builds `main`. Redeploys and env changes are
  owner actions from the Vercel dashboard; agents and CI never touch them.

## Address book changes

After any new deployment, update `contracts/deployments/84532-staging.json`,
run `npm run codegen:addressbook`, and commit both together; CI rejects
drift. Never hand-edit `app/src/config/generated/addressBook.ts`.

## Database migrations

SQL lives versioned in `supabase/migrations/`. Applying to the remote
project requires explicit owner authorization after SQL review, targets only
ref `krycyeiwsplztagajauh`, and is followed by read-only verification
(tables, RLS, zero anon/authenticated policies, advisors) and TypeScript
type regeneration.

## Governance operations (Base Sepolia)

- Phase 1 (done): ProtocolTimelock `0x6e2927627d83A90EDC9cDA3c626B49875f9449CF`
  holds OWNER_ROLE + DEFAULT_ADMIN_ROLE on ProtocolRoles; Safe
  `0x8Fd8b45Ba2612E7535bbeB21615554701CfaF870` proposes/executes/cancels.
- Rehearsal (next, requires explicit authorization): one harmless operation
  via Safe -> schedule on timelock -> wait 1h -> execute -> verify with cast.
- Phase 2 RENOUNCE_DEPLOYER: BLOCKED. Do not run under any circumstance
  without a new explicit owner authorization AND a successful rehearsal. It
  is irreversible for the deployer EOA
  (`contracts/script/GovernanceMigration.s.sol`, `RENOUNCE_DEPLOYER=true`).

## Incident quick reference

- Suspected key/secret exposure: rotate in Supabase/Vercel dashboards first,
  then audit git history and bundles.
- Stale or deviating NAV / suspicious claim: SENTINEL_ROLE can pause and
  dispute immediately (not timelocked by design).
- KYB API returning 503 in production: check Vercel env presence first
  (fail-closed behavior is intentional, not an outage of Supabase).
