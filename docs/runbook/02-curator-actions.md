# Underwriting Curator — operational runbook

The Curator is the **risk-shaping** role: vault provisioning, portfolio approval, policy registration, capacity caps. Always bounded by the protocol's caps + timelock for risk-increasing actions.

On-chain role: `UNDERWRITING_CURATOR_ROLE` on `ProtocolRoles`.

---

## 1. Provision a vault for an approved cedant

**Trigger**: a cedant completes KYB + sanctions screening and reaches `status=approved` in `/app/admin` (KYB queue). The cedant's `/app/cedant/onboard` page shows "Step 3: Ready for vault provisioning".

**Procedure**:

1. From `/app/create-vault` (Curator-only), enter:
   - `name`: official cedant name, e.g. `"NextBlock Generali Hurricane 2026"`
   - `symbol`: short, e.g. `"nbRV-GEN-HUR"` (follow the `nbRV-XXX-YYY` convention so disclosure stays consistent)
   - `vaultName`: display name
   - `vaultManager_`: the Curator wallet (you) or a delegated Curator address
   - `bufferRatioBps`: typically 2000 (20%) for pilot
   - `managementFeeBps`: typically 50 (0.5% annualized) for pilot
2. Sign the `VaultFactory.createVault(...)` transaction from your Safe.
3. Once mined, copy the returned vault address from the tx receipt.
4. Tell the cedant to paste the address into the `VaultProvisioningRecorder` panel on `/app/cedant/onboard` (Step 3), which calls `/api/cedant/[id]/provision-vault` and persists `cedant_profiles.primary_vault_address`.

**Verify**:
- `VaultCreated` event fires
- The vault is whitelisted as `approvedVenue` in `ComplianceRegistry` (the factory does this automatically; confirm via `cast call`)
- The cedant dashboard `/app/cedant/dashboard` shows "Vault: provisioned"
- The cedant can deposit USDC into the vault (LPs first need to be whitelisted)

---

## 2. Register and activate a policy

**Trigger**: the cedant has a specific policy to put under coverage.

**Procedure** (split between cedant and Curator):

1. **Cedant** calls `PolicyRegistry.registerPolicy(name, verificationType, coverageAmount, premiumAmount, duration, insurer, triggerThreshold)` (gated by `AUTHORIZED_CEDANT_ROLE`).
2. **Curator** calls `PolicyRegistry.activatePolicy(policyId)` — flips status `REGISTERED` → `ACTIVE`.
3. **Curator (vault manager)** calls `InsuranceVault.addPolicy(policyId, weightBps)` on the cedant's vault. `weightBps=10000` = 100% of vault weight on a single policy; split when multiple policies on the same vault.

**Verify**:
- `PolicyRegistered(policyId, ...)` event
- `PolicyActivated(policyId)` event
- `PolicyAdded(policyId, weight)` event on the vault
- `vault.getPolicyIds()` returns the new policy id — the cedant's premium-payment dropdown in `/app/cedant/dashboard` picks it up within 30s

---

## 3. Approve and activate a portfolio

**Trigger**: cedant submits a portfolio via `PortfolioRegistry.submitPortfolio`.

**Procedure**:

1. Cedant submission lands in `PortfolioRegistry` with status `REGISTERED`.
2. Curator reviews the submission off-chain (cedant's KYB profile, line of business, premium projections, the documentHash they posted).
3. Curator calls `PortfolioRegistry.startReview(portfolioId)`.
4. After due diligence, Curator calls `PortfolioRegistry.approvePortfolio(portfolioId, expectedLossBps)` — sets the expected loss ratio.
5. Curator calls `PortfolioRegistry.activatePortfolio(portfolioId)` — opens it to claim submissions.

**Verify**:
- All three events emitted in order
- `portfolio.status` is `ACTIVE` via `cast call`
- `portfolio.expectedLossBps` matches the value you set

---

## 4. Capacity caps + risk limits

NextBlock has caps at multiple levels — portfolio, cedant, line-of-business, vault. The Curator sets and revisits them.

**Procedure**:

1. Open `/app/admin/system-status` to confirm the deployed contracts you're acting against.
2. Cap-setting functions vary by contract (see NatSpec); they are timelocked when they would INCREASE risk.
3. For pilot, default caps were set at deploy time — only change them if the cedant requests a larger ceded capacity AND your underwriting analysis supports it.

**Verify**:
- Cap-change events emitted
- Subsequent `submitClaim` / `depositPremium` calls respect the new ceiling
- Audit log line in `kyb_review_events` or analogous if you record the decision in DB

---

## 5. Grant operational roles to a new cedant wallet

**Trigger**: a cedant is onboarded and needs `AUTHORIZED_CEDANT_ROLE` (to submit claims, register policies, propose bordereau) and `PREMIUM_DEPOSITOR_ROLE` (to pay premium directly on the vault).

**Procedure** (these grants belong to the Owner, not the Curator — but Curator coordinates):

1. Confirm the cedant's KYB status is `approved` and `ComplianceRegistry.canReceive(wallet)` returns `true`.
2. Owner Safe calls `ProtocolRoles.grantRole(AUTHORIZED_CEDANT_ROLE, cedantWallet)`.
3. Owner Safe calls `ProtocolRoles.grantRole(PREMIUM_DEPOSITOR_ROLE, cedantWallet)`.
4. Document the grant in the role-handoff log (`/app/admin` has a role-handoff panel for tracking).

**Verify**:
- `RoleGranted` events fire
- The cedant can submit claims (test once with a tiny amount on a registered policy)
- `PremiumPaymentPanel` on the cedant dashboard accepts a real premium without `MISSING_ROLE` revert
