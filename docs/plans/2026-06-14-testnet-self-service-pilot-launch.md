# Plan — Testnet Self-Service Pilot Launch (Base Sepolia)

- Status: **DRAFT — planning only, not implemented**
- Date: 2026-06-14
- Base: `main` @ d78e84e (after PR #15 KYB role handoff admin UI)
- Scope: bring NextBlock online on **Base Sepolia (84532) testnet only** so external
  pilot users can self-serve. No mainnet, no real funds, no Governance Stage A.
- Author: Anton Carlo Santoro

> Testnet pilot. No real funds. Contracts already deployed on Base Sepolia; this
> plan does **not** redeploy or modify them. The deployer EOA still holds every
> role (Stage A not executed) and acts as the explicit pilot operator.

---

## 0. Current-state audit (grounding)

| Area | State | Evidence |
|---|---|---|
| Contracts on 84532 | **Present**, all live | `contracts/deployments/84532-staging.json` (vault, registries, claim, oracle, `usdc 0x8d45…EA22`) |
| Frontend hosting | **Present** | Vercel project, public staging at nextblock.finance |
| Supabase (KYB) | **Partial** | project `krycyeiwsplztagajauh`; migrations applied; routes 503 until `SUPABASE_SERVICE_ROLE_KEY` set on Vercel |
| Test USDC faucet | **Present (contract)** | `MockUSDC.mint(address,uint256)` is permissionless; faucet button exists in `DepositSidebar` (10,000 USDC) |
| Base Sepolia ETH (gas) | **External** | no on-chain mint; users need a public Sepolia ETH faucet |
| Onboarding/role notices | **Partial** | `NetworkAvailabilityNotice`, `DeployerWalletWarning`, `WalletRoleIndicator`, `useProtocolAccess` — but **no single self-service onboarding/status dashboard** |
| Portfolio onboarding UI | **Present** (merged PR #14) | `/app/my-company`, `/app/syndicates/dashboard` |
| Claim lifecycle UI | **Present** (merged) | admin + my-company |
| KYB review + role handoff | **Present** (merged PR #15) | `KybReviewQueue` + `RoleHandoffPanel` on `/app/admin` |
| Allocation / premium / fee UI | **Missing** | no VaultAllocator/premium/fee operator UI |

Headline gap for self-service: **there is no unified "where am I / what do I do next"
surface**, and the **KYB backend is not enabled in production** (service-role key).
Everything else for an onboarding + review + claim demo loop already exists.

## 1. Public testnet deployment architecture

### 1.1 Frontend (Vercel)
- Reuse the existing Vercel project; one **Production** deployment tracking `main`
  (public pilot URL) plus automatic preview deployments per PR.
- Framework: Next.js 16 build already green in CI; no new hosting work.
- Recommended: a single canonical pilot URL (e.g. `app.nextblock.finance` or the
  existing `www.nextblock.finance/app`) communicated to pilot users.

### 1.2 Supabase (staging)
- Reuse project `krycyeiwsplztagajauh` (the one `client.ts` points to). Do not
  create a new project. Migrations are already applied.
- **Action (owner):** set `SUPABASE_SERVICE_ROLE_KEY` in Vercel server env so the
  KYB submit/list/review routes leave the 503 state. This is the single biggest
  unlock for self-service KYB.

### 1.3 Base Sepolia contracts/addresses
- Use the committed address book as-is (`config/generated/addressBook.ts` from
  `84532-staging.json`). **No redeploy, no address-book change** in this pilot.
- Chain is already pinned to 84532 across the app (chain guards in place).

### 1.4 Environment variables (testnet)
| Var | Scope | Purpose | Status |
|---|---|---|---|
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | client | wallet connect | set (per prior work) |
| `NEXT_PUBLIC_SUPABASE_URL` | client | KYB reads | set |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | KYB reads | set |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | KYB write/review routes | **MISSING — P0** |
| `BASE_SEPOLIA_RPC_URL` | server | KYB operator role check (read) | optional; defaults to public RPC |

No new env vars are required by this plan beyond enabling the existing ones.

### 1.5 Domain / URL strategy
- One public Production URL on `main`; PR previews for review.
- A short, shareable per-role deep link set (e.g. `/app/my-company`,
  `/app/syndicates/dashboard`, `/app/admin`, plus the new `/app/pilot` hub).

## 2. Self-service role journeys

Each journey starts at the new **Pilot hub** (§3), which routes the user to the
right screen and tells them their next action. Roles are granted by the operator
via the merged `RoleHandoffPanel` (deployer holds OWNER_ROLE on staging).

| Role | Entry | Self-service path | Gated by |
|---|---|---|---|
| Company / Cedant | `/app/apply` → `/app/my-company` | Submit KYB → operator grants `AUTHORIZED_CEDANT_ROLE` → submit portfolio → submit claim | `AUTHORIZED_CEDANT_ROLE` |
| Asset Manager / Vault Manager | `/app/syndicates/dashboard` | View vaults; (allocation actions = P1 UI; operator-facilitated interim) | `UNDERWRITING_CURATOR_ROLE` (+ `ALLOCATOR_ROLE`) |
| Curator / Underwriting | `/app/syndicates/dashboard` | Review queue: startReview → approve(lossBps) → activate portfolio | `UNDERWRITING_CURATOR_ROLE` |
| Committee Member | `/app/admin` (claim panel) | Resolve/approve/reject off-chain claims | `CLAIMS_COMMITTEE_ROLE` |
| Sentinel / Admin | `/app/admin` | Pause/dispute/freeze risk actions | `SENTINEL_ROLE` |
| Protocol Operator | `/app/admin` | KYB review + `RoleHandoffPanel` grants + time/oracle demo controls | `OWNER_ROLE` (deployer) |
| B2B demo viewer | `/app/pilot` (read-only) | Connect wallet, browse on-chain state, no role needed | none (read-only) |

KYB → role is the spine: every privileged journey requires (a) KYB approval in
Supabase, then (b) an explicit on-chain role grant by the operator. Both surfaces
now exist; the pilot hub makes the hand-off legible to the user.

## 3. Pilot onboarding / status dashboard (the core new build)

New route `/app/pilot` (and a compact widget reusable in the header). A single
read-only diagnostic that answers "what do I need to do next". States, in order:

1. **Wallet connected?** — if not, connect prompt.
2. **Correct chain (84532)?** — if not, switch-network prompt (no tx).
3. **Testnet assets** — Sepolia ETH balance (gas) + test USDC balance, each with a
   one-click/linked remedy (USDC faucet button; external ETH faucet link).
4. **KYB status** — read `/api/kyb/applications/status` for the wallet: none /
   submitted / under_review / approved / rejected / needs_info, with the apply CTA.
5. **On-chain role status** — `useProtocolAccess` flags (cedant/curator/committee/
   sentinel/owner/allocator) shown as granted/not-granted chips.
6. **Next action by role** — deterministic instruction derived from the above
   (e.g. "KYB approved, role not yet granted → ask operator / share wallet").
7. **Blocked state + support** — if a precondition fails, show exactly which one and
   the support channel (e.g. a documented operator contact / form).

Implementation note: this is **read-only and additive** — it composes existing
hooks (`useProtocolAccess`, `useAddresses`, balance reads, KYB status fetch). No
contract or schema change.

## 4. Testnet asset readiness

| Asset | Need | How users get it | How they know it's enough |
|---|---|---|---|
| Base Sepolia ETH | gas for every tx | external public faucet (link surfaced in pilot hub) | pilot hub shows balance + a "≥ X ETH" check (recommend ≥ 0.02) |
| Test USDC (`0x8d45…EA22`) | deposits, premium, claim demos | in-app faucet button → `MockUSDC.mint(self, amount)` (permissionless) | pilot hub shows USDC balance + faucet CTA when low |

- The faucet logic already exists in `DepositSidebar` (`useFaucet`, 10,000 USDC);
  the pilot hub should reuse/expose the same mint so every role — not only the
  deposit screen — can self-fund.
- Runbook: document the ETH faucet URL and the USDC faucet button in the per-role
  guides (§6). No manual operator minting needed (mint is permissionless).

## 5. Remaining product gaps before full self-service

| Gap | Impact | Pilot decision |
|---|---|---|
| Portfolio allocation UI (VaultAllocator propose/execute) | vault→portfolio capacity loop not self-serviceable | **P1** — operator-facilitated via script in interim; build `feat/portfolio-allocation-ui` |
| Premium association/recording UI (`recordPortfolioPremium`/PremiumDistributor) | premium→UPR→NAV economic loop not driven from UI | **P1** — operator-facilitated interim; build `feat/premium-ops-ui` |
| Fee ops UI | fee config/collection not visible | **P2** — `feat/fee-ops-ui` |
| Role revoke / admin safety UI | only grant exists; no revoke or defense-in-depth `isOwner` guard inside `onGrant` | **P1** — `feat/role-revoke-admin-ui` (+ the non-blocking onGrant guard noted in PR #15 review) |
| Notifications / status history | users rely on polling; no event timeline | **P2** — `feat/status-history-ui` (read indexed events) |
| Unified pilot onboarding hub | no single next-action surface | **P0** — `feat/pilot-onboarding-hub` (§3) |
| KYB backend enabled | routes 503 in prod | **P0** — set `SUPABASE_SERVICE_ROLE_KEY` (owner) |

Honest limitation for the pilot: with onboarding + review + claim UIs merged and
the pilot hub built, pilot users can self-serve **KYB → role → portfolio submit →
review → approve → activate → claim lifecycle**. The **allocation + premium**
economic loop (UPR/NAV movement) remains operator-facilitated until the P1 UIs
land — this should be stated plainly in the pilot guide, not hidden.

## 6. Launch checklist

### 6.1 Pre-launch technical checks
- [ ] `npm run ci` green on `main` (lint/typecheck/build + 440 contract tests).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set on Vercel; KYB submit/list/review return 200.
- [ ] WalletConnect project id valid; wallet connect works on the public URL.
- [ ] Chain guard verified: wrong-chain shows switch prompt, never sends tx.
- [ ] USDC faucet mints to a fresh wallet; ETH faucet link resolves.
- [ ] Operator can grant each role via `RoleHandoffPanel` end-to-end on staging.
- [ ] Pilot hub `/app/pilot` reflects real status for a fresh wallet.

### 6.2 Security warnings & testnet disclaimers
- Persistent banner: "Base Sepolia testnet. No real funds. Test tokens have no
  value. Do not send mainnet assets."
- Keep the existing `DeployerWalletWarning` and the "not Governance Stage A"
  notice on admin tooling.
- No private keys / secrets in client; `SUPABASE_SERVICE_ROLE_KEY` server-only.

### 6.3 User guide per role
- One short page per role (Cedant, Curator/Asset Manager, Committee, Sentinel,
  Operator, B2B viewer): prerequisites, faucet steps, exact click path, expected
  async states, and the support contact. Link from the pilot hub.

### 6.4 Support process
- Documented operator contact + a KYB/role request path (wallet address in, role
  grant out). SLA expectation stated (e.g. "grants processed within X business
  hours during the pilot").

### 6.5 Monitoring
- `/api/health` endpoint (exists) + Vercel runtime logs; watch KYB route error
  rate and CI status. Optional: lightweight uptime check on the public URL.

### 6.6 Rollback
- Frontend: redeploy the previous green Vercel build (Git revert / promote prior
  deployment). No on-chain rollback needed (no new contracts).
- If KYB misbehaves: unset `SUPABASE_SERVICE_ROLE_KEY` to fail the routes closed
  (503) without exposing data; investigate; re-enable.

---

## Final summary

- **Deployment strategy:** single public Base Sepolia staging on the existing
  Vercel + Supabase, reusing the already-deployed contracts/address book; the only
  new build is the read-only pilot onboarding hub, plus enabling the KYB
  service-role key. No redeploy, no contract/address/governance change.
- **Required branches (after this plan, each separately authorized):**
  - `feat/pilot-onboarding-hub` (P0, §3 hub + asset/role/KYB status + faucet reuse)
  - `feat/portfolio-allocation-ui` (P1)
  - `feat/premium-ops-ui` (P1)
  - `feat/role-revoke-admin-ui` (P1, + onGrant `isOwner` defense-in-depth)
  - `feat/fee-ops-ui` (P2)
  - `feat/status-history-ui` (P2)
  - `docs/pilot-user-guides` (P0 docs, per-role guides + disclaimers)
- **P0 blockers before public testnet launch:**
  1. `SUPABASE_SERVICE_ROLE_KEY` on Vercel (KYB end-to-end).
  2. `feat/pilot-onboarding-hub` (self-service next-action surface).
  3. Per-role user guides + testnet disclaimers (`docs/pilot-user-guides`).
  4. Faucet reachable for all roles (ETH link + USDC mint button in hub).
  5. Operator role-grant runbook verified via `RoleHandoffPanel`.
- **P1 improvements after launch:** allocation UI, premium-ops UI, role-revoke UI
  (+ onGrant guard), then P2 fee-ops and status-history.
- **No changes made:** this task created only this planning document. No code,
  contracts, ABIs, address book, deployment, governance docs, Supabase migrations,
  env/config, or static-analysis tooling were modified; nothing deployed,
  broadcast, or transacted.
