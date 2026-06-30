# NextBlock Pilot — Base Sepolia Testnet

Operational index for the NextBlock testnet pilot. NextBlock is an institutional
reinsurance tokenization protocol; this pilot validates the onboarding, review,
role and claim flows on the **Base Sepolia testnet (chain id 84532)**.

> Testnet only. No real funds. Test tokens have no monetary value. See the
> [testnet disclaimer](./testnet-disclaimer.md).

## Purpose

Let external participants and operators exercise the end-to-end pilot flow:
connect a wallet, fund it with testnet assets, complete KYB, receive an on-chain
role, and use the role-specific screens. The goal is technical validation, not a
production launch and not a financial offering.

## Who can participate

Invited pilot participants who can use a self-custodial Web3 wallet on Base
Sepolia. No real money is involved at any point.

## Roles involved

| Role | Who | Primary screen |
|---|---|---|
| Cedant | Insurance company / ceding entity submitting portfolios | `/app/my-company` |
| Investor (Institutional LP) | Party depositing test USDC for `nbUSDC` shares | vault pages (deposit) |
| Operator / Admin | Protocol operator handling KYB review and role grants | `/app/admin` |

Curators, committee members and sentinels are operator-side roles granted on
request; their day-to-day screens are `/app/syndicates/dashboard` and `/app/admin`.

## Start here: the Pilot Onboarding Hub

Every participant should open **`/app/pilot`** first. The hub shows wallet,
network (Base Sepolia 84532), testnet ETH (gas), test USDC, KYB status and
on-chain role, and tells you the single next action for your situation.

## Documents

| Document | For |
|---|---|
| [Cedant guide](./cedant-guide.md) | Insurance companies / cedants |
| [Investor guide](./investor-guide.md) | Institutional LP / investors |
| [Operator runbook](./operator-runbook.md) | Protocol operator / admin |
| [Testnet disclaimer](./testnet-disclaimer.md) | Everyone — read before participating |
| [Manual test checklist](./manual-test-checklist.md) | QA / operator verification |

## What is NOT production

- This is **Base Sepolia testnet**, not Base mainnet.
- Tokens (including MockUSDC / test USDC) are **valueless test assets**.
- Governance Stage A (key separation / deployer hand-off) has **not** been
  executed; the operator wallet still holds protocol roles for the pilot.
- Allocation and premium economic flows (UPR/NAV) may be operator-facilitated
  during the pilot rather than fully self-service.
- Nothing here is a financial product, an offer, or a promise of return.
  Production decisions require a separate legal and compliance review.
