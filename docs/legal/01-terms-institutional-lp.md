---
title: Terms & Conditions — Institutional LP (DRAFT)
version: 0.1.0-draft
status: DRAFT — not legal advice — do not execute
counsel_review_required: true
last_technical_review: 2026-06-19
---

# Terms & Conditions — Institutional Liquidity Provider

> ⚠️ **DRAFT TEMPLATE — NOT LEGAL ADVICE.**
> Every clause is a placeholder pending review by licensed counsel in
> `<JURISDICTION>`. Do not execute, share with counterparties, or publish.
> Read `README.md` in this directory before editing.

## 0. Parties

These Terms ("**Agreement**") are entered into between:

- **`<NEXTBLOCK ENTITY LEGAL NAME>`**, a `<LEGAL FORM>` incorporated under the laws of `<JURISDICTION>`, with registered office at `<REGISTERED ADDRESS>` and registration number `<COMPANY NUMBER>` ("**NextBlock**"); and
- The Institutional Liquidity Provider identified at onboarding ("**LP**", "**you**" or "**your**").

## 1. Eligibility and onboarding

1.1 The Service is available **exclusively to professional / institutional investors**. The LP represents and warrants that it qualifies as a **`<professional client / qualified investor / accredited investor — counsel to confirm per jurisdiction>`** and that subscription to the Service is undertaken in the course of its professional activity.

1.2 The LP shall complete the on-platform Know-Your-Business ("**KYB**") onboarding (`/app/apply`), provide truthful and current information, and authorize NextBlock to perform sanctions / PEP / adverse-media screening via the configured screening provider.

1.3 NextBlock may refuse, suspend or terminate the LP's access at any time if (a) screening returns an unresolved match; (b) the LP fails to provide requested information; (c) NextBlock determines, in its reasonable discretion, that continued service would violate applicable law or NextBlock's compliance policies.

1.4 Whitelist status is recorded **on-chain** in `ComplianceRegistry` and is a technical prerequisite to receiving NextBlock vault shares. Off-chain KYB approval and on-chain whitelist are two distinct authorized acts; KYB approval alone does not grant access to the protocol.

## 2. The Service

2.1 **Description.** NextBlock operates a software protocol on the **Base** blockchain that allows whitelisted Cedants to tokenize reinsurance portfolios into isolated vaults (the "**Vaults**"). The LP may deposit `USDC` on Base into a Vault of its choice and receive in exchange Vault shares (the "**Shares**") representing its proportional claim on the Vault's net asset value ("**NAV**").

2.2 **No insurance license.** NextBlock is a **technology provider**. It does not underwrite insurance risk, does not custody investor funds outside the on-chain Vault contracts, and does not act as a regulated financial intermediary. **The LP is not purchasing an insurance policy from NextBlock.** The LP is providing liquidity to a smart-contract Vault that backs reinsurance obligations of a separate, licensed Cedant. `<COUNSEL TO CONFIRM POSITIONING IN JURISDICTION>`.

2.3 **No advice.** Nothing on the NextBlock platform or in this Agreement constitutes investment, tax, legal or accounting advice.

## 3. Compliance and transfer restrictions

3.1 **Restricted shares.** The Shares are **permissioned** and may be transferred only to addresses whitelisted on `ComplianceRegistry`. Transfers to non-whitelisted addresses will revert on-chain. The LP acknowledges that this restriction is enforced **by smart contract**, not by NextBlock's discretion.

3.2 **Freeze and seize.** NextBlock, acting through the Sentinel role under instruction from the relevant authority or under its own AML / sanctions policy, may (i) block transfers from / to a specific address via `ComplianceRegistry.setBlocked`, and (ii) where applicable under the B20 standard or its evolution, exercise the freeze-and-seize remedy. **`<COUNSEL: confirm the legal basis and notice obligations>`.**

3.3 **Re-screening.** NextBlock screens whitelisted entities against sanctions / PEP / adverse-media lists on a **recurring basis** (currently monthly). A new match may result in the address being blocked pending Sentinel review.

## 4. Deposits, redemptions, and the liquidity buffer

4.1 **Deposits.** Deposits are denominated in `USDC` on Base and accepted only from whitelisted addresses. Shares are minted according to ERC-4626 semantics, factoring in the Vault's current NAV.

4.2 **Asynchronous redemption.** The LP **acknowledges and accepts** that NextBlock's Vaults are **not** atomic mint/redeem systems. The Vault maintains a configurable liquidity buffer (default 20%). Withdrawal requests up to the available buffer settle on-chain on the same transaction; requests above the buffer may enter a redemption queue, be subject to delayed settlement, or be refused until liquidity is restored through premium inflows or matured underwriting allocations.

4.3 **No principal guarantee.** Vault NAV may decrease as a result of approved claim payouts. **The LP may lose part or all of its principal**. See `03-risk-disclosure.md`.

## 5. Fees

5.1 Fees are documented at onboarding and may include: management fee accruing on Vault assets, performance fee on premium yield net of claims, and protocol fee on premium inflows. **Effective rates are disclosed per Vault at deposit time.**

5.2 NextBlock may revise fee parameters going forward with `<NOTICE PERIOD>` written notice; revisions never apply retroactively to already-recognised earned premium.

## 6. Acknowledgements and risk

The LP acknowledges and accepts the risks set out in `03-risk-disclosure.md` (smart contract, oracle, sanctions, regulatory, liquidity, claim, custody / bridge, dependency on third-party providers including the AI assessor and bordereau oracle).

## 7. Data and privacy

7.1 The processing of personal data submitted at KYB is governed by `04-privacy-notice.md`. The LP confirms that it has authority to provide the personal data of any beneficial owner or authorized representative included in its KYB submission.

## 8. Intellectual property

The NextBlock platform, its source code, documentation, and branding are owned by NextBlock or its licensors. Nothing in this Agreement transfers IP to the LP.

## 9. Limitation of liability

9.1 To the maximum extent permitted by applicable law, NextBlock shall not be liable for indirect, special, incidental or consequential damages, including loss of profits, loss of business opportunity or loss of data.

9.2 NextBlock's aggregate liability under this Agreement is **capped at `<CAP — counsel to set>`** per twelve-month period. **`<COUNSEL: review cap against minimum-liability rules for professional services in jurisdiction>`.**

## 10. Force majeure

NextBlock shall not be liable for any failure or delay caused by events beyond its reasonable control, including chain reorganisation, RPC outage, oracle failure, network-level malicious attack, or regulatory action.

## 11. Governing law and dispute resolution

11.1 This Agreement is governed by the laws of `<GOVERNING LAW>`.

11.2 Any dispute shall be submitted to **`<ARBITRATION SEAT / FORUM>`**, with `<NUMBER>` arbitrator(s), proceedings in `<LANGUAGE>`. `<COUNSEL: confirm enforceability and add carve-outs for injunctive relief / regulatory referrals>`.

## 12. Entire agreement, severability, assignment

12.1 This Agreement is the entire agreement between the parties on its subject matter.

12.2 If any clause is held unenforceable, the remainder remains in effect.

12.3 The LP may not assign this Agreement without NextBlock's prior written consent.

## 13. Notices

Notices to NextBlock: `<NOTICE EMAIL>`, copied to `<NOTICE POSTAL ADDRESS>`. Notices to the LP: the email recorded at KYB onboarding.

---

**Signed acknowledgement.** By completing onboarding and clicking "I accept", the LP confirms it has read, understood and agreed to be bound by this Agreement and the documents incorporated by reference.

`Place: <PLACE>` · `Date: <DATE>` · `Signature: <WALLET SIGNATURE OF TERMS HASH>`
