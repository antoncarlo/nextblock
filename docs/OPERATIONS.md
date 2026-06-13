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

## PRODUCTION BLOCK (governance)

PRODUCTION USE IS BLOCKED until Governance Phase 2 Stage A (operational key
separation) is executed and verified. The deployer EOA
`0xfF6f0d49dD2187351264C4d3bbd5537bE8Ad81d2` still holds OWNER_ROLE,
DEFAULT_ADMIN_ROLE and every operational role: a single hot key has full
instant control bypassing the timelock. Until Stage A completes (and Stage B
finalizes the handover):

- no mainnet deployment may be prepared or executed;
- no real-value asset may be referenced by any vault;
- the staging app shows a permanent warning whenever the deployer key
  connects (`DeployerWalletWarning`), and that warning must not be removed;
- routine operations must not be performed with the deployer key.

Runbook and authorization gates: `docs/GOVERNANCE_PHASE2.md`.

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

## Incident Response Runbook

Severity is assessed by the operator on call; every incident gets a short
written timeline (what was observed, when, what was done) appended to the
internal log before closing. Communication templates below are sent on the
official channels (status note on the landing page and/or the X account
linked in the footer).

### IR-1. Frontend outage

1. Confirm the outage: open https://www.nextblock.finance and
   https://www.nextblock.finance/api/health from two networks. A healthy
   instance returns `{"status":"ok",...}`.
2. Check Vercel: dashboard -> project `nextblock2` -> Deployments. Verify
   whether the latest production deployment is `Error`/`Canceled` or a
   recent deploy correlates with the outage start.
3. Rollback (owner action, Vercel dashboard): Deployments -> select the
   last known-good production deployment -> "Promote to Production"
   (instant rollback; no rebuild). Do NOT push fixes to `main` as a
   rollback mechanism - promote first, debug after.
4. If the deployment is healthy but the page errors, check the browser
   console for CSP violations (Content-Security-Policy is enforcing; a new
   third-party endpoint may need allow-listing in `app/next.config.ts` via
   a reviewed PR).
5. Verify recovery with step 1, then record the timeline.

Communication template: "NextBlock staging UI was unavailable from <start>
to <end> (UTC). On-chain contracts and funds-handling logic were not
affected. Root cause: <one line>. No action is required from users."

### IR-2. RPC failure (Base Sepolia)

Scope: the server-side KYB role checks and any local tooling use
`BASE_SEPOLIA_RPC_URL` (default `https://sepolia.base.org`); the browser
uses the wagmi default transport for chain 84532.

1. Diagnose: `cast block-number --rpc-url https://sepolia.base.org`. If it
   fails, try a fallback provider endpoint for Base Sepolia (e.g. an
   Alchemy/Infura/QuickNode Base Sepolia URL already provisioned for ops).
2. Symptom check in product: operator review actions failing with
   "on-chain role check unavailable" (fail-closed 403) indicates the
   SERVER RPC is down, not the auth system.
3. Switch the server fallback: Vercel dashboard -> project `nextblock2` ->
   Settings -> Environment Variables -> set `BASE_SEPOLIA_RPC_URL` to the
   fallback URL (owner action; never commit the URL if it embeds an API
   key) -> redeploy.
4. Verify: `/api/health` returns 200 (liveness), then perform one operator
   list request (signature path exercises the RPC read). Note: the health
   endpoint is liveness-only by design and does not probe the RPC; the
   operator list call is the functional probe.
5. If the public default RPC is degraded for browsers too, users may see
   stale reads; no funds impact is possible from staleness (reads only).

### IR-3. Smart contract pause (Sentinel actions)

Who: only addresses holding SENTINEL_ROLE on ProtocolRoles (verify with
`script/GovernanceCheck.s.sol`). Sentinel powers are risk-reducing only
and intentionally NOT timelocked.

Available levers (contract -> function):

- NavOracle: `pauseFeed(vault)` / `unpauseFeed(vault)`,
  `acknowledgeDeviation(vault)`.
- PortfolioRegistry: `pausePortfolio(id)` / `unpausePortfolio(id)`.
- ComplianceRegistry: `setBlocked(address,true)` (freezes an address).
- AdapterRegistry: `disableAdapter(adapterId)`.
- ClaimManager: `disputeClaim(id, reason)`, `freezeClaim(id)` /
  `unfreezeClaim(id)`.

Verification of pause state (read-only):

```bash
RPC=https://sepolia.base.org
cast call <navOracle> "vaultFeedPaused(address)(bool)" <vault> --rpc-url $RPC
cast call <portfolioRegistry> "getPortfolio(uint256)" <id> --rpc-url $RPC   # status enum: 4 = PAUSED
```

Criteria to pause: stale or deviating NAV beyond policy, suspicious claim
pattern, adapter misbehavior, compliance emergency. Pausing is preferred
over waiting: it cannot move funds and is reversible by the same role.

Communication template: "A protective pause was activated on <component>
at <time> (UTC) by the protocol Sentinel following <signal>. Deposits and
funds are not affected. Normal operation will resume after review."

### IR-4. Safe / timelock emergency

Scope: a scheduled timelock operation must be stopped (wrong parameters,
compromised proposer intent, changed circumstances).

1. Identify the operation id:
   `id = hashOperation(target, value, data, predecessor, salt)` (see
   `docs/GOVERNANCE_PREFLIGHT.md` for the cast commands), and confirm
   state: `cast call <timelock> "isOperationPending(bytes32)(bool)" <id>`.
2. Cancel (only the Safe holds CANCELLER_ROLE): from the Safe UI, execute
   `cancel(bytes32 id)` on the ProtocolTimelock
   (`0x6e2927627d83A90EDC9cDA3c626B49875f9449CF`). Cancellation requires
   the standard Safe signer threshold - emergency does not reduce the
   quorum.
3. Verify: `isOperationPending(id)` returns false; re-run
   `GovernanceCheck` to confirm no unintended state change occurred.
4. Authorization rule: a cancellation is itself a governance action and
   requires the owner's explicit instruction recorded in writing (chat or
   issue), except when delay would complete a clearly erroneous or
   malicious operation - in that case signers cancel first and document
   immediately after.
5. Never improvise replacement operations in the same window: re-propose
   through the normal schedule -> delay -> execute path.

### IR-5. Key rotation

`SUPABASE_SERVICE_ROLE_KEY` (server-only, highest sensitivity):

1. Supabase dashboard (project `krycyeiwsplztagajauh`) -> Settings -> API
   -> rotate/regenerate the service role key. The old key is invalidated
   by rotation.
2. Vercel dashboard -> project `nextblock2` -> Environment Variables ->
   update `SUPABASE_SERVICE_ROLE_KEY` -> redeploy production.
3. Expect fail-closed 503 from KYB routes in the window between rotation
   and redeploy (intentional; keep the window short).
4. Verify: `/api/kyb/applications/status?wallet=0x1111...1111` returns
   `{"available":true,...}`; an operator list call succeeds.
5. Trigger: suspected exposure, personnel change, or routine rotation at
   least every 180 days. After any suspected exposure also audit Supabase
   logs for unauthorized access during the exposure window.

`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (public identifier, low
sensitivity - rotation defends against quota abuse/spoofing):

1. Reown (WalletConnect) dashboard -> create or regenerate the project id;
   configure the allowed origin `https://www.nextblock.finance`.
2. Vercel -> update `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` -> redeploy.
3. Verify: wallet connection modal opens and a WalletConnect session
   completes on the production URL (endpoints return 200/202, no 403).
4. Note: the value ships in the client bundle by design; treat rotation as
   hygiene, not secrecy.
