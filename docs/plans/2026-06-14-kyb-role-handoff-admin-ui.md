# Plan — KYB-to-on-chain role handoff admin UI (staging pilot)

- Status: **DRAFT — planning only, not implemented**
- Date: 2026-06-14
- Base: `main` @ 730545a (after PR #14 Portfolio Upload UI)
- Scope: frontend-only operator tooling for the staging pilot. No contracts, no
  ABIs, no address book, no deployment files, no governance docs, no Supabase
  schema changes.
- Author: Anton Carlo Santoro

---

## 1. Goal

Give the KYB/KYC operator an admin panel that bridges an **approved KYB
application** to the **on-chain operational role** that approval implies, for the
Base Sepolia (84532) staging pilot, without changing contracts or governance.

The panel must:
- list KYB-approved applicants and, for each, show whether the required on-chain
  role is already granted;
- let an authorized operator either (a) execute the real staging `grantRole`
  write, or (b) copy the Safe/Timelock-ready calldata for the post-handover
  world;
- handle every wallet/role/transaction state explicitly;
- make it unmistakable that this is **staging operator functionality, not
  Governance Stage A**.

## 2. Current manual gap (PR-3)

Today the KYB pipeline ends in the database and a *whitelist* hint:

- `KybReviewQueue` (`app/src/components/admin/KybReviewQueue.tsx`) drives the
  review state machine (`submitted -> under_review -> approved/rejected/needs_info`)
  via signed, server-verified operator actions. The review API
  (`app/src/app/api/kyb/applications/[id]/review/route.ts`) only updates the
  Supabase row — it performs **no** on-chain action by design.
- For `approved` rows the queue renders **instructional `setWhitelist` calldata**
  for `ComplianceRegistry` (the compliance/LP gate), but never sends it.
- There is **no UI for the operational role grant**. After KYB approval, putting
  a cedant on `AUTHORIZED_CEDANT_ROLE` or a curator on
  `UNDERWRITING_CURATOR_ROLE` is a fully manual `cast`/Safe step. That is the
  PR-3 gap this plan closes.

Two distinct on-chain steps follow an approval, and only the first is surfaced:

| Step | Contract | Method | Surfaced today? |
|---|---|---|---|
| Compliance / LP eligibility | `ComplianceRegistry` (`0x6A77…5eB9`) | `setWhitelist(addr,true)` | calldata only (instructional) |
| Operational role | `ProtocolRoles` (`0xEE93…c976`) | `grantRole(role,addr)` | **missing** |

## 3. Existing files / routes / hooks / components involved

| Area | Path | Role in this feature |
|---|---|---|
| Role constants (source of truth) | `contracts/src/ProtocolRoles.sol` | read-only reference; `OWNER_ROLE` admins all operational roles |
| Roles ABI | `app/src/config/contracts.ts` → `PROTOCOL_ROLES_ABI` | already has `grantRole`, `hasRole`, `getRoleAdmin`, `revokeRole` (no change) |
| Compliance ABI | `app/src/config/contracts.ts` → `COMPLIANCE_REGISTRY_ABI` | `canReceive`, `setWhitelist` (read for status) |
| Role flags | `app/src/hooks/useProtocolAccess.ts` | `ROLE_IDS`, `isOwner` (gate for the write), on-chain truth |
| Addresses | `app/src/hooks/useAddresses.ts`, `app/src/config/generated/addressBook.ts` | `protocolRoles`, `complianceRegistry` |
| KYB domain | `app/src/lib/kyb/schema.ts` | `KYB_APPLICANT_TYPES = ['cedant','curator']`, statuses |
| KYB list API | `app/src/app/api/kyb/applications/route.ts` | reused as-is to fetch approved applicants (signed operator auth) |
| Existing admin queue | `app/src/components/admin/KybReviewQueue.tsx` | sibling panel; pattern to mirror (signed list load, Safe-calldata preview) |
| Admin mount point | `app/src/app/app/admin/page.tsx` | gated `isOwner || isSentinel || isCommittee`; new panel mounts next to `KybReviewQueue` (~line 106) |
| Deployments (read-only) | `contracts/deployments/84532-staging.json` | `deployer 0xfF6f…81d2` still holds `OWNER_ROLE` (Stage A not executed) |

## 4. Proposed UX

A new **Role Handoff** panel on the admin page, directly under the KYB Review
Queue.

1. **Header + standing warning banner**: "Staging operator tooling. Direct
   writes use your wallet's on-chain `OWNER_ROLE`. This is **not** Governance
   Stage A and does not transfer Safe ownership or revoke the deployer."
2. **Load**: reuse the same signed operator-auth load as `KybReviewQueue`
   (sign → `GET /api/kyb/applications`), then filter client-side to
   `status === 'approved'`.
3. **Per applicant row**:
   - company name, `applicant_type`, wallet (truncated + full);
   - **Default role** derived from `applicant_type` (cedant → `AUTHORIZED_CEDANT_ROLE`,
     curator → `UNDERWRITING_CURATOR_ROLE`), with an operator override `<select>`
     restricted to the grantable operational role set (§5);
   - **Live status chips** from on-chain reads: `Role: granted / not granted`
     (`hasRole`), `Whitelist: yes / no` (`canReceive`);
   - **Action area** with two routes:
     - **Direct (staging)**: `Grant role` button → real `grantRole` write,
       enabled only when the connected wallet `isOwner` and the role is not
       already granted;
     - **Governance route (preview)**: collapsible block showing the
       Safe→Timelock calldata for `grantRole` (target `protocolRoles`), mirroring
       the existing `setWhitelist` preview — copy only, never sent.
   - Re-read `hasRole` on success so the chip flips to "granted" without a manual
     refresh.
4. **Empty / loading / unavailable / denied** states identical in spirit to
   `KybReviewQueue`.

## 5. Role mapping table

Grantable operational roles only. `OWNER_ROLE`, `DEFAULT_ADMIN_ROLE` and
`VAULT_FACTORY_ROLE` are intentionally **excluded** (governance/contract-level,
admined by `DEFAULT_ADMIN_ROLE` or meant for factory contracts, not human pilot
actors).

| Pilot actor | Required role | `applicant_type` source | Notes |
|---|---|---|---|
| Insurance company / cedant | `AUTHORIZED_CEDANT_ROLE` | `cedant` (auto-default) | submits portfolios + claims |
| Underwriting curator | `UNDERWRITING_CURATOR_ROLE` | `curator` (auto-default) | reviews/approves/activates portfolios + claims |
| Asset manager / vault manager | `UNDERWRITING_CURATOR_ROLE` (+ optional `ALLOCATOR_ROLE`) | operator-selected | protocol has **no** dedicated vault-manager role; vault authority = curator + allocator |
| Committee member | `CLAIMS_COMMITTEE_ROLE` | operator-selected | off-chain claim approval path |
| Sentinel / risk guardian | `SENTINEL_ROLE` | operator-selected | pause/dispute; never moves funds |
| KYC operator | `KYC_OPERATOR_ROLE` | operator-selected | manages whitelist |
| Oracle / attestor | `ORACLE_ROLE` | operator-selected | NAV/bordereau/risk attestations |
| Premium depositor | `PREMIUM_DEPOSITOR_ROLE` | operator-selected | premium USDC transfer authority |

**Mapping limitation (decision for owner):** the KYB form only encodes
`cedant | curator`. Committee/sentinel/asset-manager applicants cannot be
auto-mapped from `applicant_type`. This plan **avoids a Supabase schema change**
by letting the operator pick the target role manually (defaulting from
`applicant_type` when it is cedant/curator). Extending `KYB_APPLICANT_TYPES`
would require a migration and is deliberately out of scope unless authorized
(see §11 / Blockers).

## 6. Contract methods involved

| Contract | Method | Direction | Use |
|---|---|---|---|
| `ProtocolRoles` | `grantRole(bytes32 role, address account)` | write | the role handoff (primary action) |
| `ProtocolRoles` | `hasRole(bytes32 role, address account)` | read | "already granted" status + duplicate guard |
| `ProtocolRoles` | `getRoleAdmin(bytes32 role)` | read (optional) | confirm `OWNER_ROLE` admins the target role before offering the write |
| `ComplianceRegistry` | `canReceive(address)` | read | whitelist/LP status chip |
| `ComplianceRegistry` | `setWhitelist(address,bool)` | (preview only) | reference to the existing KybReviewQueue step; not re-implemented here |

All already present in the committed ABIs — **no ABI changes required**. Role ids
are derived client-side via `keccak256(toBytes('…_ROLE'))` exactly as
`useProtocolAccess.ROLE_IDS` already does (no new on-chain reads of the public
constants).

## 7. Safety and authorization model

- **On-chain authority is the real gate.** `grantRole` reverts unless
  `msg.sender` holds `getRoleAdmin(role)` = `OWNER_ROLE`. The UI mirrors this by
  enabling the write only when `useProtocolAccess().isOwner` is true; the button
  is never the security boundary.
- **Staging reality:** the deployer EOA (`0xfF6f…81d2`) still holds `OWNER_ROLE`
  (Stage A not executed), so direct staging grants work today with explicit
  operator control — exactly the pilot posture.
- **Chain guard:** writes blocked unless `chainId === 84532`, reusing the
  `usePortfolioActions` / `useClaimActions` guard pattern (no tx on wrong chain).
- **Target validation:** wallet must match `0x[0-9a-fA-F]{40}` (reuse the KYB
  `EVM_ADDRESS_RE`); the address comes from the approved KYB row, not free text.
- **Duplicate guard:** if `hasRole(role, wallet)` is already true, the write is
  disabled and the chip reads "already granted".
- **Restricted role set:** the `<select>` only exposes the operational roles in
  §5; `OWNER`/`DEFAULT_ADMIN`/`VAULT_FACTORY` are not selectable.
- **Tx lifecycle:** `idle → pending → confirming → success → reverted`, surfaced
  via `useWriteContract` + `useWaitForTransactionReceipt` (first line of the
  revert reason shown, like the existing actions hooks).
- **Standing warning:** persistent banner stating this is staging operator
  tooling, not Governance Stage A; no Safe ownership transfer, no deployer
  revocation, no mainnet handover.
- **No auto-grant:** approval in the DB never triggers a grant; every grant is an
  explicit, separately-confirmed operator action (justification: on-chain role
  assignment must remain a deliberate, auditable act).

## 8. File-by-file implementation plan (future work, not done now)

| File | Action | Content |
|---|---|---|
| `app/src/lib/roles/handoff.ts` | **new** (pure, viem-only, strip-types safe) | `GRANTABLE_ROLES` list with label + `keccak256` id; `defaultRoleForApplicant(type)`; `isValidEvmAddress`; `buildGrantRoleCalldata(role, account)` via `encodeFunctionData`; const-object pattern (no TS `enum`) so the node smoke can import it |
| `app/src/hooks/useRoleAdmin.ts` | **new** (`'use client'`) | reads `hasRole` (batched per row/role) and `canReceive`; exposes `useRoleStatus(account, role)` and a `useGrantRole()` writer with chain guard + localized `as Parameters<typeof writeContract>[0]` cast, mirroring `usePortfolioActions` |
| `app/src/components/admin/RoleHandoffPanel.tsx` | **new** | the panel in §4: signed load (reuse `operatorAuthMessage` + `/api/kyb/applications`), approved filter, per-row role select + status chips + direct grant + Safe-calldata preview, full state handling |
| `app/src/app/app/admin/page.tsx` | **modify (+~4 lines)** | import and render `<RoleHandoffPanel />` directly after `<KybReviewQueue />` |
| `app/scripts/role-handoff-smoke.ts` | **new** | node `--experimental-strip-types` checks for `handoff.ts` (id derivation matches `ROLE_IDS`, default mapping, address validation, calldata non-empty/decodes) |

No other files change. Reuses existing APIs, ABIs, addresses and auth.

## 9. Testing plan

- **Smoke (`app/scripts/role-handoff-smoke.ts`, node strip-types):**
  - `keccak256` role ids equal `useProtocolAccess.ROLE_IDS` for each grantable role;
  - `defaultRoleForApplicant('cedant') === AUTHORIZED_CEDANT_ROLE`,
    `('curator') === UNDERWRITING_CURATOR_ROLE`;
  - `isValidEvmAddress` accepts/rejects correctly;
  - `buildGrantRoleCalldata` returns `0x…` that decodes back to `grantRole` with
    the same args;
  - grantable set excludes `OWNER_ROLE` / `DEFAULT_ADMIN_ROLE` / `VAULT_FACTORY_ROLE`.
- **`npm run ci`** must stay green (lint/typecheck/build + 440 contract tests
  unchanged — no Solidity touched).
- **Manual staging walkthrough (documented, not automated):** connect deployer
  (OWNER) → load queue → grant `AUTHORIZED_CEDANT_ROLE` to an approved cedant →
  chip flips to "granted" → that wallet can now submit a portfolio in the
  Portfolio Onboarding panel (end-to-end PR-3 closure).
- No Foundry changes (no contract change). No fork test needed.

## 10. Acceptance criteria

- Operator sees KYB-approved applicants and, per applicant, the required role and
  whether it is already granted (`hasRole`) and whitelisted (`canReceive`).
- Operator can **either** execute a real staging `grantRole` write **or** copy
  Safe/Timelock `grantRole` calldata (hybrid).
- UI clearly shows granted vs not-granted per role.
- UI handles: disconnected, wrong-chain, missing admin authority (`!isOwner`),
  invalid/duplicate role, pending, confirming, success, reverted.
- Persistent "staging, not Stage A" warning is visible.
- No contracts / ABIs / address book / deployment / governance docs / Supabase
  migrations changed.
- `npm run ci` green.

## 11. Risks and non-goals

**Risks / mitigations**
- *Granting the wrong powerful role* → restricted select set + per-role admin
  check (`getRoleAdmin`) + duplicate guard + explicit confirm.
- *Operator confuses this with governance* → standing banner + Safe-calldata
  route labelled "post-handover".
- *Post-Stage-A breakage* (deployer revoked) → direct write simply disables
  (`!isOwner`); the Safe-calldata route remains valid. Documented, not silently
  broken.
- *Mapping mismatch for non-cedant/curator actors* → operator manual select;
  schema extension deferred.

**Non-goals (explicit):** Governance Stage A execution; Safe ownership transfer;
deployer revocation; production/mainnet role handover; Supabase schema change;
auto-grant on approval; any contract change; `revokeRole` UI (separate concern).

## 12. Follow-up branches

- `feat/role-grant-admin-ui` — this plan's implementation (frontend-only).
- `feat/role-revoke-admin-ui` — symmetric `revokeRole` operator tooling (later).
- `feat/kyb-applicant-type-expansion` — *only if authorized*: Supabase migration
  to extend `KYB_APPLICANT_TYPES` so committee/sentinel/asset-manager applicants
  carry a typed role hint instead of operator manual selection.
- `feat/fee-ops-ui`, `feat/portfolio-allocation-ui` — unrelated pilot backlog,
  unchanged by this plan.
