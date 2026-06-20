# NextBlock — Legal templates (DRAFT)

> ⚠️ **READ THIS FIRST — NOT LEGAL ADVICE**
>
> The documents in this directory are **DRAFT TEMPLATES**. They were assembled
> as a starting scaffold for licensed counsel review and **must not be
> executed, distributed, signed, published on the public-facing site, or
> shown to a counterparty as-is**. Every clause is a placeholder until a
> qualified lawyer in the relevant jurisdiction has:
>
> - reviewed and rewritten the text to match the actual NextBlock entity,
>   jurisdiction of incorporation, regulatory perimeter (MiCA / DLT Pilot
>   Regime / MiFID II / Solvency II / AMLD6 / GDPR / equivalent) and the
>   counterparty profile (institutional LP vs cedant);
> - cross-checked the references to on-chain mechanics against the actual
>   deployed contracts on Base (addresses tracked in
>   `app/src/config/generated/addressBook.ts`);
> - cleared the privacy notice with the appointed Data Protection Officer
>   (or equivalent) under GDPR / national implementation;
> - confirmed the risk taxonomy in `03-risk-disclosure.md` against the
>   actual products and the Solvency II Pillar III narrative reporting
>   requirements (when applicable to a counterparty).
>
> NextBlock is the **technology / protocol provider**. The drafts position
> NextBlock accordingly — it does not underwrite insurance risk, does not
> custody investor funds outside the on-chain vault contracts, and does not
> issue insurance contracts. **Whether this positioning holds in a specific
> jurisdiction is a legal-counsel determination, not a technical one.**

## Index

| File | Purpose |
|------|---------|
| [`01-terms-institutional-lp.md`](./01-terms-institutional-lp.md) | Terms & Conditions template for an Institutional LP depositing USDC into a NextBlock vault. |
| [`02-terms-cedant.md`](./02-terms-cedant.md) | Terms & Conditions template for a Cedant (reinsurer / insurer) ceding portfolios into a dedicated NextBlock vault. |
| [`03-risk-disclosure.md`](./03-risk-disclosure.md) | Standalone risk disclosure to be acknowledged by both LPs and Cedants before onboarding completes. |
| [`04-privacy-notice.md`](./04-privacy-notice.md) | GDPR-style privacy notice covering KYB data (`kyb_applications`, `cedant_profiles`, sanctions screening, KYC operator workflow). |

## How to use these templates

1. **Do not modify the placeholders in `<ALL-CAPS-ANGLE-BRACKETS>`** until a lawyer confirms the right value (entity, jurisdiction, governing law).
2. Hand the entire directory to outside counsel as a **starting working document** — not as the final contract.
3. Maintain version-controlled diffs of every legal change in this repo; the audit trail is part of the regulatory record (mirrors `claim_audit_trail` on the technical side).
4. Once finalized, the executed PDFs / signed copies should NOT be committed here — that's a counsel-managed document store. This directory only holds drafts and structural revisions.

## Technical references the legal text relies on

- **On-chain compliance**: `ComplianceRegistry.canReceive` / `setWhitelist` / `setBlocked` ([source](../../contracts/src/ComplianceRegistry.sol))
- **Vault accounting**: `InsuranceVault` ERC-4626 with 20% liquidity buffer, premium accrual via `depositPremium`, claim payout via `executeClaim` ([source](../../contracts/src/InsuranceVault.sol))
- **Claim lifecycle**: ClaimManager states (SUBMITTED → ASSESSED → DISPUTED → APPROVED → PAID/REJECTED) ([source](../../contracts/src/ClaimManager.sol))
- **KYB pipeline**: `kyb_applications` + `kyb_review_events` + sanctions screening (migrations `0001`, `0007`)
- **Audit trail**: immutable mirror of every claim-lifecycle on-chain log (`claim_audit_trail`, migration `0006`)

## Versioning

Each template carries a `Version` field in the YAML frontmatter. **Increment it on every substantive change** so counsel and counterparties can reference an exact draft snapshot.
