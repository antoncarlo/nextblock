---
title: Terms & Conditions — Cedant (DRAFT)
version: 0.1.0-draft
status: DRAFT — not legal advice — do not execute
counsel_review_required: true
last_technical_review: 2026-06-19
---

# Terms & Conditions — Cedant

> ⚠️ **DRAFT TEMPLATE — NOT LEGAL ADVICE.**
> Every clause is a placeholder pending review by licensed counsel in
> `<JURISDICTION>` (and any jurisdiction where the Cedant writes original
> insurance risk). Do not execute, share with counterparties, or publish.
> Read `README.md` in this directory before editing.

## 0. Parties

These Terms ("**Agreement**") are entered into between:

- **`<NEXTBLOCK ENTITY LEGAL NAME>`** ("**NextBlock**"), as defined in `01-terms-institutional-lp.md` clause 0; and
- The Cedant identified at onboarding ("**Cedant**", "**you**" or "**your**"), being a regulated insurance / reinsurance entity duly authorised in its jurisdiction of establishment.

## 1. Eligibility and onboarding

1.1 The Cedant represents and warrants that it (a) holds the licences, authorisations and registrations required to write or assume the insurance / reinsurance risk ceded into NextBlock; (b) is not subject to insolvency, resolution or comparable proceedings; (c) has authority to enter into this Agreement.

1.2 The Cedant shall complete the dedicated cedant onboarding at `/app/cedant/onboard`, providing:
- regulatory documentation (license number, regulator, scope of authorisation);
- ultimate beneficial owners and senior management for sanctions / PEP screening;
- the underwriting profile (lines of business, geographic scope, annual premium band, expected ceded capacity); and
- a primary signing wallet on Base.

1.3 NextBlock will provision a **dedicated Vault** (the "**Cedant Vault**") for the Cedant via `VaultFactory.createVault`. The Cedant Vault is isolated from all other Vaults on the protocol — no commingling.

1.4 NextBlock may suspend or terminate the Cedant's access if (a) a regulatory action concerning the Cedant becomes known; (b) sanctions screening returns an unresolved match; (c) the Cedant materially breaches this Agreement.

## 2. The Service

2.1 NextBlock provides the **software infrastructure** that enables the Cedant to tokenize a portfolio of ceded insurance risk into the Cedant Vault and to receive liquidity from whitelisted Institutional LPs in `USDC` on Base.

2.2 **NextBlock is not a reinsurer.** NextBlock does not assume insurance risk, does not act as a fronting carrier, and does not provide capital. The reinsurance / retrocession relationship subsists between the Cedant and the LPs (via the Vault smart-contract), with the technical mechanics described in `<TREATY DOCUMENTATION>` agreed separately between the Cedant and the relevant LPs or the Underwriting Curator.

2.3 **Smart-contract execution.** The Cedant acknowledges that core lifecycle steps — premium recognition, NAV update, claim payout — are executed automatically by the Vault smart contracts based on inputs supplied by authorised roles (`AUTHORIZED_CEDANT_ROLE`, `ORACLE_ROLE`, `CLAIMS_COMMITTEE_ROLE`, `SENTINEL_ROLE`). The Cedant is responsible for the accuracy of its on-chain inputs.

## 3. Underwriting and portfolio governance

3.1 **Portfolio submission.** Portfolios are submitted via `PortfolioRegistry.submitPortfolio` and reviewed by the Underwriting Curator. The Curator may approve, request information, or reject.

3.2 **Capacity caps.** Portfolio, cedant, line-of-business and Vault exposure are subject to caps configured by the Curator. The Cedant shall not attempt to circumvent or evade these caps.

3.3 **Bordereau attestation.** The Cedant shall provide bordereau data on the cadence agreed in `<BORDEREAU SCHEDULE>` (default: monthly). Bordereau attestations are recorded via `BordereauOracle.proposeAssertion` with a `dataHash` anchoring the off-chain file. **The Cedant warrants that submitted bordereau data is true, complete and not misleading.**

## 4. Premium, NAV and claim payouts

4.1 **Premium.** The Cedant transfers the ceded premium in `USDC` on Base by calling `InsuranceVault.depositPremium` (or via the Premium Distributor module). Premium is recognised on a linear earned basis over the coverage duration (UPR accounting) — **the Cedant cannot rely on premium being immediately treated as earned**.

4.2 **NAV.** The Cedant Vault's NAV is updated periodically by the Oracle role based on Braino.ai or other approved assessment inputs. The NAV is the authoritative measure of Vault solvency.

4.3 **Claims — non-parametric.** For non-parametric claims, the Cedant submits a claim via `ClaimManager.submitClaim`, supplies an evidence hash, and accepts that:
- the **AI assessor** must publish an advisory assessment (`AIAssessor.publishAssessment`);
- a **dispute window** (default `<N>` days) gives the Sentinel time to challenge;
- the **Claims Committee** approves or rejects; and
- `executeClaim` settles the payout in `USDC` on Base.

4.4 **Claims — parametric.** Parametric claims may bypass the dispute window when the on-chain trigger condition is verifiable from approved data sources. The Cedant acknowledges that the trigger logic is final and not subject to discretionary review post-trigger.

4.5 **Frozen claims.** A claim may be **frozen** by the Sentinel pending investigation. While frozen, no payout occurs. **`<COUNSEL: align freeze-and-investigate posture with policy-level cedant rights and regulator expectations>`.**

## 5. Compliance — sanctions, KYC operator, audit

5.1 The Cedant authorises NextBlock to perform recurring sanctions / PEP / adverse-media screening on the Cedant and its declared beneficial owners.

5.2 The Cedant shall **promptly notify NextBlock** of any material change to its licensing status, regulatory standing, control or ownership structure, or any sanctions exposure.

5.3 An immutable audit trail of every claim-lifecycle on-chain log is maintained off-chain (`claim_audit_trail`) and may be disclosed to regulators upon lawful request.

## 6. Fees

Fees borne by the Cedant include `<PROTOCOL FEE BPS>` on premium inflows, `<CLAIM SERVICING FEE>` on settled claims, and the Curator's `<MANAGEMENT FEE BPS>` accrual. **Final rates are reflected in the Cedant Vault parameters and may be updated by the Curator with `<NOTICE PERIOD>` notice for new portfolios.**

## 7. Representations and warranties

The Cedant represents and warrants on a continuing basis that: (a) it complies with applicable insurance, AML and data protection law; (b) the data it submits (KYB, portfolio, bordereau, claim evidence) is true and complete; (c) it has not been placed on a sanctions list and is not aware of any imminent listing; (d) it owns or is duly authorised to cede the insurance risk transferred via the Cedant Vault.

## 8. Indemnity

The Cedant shall indemnify NextBlock against any third-party claim, regulatory penalty or loss arising from (a) misrepresentation of underwriting or bordereau data; (b) ceding risk that the Cedant was not authorised to write; (c) breach of compliance obligations in Section 5.

## 9. Limitation of liability and force majeure

Clauses 9 and 10 of `01-terms-institutional-lp.md` apply *mutatis mutandis* to this Agreement, with the cap calibrated separately in `<CEDANT-SPECIFIC LIABILITY CAP>`.

## 10. Governing law and dispute resolution

Clause 11 of `01-terms-institutional-lp.md` applies *mutatis mutandis*, subject to **`<COUNSEL: confirm enforceability vs the Cedant's regulator and the seat of arbitration>`.**

## 11. Termination and run-off

11.1 Either party may terminate this Agreement with `<NOTICE PERIOD>` written notice. **Termination does not affect outstanding obligations on already-ceded portfolios**, which continue under run-off until expiry of the underlying coverage or full settlement of pending claims, whichever is later.

11.2 During run-off, NextBlock continues to operate the Cedant Vault for the purpose of premium accrual, claim handling and orderly payout, against payment of run-off fees disclosed at termination.

## 12. Notices

Notices: per `01-terms-institutional-lp.md` clause 13, with copies to the Cedant's regulatory liaison `<NAME / TITLE / EMAIL>`.

---

**Signed acknowledgement.** By completing onboarding and signing the on-chain provisioning step, the Cedant confirms that an authorised signatory has read, understood and agreed to be bound by this Agreement and the documents incorporated by reference.

`Place: <PLACE>` · `Date: <DATE>` · `Authorised signatory: <NAME / TITLE>` · `Signature: <WALLET SIGNATURE OF TERMS HASH>`
