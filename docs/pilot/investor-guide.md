# Investor Guide — NextBlock Pilot (Base Sepolia)

For Institutional LP participants who deposit test USDC into a vault and receive
restricted `nbUSDC` shares during the testnet pilot.

> Testnet only. No real funds, no yield, no financial offering. See the
> [testnet disclaimer](./testnet-disclaimer.md).

## At a glance

| Step | Where | Done when |
|---|---|---|
| 1. Wallet | your wallet app | wallet connected |
| 2. Network | wallet | on Base Sepolia (84532) |
| 3. Gas (test ETH) | external faucet | balance > ~0.005 ETH |
| 4. Test USDC | Pilot Hub faucet | balance > 0 |
| 5. KYB / eligibility | `/app/apply` + operator | application submitted |
| 6. LP whitelist | operator (ComplianceRegistry) | wallet eligible (`canReceive` true) |
| 7. Deposit | vault page | `nbUSDC` shares received |

Open **`/app/pilot`** to see your wallet, network, asset and eligibility status.

## 1. Wallet prerequisites

Use a self-custodial Web3 wallet on Base Sepolia. The pilot never requests your
seed phrase or private key.

## 2. Base Sepolia

The app runs only on **Base Sepolia (chain id 84532)**. Switch your wallet to
this network; the app blocks actions on any other chain and sends no transaction.

## 3. Test ETH and 4. Test USDC

- Test ETH (gas): obtain from a public Base Sepolia faucet (Coinbase Developer
  Platform faucet or Alchemy Base Sepolia faucet; links in the Pilot Hub).
- Test USDC: mint from the Pilot Hub or the vault deposit screen ("Mint test
  USDC"). This is MockUSDC — a valueless test token.

## 5. KYB and 6. LP eligibility (whitelist)

Vault shares (`nbUSDC`) are compliance-restricted: only eligible wallets may
receive them. Eligibility is enforced on-chain by the ComplianceRegistry (a
wallet must satisfy `canReceive`).

Submit KYB at **`/app/apply`**, then ask the operator to enable LP eligibility
for your wallet. In the current pilot the KYB form covers cedant and curator
application types, so investor/LP whitelisting is **operator-facilitated**: the
KYC Operator records your wallet in the ComplianceRegistry. The Pilot Hub shows
a "Whitelist: yes/no" indicator once eligibility is set.

## 7. Access vaults and deposit

When your wallet is eligible:

1. Open the vaults list (the app home) and choose a vault.
2. On the vault page, use the deposit panel to deposit test USDC.
3. You receive restricted `nbUSDC` shares according to ERC-4626-style math.
4. Withdrawals are subject to the vault liquidity buffer; amounts above the
   buffer may be queued or limited by design (this is expected institutional
   behavior, not a bug).

## Risks and testnet limits

| Item | Note |
|---|---|
| Asset value | Test ETH and MockUSDC have **no monetary value** |
| Yield | No real yield; any figures are for technical validation only |
| Redemptions | Not necessarily instant; buffer/queue applies to underwriting capital |
| Economic loop | Allocation/premium (UPR/NAV) flows may be operator-facilitated in the pilot |
| Compliance gate | Non-eligible wallets cannot receive `nbUSDC` by design |
| Production | Not a financial offering; production requires separate legal/compliance review |

## If you are blocked

| Symptom | What to do |
|---|---|
| Wrong network | switch wallet to Base Sepolia (84532) |
| No gas / no USDC | use the ETH faucet; mint test USDC in the Pilot Hub |
| Deposit reverts (not eligible) | ask the operator to enable LP whitelist for your wallet |
| KYB "Backend offline" | contact the operator |

Support: contact the protocol operator through your pilot invitation channel.
