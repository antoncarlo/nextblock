# NextBlock Legal Structure and Disclosures

Last updated: 2026-06-13
Status: describes the intended operating structure during the Base Sepolia
staging phase. Subject to review by qualified counsel before any mainnet
release; entity details below reflect information provided by the protocol
owner and must be re-verified against executed agreements before
production.

## 1. Platform structure

| Layer | Entity | Role |
|---|---|---|
| Protocol layer | NextBlock | Develops and operates the tokenization protocol: smart contracts on Base (vault factory, insurance vaults, registries, oracles, governance), the institutional application and the KYB pipeline. NextBlock is a technology platform and is not itself an insurer or reinsurer |
| Reinsurance entity | Klapton Re (Federation of Saint Kitts and Nevis; International Business Company with a Special Purpose Vehicle structure) | Licensed reinsurance counterparty under a reinsurance agreement with the protocol's ecosystem: the SPV structure is intended to segregate ceded portfolios backing tokenized exposure from the IBC's other business |
| Technology provider | Braino | Provides AI-assisted assessment technology (portfolio assessment, claim assessment, NAV inputs) consumed by the protocol strictly through adapter contracts with no unilateral business authority |

## 2. Relationship between entities

- NextBlock operates the protocol and the application. It does not
  underwrite risk, hold customer funds in custody, or issue insurance.
- Klapton Re is the reinsurance entity whose ceded portfolios are intended
  to back tokenized exposure represented on the protocol. The commercial
  relationship is governed by a reinsurance agreement executed off-chain;
  the protocol records references (portfolio registrations, premium flows,
  claims) but the agreement itself is not a smart contract.
- Braino supplies assessment and NAV technology. Its outputs enter the
  protocol only through adapter contracts (AIAssessor, NavOracle,
  BordereauOracle) and are advisory: claim approval belongs to the Claims
  Committee path, payouts to the vault accounting rules, and risk
  reduction to the Sentinel - never to the AI itself.
- No entity in this structure has unilateral control of protocol funds:
  risk-increasing actions flow through the on-chain timelock, and
  emergency powers are limited to risk-reducing actions
  (`docs/SECURITY_MODEL.md`).

## 3. Risk disclosure for vault depositors

Prospective institutional depositors must understand, at minimum:

- Smart contract risk. Vault, registry, oracle and governance contracts
  may contain defects. The protocol has not yet completed an external
  security audit (`audits/README.md`). On-chain transactions are
  irreversible.
- Share nature. The vault share is a NAV-bearing reinsurance vault token; not a
  stablecoin; not legal tender; not redeemable at a fixed 1:1 value; subject to
  eligibility, vault terms, NAV, fees, claims, liquidity and risk of loss. Its
  production symbol is `nbRV`; any `USDC`-like symbol must not be read as a 1:1
  redeemable stable asset.
- Liquidity risk. nbUSDC shares are restricted and redemptions are bounded
  by a liquidity buffer; capital allocated to active underwriting is not
  instantly redeemable. Above-buffer withdrawals are restricted by design,
  and unwinding underwriting exposure takes time.
- Governance risk. Parameters (caps, fees, dispute windows, adapter
  activation) can change through the timelock process. During staging the
  deployer key retains elevated permissions until the governance handover
  completes; this is disclosed in-app and in `docs/OPERATIONS.md`.
- Oracle risk. NAV and assessment inputs may be stale, deviating or
  unavailable. The protocol enforces staleness checks and Sentinel
  response paths, but oracle failure can still delay or distort
  valuations and redemptions.
- Regulatory risk. Tokenized reinsurance exposure is a developing area of
  law across jurisdictions. Regulatory developments may restrict or
  terminate availability of the platform, affect the transferability of
  restricted shares, or impose additional obligations on participants.
- Counterparty and underwriting risk. Returns depend on the performance of
  ceded reinsurance portfolios; claims experience worse than expected
  reduces vault assets according to the protocol's accounting rules.

## 4. KYC / AML policy summary

- Every institutional participant must complete the KYB flow before any
  vault interaction. Applications (company identity, licensing,
  jurisdiction, contacts) are collected by the application and stored with
  Supabase as processor under deny-by-default row-level security
  (`docs/PRIVACY.md`).
- Review is performed by the KYC Operator role through authenticated
  server endpoints (wallet signature plus on-chain role verification, with
  single-use nonces). Every decision is recorded in an append-only audit
  trail.
- Database approval is instructional only. On-chain access is granted
  exclusively by a separate, explicitly authorized act of the KYC Operator
  writing the whitelist in the ComplianceRegistry contract; vault
  mint/transfer paths enforce that registry on-chain, so the compliance
  gate cannot be bypassed from the frontend.
- Jurisdiction flags, KYC expiry and block flags are enforced on-chain by
  the ComplianceRegistry; the Sentinel can block an address immediately if
  required (risk-reducing action, not timelocked).
- Sanctions screening and enhanced due diligence procedures appropriate to
  a production launch remain to be formalized with compliance counsel and
  are tracked as a pre-production requirement.

## 5. Status disclaimers

The current deployment is staging-only on Base Sepolia: no real value can
be deposited and no insurance or reinsurance is actually placed, ceded or
settled through the staging system. This document does not constitute
legal advice and creates no contractual rights; the binding documents are
the Terms of Service (`docs/TERMS.md`), the Privacy Policy
(`docs/PRIVACY.md`) and, for reinsurance arrangements, the executed
off-chain agreements between the relevant entities.
