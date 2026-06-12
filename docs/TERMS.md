# NextBlock Terms of Service (Staging)

Last updated: 2026-06-13

These Terms govern access to the NextBlock staging application at
nextblock.finance and the associated smart contracts deployed on Base
Sepolia (chain id 84532). By connecting a wallet or submitting a KYB
application you accept these Terms.

## 1. What NextBlock is

NextBlock is an institutional protocol for tokenizing reinsurance
portfolios: whitelisted cedants transfer premium flows into ERC-4626-style
USDC vaults whose restricted shares (nbUSDC) are held by whitelisted
institutional liquidity providers. The current deployment is a STAGING
environment for evaluation only.

## 2. Staging scope - no real value

- All contracts run exclusively on the Base Sepolia test network. There is
  no mainnet deployment and no token sale.
- The settlement asset is a test USDC mock with no monetary value. Nothing
  in the staging environment constitutes real funds, and no real value can
  be deposited or lost through the staging contracts.
- The protocol has not undergone an external security audit
  (see `audits/README.md`). Do not send real assets of any kind to the
  staging addresses.

## 3. Eligibility and KYB

- Institutional features (cedant onboarding, curator access) require a KYB
  application reviewed by the operator. Approval in the KYB pipeline is
  instructional only; on-chain whitelisting is a separate act.
- You must not submit a KYB application containing another person's data or
  fraudulent company information.
- Jurisdictions subject to sanctions or where participation would be
  unlawful are not eligible.

## 4. No advice, no offer

Nothing in the application, documentation or protocol output (including
AI-assisted assessments, NAV figures and risk scores) is financial, legal,
tax or investment advice, or an offer to sell securities or insurance in
any jurisdiction. Insurance-linked figures shown in staging are simulated
or illustrative.

## 5. Risks

Smart contract risk, oracle risk, liquidity risk and underwriting risk are
inherent to the protocol design. On-chain transactions are irreversible.
A dedicated risk summary is shown inside the application; reading it does
not reduce the risks.

## 6. Acceptable use

You agree not to: attack, overload or attempt to bypass the application,
its rate limits or its access controls; misuse operator endpoints; attempt
to extract other users' data; or interact with the contracts in a way
designed to corrupt accounting state.

## 7. Availability and changes

The staging environment may be modified, paused, redeployed or wiped at any
time without notice, including the database of KYB applications. These
Terms may change as the protocol approaches production; material changes
will be reflected in this document with a new date.

## 8. Liability

The staging application is provided "as is", without warranties of any
kind. To the maximum extent permitted by law, the NextBlock team is not
liable for any loss arising from the use of the staging environment.

## 9. Contact

Questions about these Terms: see the security and operations contacts in
`SECURITY.md` and `docs/OPERATIONS.md` of the public repository
(github.com/antoncarlo/nextblock).
