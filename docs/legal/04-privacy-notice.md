---
title: Privacy Notice (DRAFT)
version: 0.1.0-draft
status: DRAFT — not legal advice — DPO review required
counsel_review_required: true
last_technical_review: 2026-06-19
---

# Privacy Notice

> ⚠️ **DRAFT TEMPLATE — NOT LEGAL ADVICE.**
> This notice must be cleared by the appointed **Data Protection Officer**
> (or equivalent) and reviewed by licensed counsel before publication. It
> references GDPR concepts as a starting baseline; cross-check national
> implementations and any sector-specific privacy rules (e.g. UK GDPR,
> EU AML directive Article 32, US state-level privacy frameworks).

## 1. Who we are

The data controller for the personal data described below is `<NEXTBLOCK ENTITY LEGAL NAME>`, a `<LEGAL FORM>` incorporated in `<JURISDICTION>`, with registered office at `<ADDRESS>` and registration number `<COMPANY NUMBER>`. The Data Protection Officer can be reached at `<DPO EMAIL>`.

## 2. Personal data we process

This notice covers personal data collected through the NextBlock platform — primarily during onboarding (KYB), recurring compliance screening, and ongoing operations.

### 2.1 Onboarding (`kyb_applications`)
- Company name, legal entity type, jurisdiction, regulatory license number
- Contact name and email
- Website and free-text description
- Wallet address on Base
- Applicant type (`cedant` | `curator`)

### 2.2 Cedant-specific (`cedant_profiles`)
- Underwriting profile: policy types, geographic scope, annual premium band, expected ceded capacity
- Provisioned vault address (post-approval)
- Notes attached by the Cedant to the Curator

### 2.3 Review audit trail (`kyb_review_events`)
- Reviewer wallet, email and method (wallet or email session)
- Status transitions and reviewer notes
- Append-only by design — entries are not modified or deleted post-creation

### 2.4 Sanctions screening (`sanctions_screening_runs`, `sanctions_matches`)
- Subject name, country, screening provider, result code
- Match details (name matched, sanctions list, severity, match score, provider evidence)
- Sentinel decision (false positive / true match) with timestamp and the wallet that decided

### 2.5 Claim evidence (`claim_evidence`)
- Uploaded evidence file metadata (file name, content type, size, content hash)
- Uploader wallet address
- The evidence file itself is stored in the private `claim-evidence` Storage bucket; only short-lived signed URLs are issued, exclusively to authorised reviewers and the claimant of the claim.

### 2.6 Notifications and preferences (`notifications`, `notification_prefs`)
- Per-recipient delivered events about claim status changes and evidence uploads
- Per-wallet preferences (in-app on by default, email off by default)

### 2.7 Audit trail (`claim_audit_trail`)
- Normalised mirror of public on-chain logs related to claim lifecycle
- Wallet addresses involved in each event (claimant, Sentinel, Committee, Owner) — these are already public on-chain

## 3. Legal bases (GDPR Article 6, indicative)

- **Performance of a contract** (Article 6(1)(b)) — onboarding, vault operations, claim handling, premium and payout processing
- **Compliance with a legal obligation** (Article 6(1)(c)) — KYB, AML, sanctions, regulatory reporting
- **Legitimate interests** (Article 6(1)(f)) — audit trail, fraud prevention, security, network defence
- **Consent** (Article 6(1)(a)) — optional channels (email notifications), opt-in marketing if any

**`<COUNSEL/DPO: confirm the right basis per processing purpose and document the legitimate-interest assessment where applicable>`.**

## 4. Recipients of personal data

- **NextBlock personnel** with a need-to-know (Curator, Sentinel, Committee, KYC Operator, engineering for incident response)
- **Sanctions screening provider** (`<PROVIDER>`) — name + country + date of birth (if collected) sent for each screening
- **AI assessment provider** (`<PROVIDER>`) — claim metadata; **no personal data of claimants beyond what is already published on-chain**
- **Supabase** as data processor (database + private file storage)
- **Vercel** as data processor (Next.js hosting; log retention per Vercel policy)
- **Regulators, courts and law enforcement** where required by lawful order

Data processing agreements are in place with each processor. **`<DPO: list and link the DPAs in this section>`.**

## 5. International transfers

Where personal data is transferred outside the EEA (e.g. to a sanctions provider hosted in `<COUNTRY>`), transfers rely on `<TRANSFER MECHANISM — SCCs, adequacy decision, etc.>`. Copies of the safeguards are available on request at `<DPO EMAIL>`.

## 6. Retention

- KYB records and screening audit: retained for **`<RETENTION PERIOD>`** to meet AML record-keeping obligations
- Claim audit trail: retained indefinitely on-chain (public ledger); the off-chain mirror follows the same retention as the chain
- Notifications: **`<RETENTION PERIOD>`**
- Onboarding diagnostic logs: **`<RETENTION PERIOD>`**

**`<DPO: align retention to the longest of: AML, contractual, defence-of-claims, regulator-specific.>`**

## 7. Your rights (GDPR / equivalent)

Subject to the conditions and exceptions of applicable law, you have the right to:
- access your personal data
- rectify inaccurate data
- erasure ("right to be forgotten") — limited where on-chain or AML retention applies
- restrict processing
- data portability
- object to processing based on legitimate interests
- withdraw any consent given

Requests should be sent to `<DPO EMAIL>`. You also have the right to lodge a complaint with your supervisory authority (`<INDICATIVE AUTHORITY>`).

## 8. Automated decision-making

NextBlock's automated processing relevant to you is **limited and assistive**:
- the sanctions screening provider returns matches, but **the final access decision is taken by the Sentinel** (human review);
- the AI claim assessor produces an advisory score, but **the final approval decision is taken by the Claims Committee** (human review).

There is no fully-automated decision under Article 22 GDPR that produces legal effects without a human-in-the-loop. **`<DPO: confirm — including for parametric claim triggers, which may need a tailored statement>`.**

## 9. Security

NextBlock applies technical and organisational measures appropriate to the risk, including: row-level-security on all PII tables (deny-by-default), service-role separation between routes, short-lived signed URLs for evidence access, encrypted transport, and append-only audit logs for sensitive operations.

## 10. Changes to this notice

This notice may be updated. Material changes will be notified at least `<NOTICE PERIOD>` in advance via the platform and, where the change affects the legal basis or recipients, by direct contact. The version field in the YAML frontmatter is incremented on every substantive change.
