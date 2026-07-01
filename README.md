# NextBlock

NextBlock is an institutional reinsurance tokenization protocol on Base:
ceded reinsurance portfolios are registered as RWA references, capital is
provided by whitelisted Institutional LPs through ERC-4626-style USDC vaults
issuing restricted `nbUSDC` shares, and the underwriting lifecycle (portfolio
assessment, premium/UPR accounting, claims with dispute paths) is governed by
explicit on-chain roles. Think Lloyd's rebuilt as a tokenized protocol, not a
consumer insurance app.


> STATUS: Base Sepolia STAGING ONLY (chain id 84532). The protocol has NOT
> received an external security audit. Do not use with real funds. Base-only
> by design: no other chains are operational targets.

## Repository layout

| Path | Content |
|---|---|
| `contracts/` | Foundry workspace: 19 core contracts (`src/`), unit/fuzz/invariant/integration tests (`test/`), deployment scripts (`script/`), pinned libs as git submodules (`lib/`), canonical deployment record (`deployments/84532-staging.json`) |
| `app/` | Next.js frontend (wagmi/viem/RainbowKit) plus the server-side KYB API route handlers (`app/src/app/api/kyb/*`) |
| `scripts/` | Address book codegen: generates `app/src/config/generated/addressBook.ts` from the deployment record, with a byte-for-byte anti-drift check wired into CI |
| `supabase/migrations/` | Versioned SQL for the KYB instructional pipeline (RLS deny-by-default) |
| `docs/` | Security model and operations runbook |
| `audits/` | Audit readiness status and future report placeholders |
| `NEXTBLOCK_GAP_MATRIX.md` | Living gap matrix between current state and the target standard |

## Quick start

```bash
# Frontend checks (root scripts anchor npm to app/ and its lockfile)
npm run ci:frontend:install
npm run ci:frontend:lint
npm run ci:frontend:typecheck
npm run ci:frontend:build

# Address book anti-drift
npm run check:addressbook

# Contracts (requires Foundry; submodules pinned in .gitmodules)
npm run ci:contracts:fmt
npm run ci:contracts:build
npm run ci:contracts:test

# Audit-prep (manual, not in CI yet)
npm run audit:contracts:snapshot     # gas snapshot check vs committed baseline
npm run audit:contracts:coverage     # forge coverage summary
```

Environment variables are documented in `app/.env.example`. The Supabase
service-role key is server-only and must never be exposed to the browser; see
`SECURITY.md` and `docs/SECURITY_MODEL.md`.

## On-chain staging (Base Sepolia, 84532)

The canonical address book is `contracts/deployments/84532-staging.json`,
mirrored into the frontend by generated code (never by hand). Governance
phase 1 is live: a `ProtocolTimelock` (OpenZeppelin TimelockController, 1h
min delay) holds `OWNER_ROLE` and `DEFAULT_ADMIN_ROLE` on `ProtocolRoles`,
with a Safe as proposer/canceller. The deployer EOA still retains roles until
the phase 2 handover, which is intentionally blocked pending an explicit,
rehearsed authorization (see `docs/OPERATIONS.md`).

## CI

Every push and pull request runs three jobs (`.github/workflows/ci.yml`):
`addressbook` (anti-drift), `frontend` (install/lint/typecheck/build, Node
22), `contracts` (forge fmt/build/test with pinned submodules). No secrets
are required by CI.

## Author

Anton Carlo Santoro
