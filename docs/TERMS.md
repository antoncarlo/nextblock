# NextBlock Terms of Service

Last updated: 2026-06-13
Live version: https://www.nextblock.finance/terms
Status: applies to the Base Sepolia STAGING deployment. This document is
maintained in the public repository and is subject to review by qualified
counsel before any mainnet release; material changes take effect when
published here with a new date.

These Terms govern access to the NextBlock application at
nextblock.finance and the associated smart contracts deployed on Base
Sepolia (chain id 84532). By connecting a wallet, submitting a KYB
application or otherwise using the platform you accept these Terms.

## 1. What NextBlock is

NextBlock is an institutional protocol for tokenizing reinsurance
portfolios: an insurance tokenization yield layer in which whitelisted
cedants transfer premium flows into ERC-4626-style USDC vaults whose
restricted shares (nbUSDC) are held by whitelisted institutional liquidity
providers. The vault share is a NAV-bearing token; not a stablecoin; not legal
tender; not redeemable at a fixed 1:1 value; subject to eligibility, vault terms,
NAV, fees, claims, liquidity and risk of loss (production symbol `nbRV`).
Underwriting decisions, capital allocation, claim handling and
emergency response are separated into distinct on-chain roles bounded by a
timelock. NextBlock is a technology platform; it is not itself an insurer,
reinsurer, broker, investment adviser or custodian.

## 2. Staging scope - no mainnet, no real value

- All contracts run exclusively on the Base Sepolia test network. There is
  no mainnet deployment and no token sale.
- The settlement asset is a test USDC mock with no monetary value. Nothing
  in the staging environment constitutes real funds, deposits, premiums or
  payouts, and no real value can be put at risk through the staging
  contracts.
- The protocol has not undergone an external security audit
  (`audits/README.md`). Do not send real assets of any kind to the staging
  addresses; anything sent to them is unrecoverable by design of the test
  network.
- The staging environment, including its database of KYB applications, may
  be modified, paused, redeployed or wiped at any time without notice.

## 3. Eligibility - institutional only

- The platform is intended exclusively for institutional entities:
  reinsurers and ceding entities (cedants), professional underwriting
  organizations and institutional liquidity providers. It is not offered
  to, designed for, or appropriate for retail consumers, and no consumer
  insurance product is offered through it.
- You represent that you act for an entity (not as a private individual),
  that you are duly authorized to bind that entity, and that neither the
  entity nor its beneficial owners are subject to sanctions or located in a
  jurisdiction where use of the platform would be unlawful.

## 4. KYB requirement

- Completion of the Know Your Business (KYB) process is required before
  any vault interaction beyond read-only viewing. Until an application is
  approved AND the corresponding wallet is whitelisted on-chain in the
  ComplianceRegistry (a separate, explicitly authorized act of the KYC
  Operator), deposits, share transfers and institutional flows are blocked
  at the contract level.
- KYB approval in the application database is instructional only and
  creates no entitlement to on-chain whitelisting.
- You must not submit a KYB application containing another person's data,
  fraudulent company information or misleading licensing claims.
  Applications are reviewed manually and may be rejected without reason.

## 5. Risk acknowledgment

By using the platform you acknowledge and accept, without limitation:

- Smart contract risk: contracts may contain defects; the protocol is
  unaudited at this stage; on-chain transactions are irreversible.
- Oracle and AI risk: NAV figures, risk scores and claim assessments are
  advisory inputs produced by oracles and AI systems behind adapters; they
  may be stale, wrong or unavailable, and never carry unilateral business
  authority.
- Governance risk: protocol parameters can change through the timelock
  process; during the staging phase the deployer key retains elevated
  permissions until the governance handover completes (see
  `docs/GOVERNANCE_PHASE2.md` and the in-app warning).
- Liquidity risk: capital allocated to active underwriting is not
  instantly redeemable beyond the configured buffer; redemptions above the
  buffer are restricted by design.
- Regulatory risk: the legal treatment of tokenized reinsurance
  instruments is evolving and may affect availability of the platform.

A risk summary is also displayed inside the application. Reading any
disclosure does not reduce the underlying risks.

## 6. No advice, no offer

Nothing in the application, documentation or protocol output is financial,
legal, tax, actuarial or investment advice, and nothing constitutes an
offer to sell, or a solicitation to buy, securities, insurance or
reinsurance in any jurisdiction. Insurance-linked figures shown in staging
are simulated or illustrative.

## 7. Acceptable use

You agree not to: attack, overload or attempt to bypass the application,
its rate limits, its authentication or its access controls; misuse
operator endpoints; attempt to extract other applicants' data; interfere
with oracle feeds or governance operations; or interact with the contracts
in a manner designed to corrupt accounting state or solvency invariants.

## 8. Intellectual property and open source

The protocol code is published in the public repository under its stated
license terms. Names, logos and brand assets of NextBlock and its partners
remain the property of their respective owners.

## 9. Limitation of liability

The platform is provided "as is" and "as available", without warranties of
any kind, express or implied, including merchantability, fitness for a
particular purpose and non-infringement. To the maximum extent permitted
by applicable law: (a) the NextBlock team, its contributors and its
partner entities shall not be liable for any indirect, incidental,
special, consequential or exemplary damages, or for any loss of profits,
data, goodwill or other intangible losses, arising from or related to the
use of, or inability to use, the platform; and (b) in respect of the
staging deployment, where no real value can be placed at risk, aggregate
liability for any claim shall not exceed zero, reflecting that the staging
environment holds no real funds. Nothing in these Terms excludes liability
that cannot be excluded under applicable law.

## 10. Indemnity

You agree to indemnify and hold harmless the NextBlock team and its
partner entities from claims arising out of your breach of these Terms,
your violation of applicable law, or data you submit through the KYB
process.

## 11. Governing law and disputes

These Terms are governed by the laws of the Federation of Saint Kitts and
Nevis, without regard to conflict-of-law rules. Any dispute arising out of
or in connection with these Terms shall be subject to the exclusive
jurisdiction of the courts of Saint Kitts and Nevis, unless mandatory law
of your jurisdiction provides otherwise.

## 12. Changes and contact

These Terms may change as the protocol approaches production; material
changes will be reflected in this document with a new date. Questions:
see the security and operations contacts in `SECURITY.md` and
`docs/OPERATIONS.md` of the public repository
(github.com/antoncarlo/nextblock).
