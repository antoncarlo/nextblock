# Security Policy

## Status

NextBlock is in STAGING on Base Sepolia (84532). The contracts have NOT been
externally audited. Do not deposit real value. See `audits/README.md` for the
current audit-readiness state.

## Reporting a vulnerability

Open a private report to the repository owner (GitHub security advisory on
`antoncarlo/nextblock` or direct contact). Please do not open public issues
for exploitable findings. Include reproduction steps and impact; staging-only
findings are still welcome.

## Secrets policy

- No private keys, mnemonics, API tokens or service-role keys are ever
  committed, logged or printed. CI runs without secrets.
- `SUPABASE_SERVICE_ROLE_KEY` exists only as a server-side environment
  variable (Vercel runtime / local `.env.local`). It has no `NEXT_PUBLIC_`
  prefix, is read exclusively by `app/src/lib/supabase-server.ts`, and is
  verified absent from the client bundle. If it ever leaks, rotate it from
  the Supabase dashboard immediately.
- The Supabase anon key visible in `app/src/integrations/supabase/client.ts`
  is publishable by design; Row Level Security is the boundary, not the key.
- Deployment uses the Foundry keystore pattern; broadcast artifacts in
  `contracts/broadcast/` contain transactions and hashes, never key material.

## Data and PII

The KYB pipeline stores applicant PII (company, contacts, license) in
Supabase under total deny-by-default RLS: no policy exists for anon or
authenticated roles in any direction. The only public read surface is
`GET /api/kyb/applications/status`, which returns applicant type, status and
timestamps only — never PII. Operator reads/reviews require an EIP-191 wallet
signature verified server-side against on-chain `KYC_OPERATOR_ROLE` /
`OWNER_ROLE` membership.

## Security boundaries (summary)

Authoritative: on-chain role checks (ProtocolRoles), on-chain compliance
(ComplianceRegistry), timelocked governance (ProtocolTimelock), server-side
signed APIs, database RLS. NOT authoritative: any client-side gate, including
the admin dashboard visibility check (`LEGACY_ADMIN_UI_HINT`), which is
explicitly cosmetic. Full model: `docs/SECURITY_MODEL.md`.

## Dependencies

Solidity libraries are pinned git submodules (forge-std v1.9.7,
openzeppelin-contracts v5.4.0). Frontend dependencies are locked via
`app/package-lock.json`; `npm audit --audit-level=high --omit=dev` exits 0,
with a documented residual of moderate transitive advisories in the wallet
stack (tracked in `NEXTBLOCK_GAP_MATRIX.md`).
