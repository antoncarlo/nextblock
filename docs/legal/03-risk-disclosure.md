---
title: Risk Disclosure (DRAFT)
version: 0.1.0-draft
status: DRAFT — not legal advice — do not execute
counsel_review_required: true
last_technical_review: 2026-06-19
---

# Risk Disclosure

> ⚠️ **DRAFT TEMPLATE — NOT LEGAL ADVICE.**
> Every risk factor below must be reviewed by licensed counsel against the
> products actually offered to the relevant counterparty, the applicable
> disclosure regime (PRIIPs / MiFID II inducements / IDD / Solvency II
> Pillar III / equivalent), and the jurisdiction.

## 0. Acknowledgement

Before completing onboarding, both Institutional LPs and Cedants must
acknowledge that they have read, understood and accepted the risks below.
The acknowledgement is recorded as part of the on-chain signing flow
(`onboarding-ack:<hash>` action).

## 1. Smart contract and protocol risk

1.1 **Code risk.** The NextBlock protocol is implemented in Solidity smart contracts deployed on Base. Despite testing and review, software defects, undiscovered vulnerabilities or compiler bugs may cause **partial or total loss of deposited funds**.

1.2 **Upgrade risk.** Contracts that are upgradable (now or in the future) carry the additional risk that an unauthorised, malicious or erroneous upgrade alters the protocol's behaviour after deposits have been made. NextBlock describes the upgrade authority and timelock in `<UPGRADE GOVERNANCE DOC>`.

1.3 **Composability risk.** Vault shares may be deposited as collateral or otherwise composed in third-party protocols (e.g. NextBlock's permissioned lending market). Failures in those external venues may cascade onto the value of vault shares, even where NextBlock itself is functioning correctly.

## 2. Compliance and access risk

2.1 **Whitelist enforcement.** Vault shares are non-transferable to addresses that are not whitelisted in `ComplianceRegistry`. **You may not be able to transfer your position to a counterparty of your choice** if that counterparty is not (yet) whitelisted.

2.2 **Freeze and seize.** Under the protocol's compliance toolkit, your address may be blocked, your transfers reverted, and — where the relevant token standard supports it (e.g. B20) — your tokens may be subject to a freeze-and-seize remedy in response to lawful authority instructions or to sanctions / fraud / hack scenarios.

2.3 **De-whitelisting and KYC expiry.** Whitelist status has a KYC expiry. If you fail to refresh KYC, transfers from your address may be blocked even though no sanctions concern has arisen. Plan operational continuity accordingly.

## 3. Oracle, AI assessor and bordereau risk

3.1 **Oracle dependency.** NAV, parametric trigger conditions and bordereau data are sourced off-chain and posted on-chain by oracle roles. Stale, manipulated or incorrect oracle inputs may cause **incorrect NAV, premature or wrongful claim payouts, or wrongful claim rejections**.

3.2 **AI assessor advisory.** The advisory AI assessment is **not** a determination of liability. The Claims Committee may approve or reject independently of the assessor's recommendation. Reliance on the assessor's output as if it were a binding determination is misplaced.

3.3 **Dispute window.** A claim may be paid out promptly after expiry of the dispute window. If the Sentinel role fails to challenge a fraudulent or erroneous claim within the window, the payout is final on-chain.

## 4. Liquidity and redemption risk

4.1 **Asynchronous redemption.** NextBlock Vaults are **not** atomic mint/redeem systems. Withdrawal requests above the available liquidity buffer (default 20%) may be delayed, queued or refused until liquidity returns via premium inflows or matured allocations.

4.2 **Loss on stress.** During stress events (multiple concurrent large claims, oracle failure, sanctions-driven freeze of a large LP), redemptions may be effectively unavailable for an extended period.

## 5. Underwriting risk (LP-specific)

5.1 **Claim payouts reduce NAV.** Approved claim payouts settle in `USDC` from the Vault to the Cedant or claimant. NAV decreases accordingly. **LPs may lose part or all of their principal** if claim payouts exceed accumulated premium.

5.2 **Cedant default.** If the Cedant misrepresents its underwriting profile, fails to honour its bordereau obligations or otherwise breaches Cedant terms, recovery may be limited to indemnity claims under contract — there is no guarantee fund and no NextBlock balance sheet backing.

## 6. Counterparty and regulatory risk

6.1 **NextBlock is a software provider**, not a regulated insurer or investment firm. The legal characterisation of vault shares (security token / collective investment scheme interest / receipt for ceded participation / other) is a function of the LP's jurisdiction and the cedant's structure — **counsel review is required**.

6.2 **Regulatory change.** Insurance, AML, securities and crypto-asset regulation evolves rapidly (MiCA, DLT Pilot Regime, Solvency II review, US state-level RWA rules, etc.). NextBlock may be required to alter access, freeze flows or wind down certain Vaults to comply with new rules.

## 7. Custody, bridge and chain-level risk

7.1 **USDC issuer risk.** USDC on Base is issued by `<USDC ISSUER>` (Circle). Issuer insolvency, regulatory action against the issuer, or de-pegging of USDC would directly affect Vault accounting.

7.2 **Chain risk.** Base is an L2 with sequencer and bridge dependencies. Sequencer outage, bridge failure or a hostile data-availability event may delay or impair on-chain operations.

7.3 **Self-custody risk.** Loss of the private key controlling your whitelisted wallet means loss of your position. NextBlock cannot recover lost keys.

## 8. Operational and people risk

8.1 **Role concentration in pilot.** During the pilot, several protocol roles (Curator, Sentinel, Committee, Oracle, KYC Operator) may be held by a small group, including NextBlock-affiliated wallets. This concentration is a transitional design choice and is intended to be diluted to multisig / external nominees on a roadmap to be published separately.

8.2 **Service provider dependency.** NextBlock relies on third-party providers for sanctions screening (`<PROVIDER>`), AI assessment (`<PROVIDER>`), Supabase backend, and Vercel hosting. Provider outage, breach or termination may cause service degradation.

## 9. No guarantee, no advice

9.1 NextBlock does not guarantee any rate of return, the recovery of principal, the availability of redemption, or the continued operation of any specific Vault.

9.2 Nothing on the platform constitutes investment, tax, legal, accounting or insurance advice. **The LP and the Cedant act for their own account, on their own responsibility, and after independent professional advice.**

---

By proceeding with onboarding, the counterparty acknowledges that the above risks are not an exhaustive list and that material risks may emerge that are not anticipated here.
