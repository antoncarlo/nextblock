# NextBlock app — frontend + server API

Next.js 15 (App Router, wagmi/viem) frontend for the NextBlock protocol,
plus the server-side API routes that power the institutional workflows.
Chain scope: **Base Sepolia (84532) only** in staging.

Setup, env vars and conventions: [docs/DEVELOPER_ONBOARDING.md](../docs/DEVELOPER_ONBOARDING.md).

```bash
# from the repo root (npm is anchored to app/ and its lockfile)
npm run ci:frontend:install
npm --prefix app run dev        # http://localhost:3000
```

## Routes by role (`src/app/app/…`)

| Route | Audience | What it does |
|---|---|---|
| `/app` | role-adaptive home | LP: curated vaults → deposit (with approved-LP nudge); cedant: company view; curator/admin: syndicate view |
| `/app/apply` | public (wallet) | 3-role KYB application — Reinsurer (cedant), Syndicate Curator, Institutional LP — with next-step CTAs once approved |
| `/app/cedant/onboard` · `/app/cedant/dashboard` | cedant | company profile intake (4-step path indicator), premium payment |
| `/app/my-company` | cedant | portfolio onboarding: **bordereau import (.xlsx/CSV) → prefilled submission → confidential pin**, claims lifecycle |
| `/app/vault/[address]` (+`/manage`) | LP / curator | vault detail, curator management |
| `/app/create-vault` | curator | vault deployment |
| `/app/syndicates` (+`/dashboard`) | curator | syndicate views + portfolio review (approve/activate, confidential document download) |
| `/app/redeem` | LP | periodic-window redemption queue (request, countdown, claim) |
| `/app/borrow` | LP | nbUSDC-collateral lending market |
| `/app/claims` | cedant / committee | claims control room + evidence (private, hash-verified) |
| `/app/money-flow` | all | protocol money-flow ledger + investor statement |
| `/app/me` | all | notification preferences |
| `/app/admin` (+`/sanctions`, `/ai-assessments`, `/bordereau`, `/system-status`) | admin | KYB review queue (one-click on-chain whitelist), role handoff, lens status, legacy demo controls (collapsed) |
| `/app/pilot` | admin-only | testnet pilot surface |

## Server API surface (`src/app/api/…`)

Every privileged route re-verifies authority independently: **EIP-191 wallet
signature + on-chain `hasRole` check via RPC**, or a Supabase email session
with app RBAC. Fail-closed (503) when backends are unconfigured.

| Route group | Purpose | Auth |
|---|---|---|
| `kyb/*` | applications submit/list/review, nonce | public submit (rate-limited); operator wallet-sig + on-chain role, or email RBAC |
| `portfolio/pin` · `portfolio/document` | **confidential pinning**: bytes → private bucket, manifest → IPFS, keccak256 → chain; 60s signed-URL download | cedant sig (pin); curator/owner/uploader sig (download) |
| `claims/evidence/*` | private evidence upload/download/status | claimant / reviewer sigs |
| `notifications/*` | in-app list/read, prefs, refresh | owner sig; refresh via `CRON_SECRET` |
| `audit/claims/refresh` · `ai/*` · `sanctions/rescreen` · `bordereau/propose` | scheduled ops | Bearer `CRON_SECRET` |
| `cedant/*` | intake, profile, vault provisioning | wallet-bound + review pipeline |
| `admin/system-status` · `observability/health` | ops introspection | admin |

## Key libraries (`src/lib/…`)

| Lib | Role |
|---|---|
| `portfolio/bordereau.ts` + `portfolio/xlsx.ts` | zero-dependency bordereau parsing (RFC-4180 CSV; native .xlsx ZIP/OOXML reader) → portfolio aggregate |
| `portfolio/form.ts` / `manifest.ts` / `auth*.ts` | on-chain submission params, public integrity manifest, cedant/reviewer auth |
| `ipfs/pinata.ts` | env-driven Pinata client (fail-loud, JWT never logged) |
| `kyb/*` | KYB schema/state machine + operator auth |
| `evidence/*` | content hashing + claim-role auth |
| `email/*` | pluggable provider (mock default / Resend) + templates |
| `notifications/*` | event → notification derivation |
| `moneyflow` / `claimsqueue` / reporting libs | pure, indexer-free read models |

Pure libs are covered by node strip-types smokes in `scripts/*-smoke.ts`
(`bordereau`, `xlsx`, `ipfs-pinata`, `portfolio-manifest`, `kyb`, `email`,
`notifications`, `moneyflow`, …) — run them directly, no network needed.

## Institutional UX rules

- Async lifecycle everywhere: state comes from indexed events/backend, never
  just a tx receipt; `DataSourceBadge` labels onchain / backend / mock-fed.
- The UI is **never** the security boundary — every gate is enforced
  on-chain or server-side.
- No retail-gamified language; SCR/UPR/NAV/claim-reserve terminology.
