# Cedant Guide — NextBlock Pilot (Base Sepolia)

For insurance companies / ceding entities participating in the testnet pilot.
A cedant submits reinsurance portfolios and (later) claims.

> Testnet only. No real funds. See the [testnet disclaimer](./testnet-disclaimer.md).

## At a glance

| Step | Where | Done when |
|---|---|---|
| 1. Wallet | your wallet app | wallet connected |
| 2. Network | wallet | on Base Sepolia (84532) |
| 3. Gas (test ETH) | external faucet | balance > ~0.005 ETH |
| 4. Test USDC | Pilot Hub faucet | balance > 0 |
| 5. KYB | `/app/apply` | application submitted |
| 6. KYB approval | operator | status `approved` |
| 7. Role grant | operator | `AUTHORIZED_CEDANT_ROLE` granted |
| 8. Submit portfolio | `/app/my-company` | portfolio appears on-chain |

Open **`/app/pilot`** at any time to see which step you are on.

## 1. Wallet prerequisites

Use a self-custodial Web3 wallet (e.g. a browser wallet or Coinbase Smart
Wallet). You control the keys; the pilot never asks for a seed phrase or private
key.

## 2. Switch to Base Sepolia

The app runs on **Base Sepolia, chain id 84532**. If your wallet is on another
network the Pilot Hub shows a "switch network" prompt and no transaction is
sent. Add/switch to Base Sepolia in your wallet.

## 3. Get test ETH (gas)

Every on-chain action needs Base Sepolia ETH for gas. Get it from a public
faucet (links are shown in the Pilot Hub):

- Coinbase Developer Platform faucet
- Alchemy Base Sepolia faucet

Aim for at least ~0.005 ETH. This ETH is testnet-only and has no value.

## 4. Get test USDC (MockUSDC)

The pilot uses a test USDC token (MockUSDC) with no real value. In the Pilot Hub
use the **"Mint test USDC"** button (mints 10,000 test USDC to your wallet). The
same faucet exists on the vault deposit screen.

## 5. Complete KYB

Go to **`/app/apply`** and submit the KYB application as a cedant. The form asks
for company details only; do not enter secrets. Submitting records your
application off-chain for operator review.

## 6. Wait for approval

The operator reviews KYB applications. Your status moves through
`submitted` → `under_review` → `approved` (or `needs_info` / `rejected`). The
Pilot Hub and `/app/apply` show your current status. No PII is exposed by the
status lookup.

## 7. Wait for the on-chain role grant

KYB approval is recorded off-chain; it does not by itself grant on-chain rights.
After approval, the operator grants your wallet the `AUTHORIZED_CEDANT_ROLE` on
the ProtocolRoles contract. Share your **connected wallet address** with the
operator. The Pilot Hub shows the role as "granted" once it is on-chain.

## 8. Use the Pilot Hub and submit a portfolio

When the hub shows the Cedant track "Unlocked", open **`/app/my-company`** and
submit a portfolio (name, line of business, jurisdiction, structure, coverage
limit, ceded premium, inception/expiry, evidence reference). The submission is a
normal wallet transaction on Base Sepolia.

## If you are blocked

| Symptom | Cause | What to do |
|---|---|---|
| "Connect your wallet" | wallet not connected | connect in the wallet app |
| "Switch to Base Sepolia" | wrong network | switch to chain 84532 |
| Action fails / no gas | no test ETH | use an ETH faucet (step 3) |
| Cannot fund deposit | no test USDC | mint test USDC in the Pilot Hub |
| KYB "Backend offline" | KYB service not enabled | contact the operator |
| KYB stuck `under_review` | awaiting operator | wait; contact the operator if delayed |
| KYB `rejected` | review outcome | contact the operator for reasons |
| Approved but no role | role not yet granted | share your wallet address with the operator |

Support: contact the protocol operator through the channel provided with your
pilot invitation.
