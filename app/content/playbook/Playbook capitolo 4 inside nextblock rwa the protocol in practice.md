---
title: "Inside NextBlock RWA: the protocol in practice"
slug: inside-nextblock-rwa-the-protocol-in-practice
chapter: 4
description: "How the NextBlock RWA protocol is designed to work, in plain words: data layer, vaults, roles, claims and the flows for cedents and allocators."
---

*This chapter describes how NextBlock RWA is designed to work: the three layers of the protocol, the vaults, the roles that govern them, and the way premiums, claims and redemptions are meant to move. It then follows the designed flows for a cedent and for an institutional allocator, and lists what each side would need to assess.*

## 1. What we have built

The first three chapters of this playbook built the argument. Reinsurance is a very large market that has long been closed to outside capital. Tokenization, which means recording ownership and rights in digital form on a blockchain, is one way to open it. The first operators have put the model into practice, and digital finance has a structural need for sources of income that come from real economic activity and not from newly issued tokens. This fourth chapter moves from argument to product: what NextBlock RWA is, how it is designed to work, and how a cedent (the insurer or reinsurer that passes part of its risk to someone else) and an institutional allocator would use it.

A note on status first. Today only V1 is live: the ex-post batch version, in which a book of policies that already exists is tokenized in one batch, after the fact. It runs on testnet only, on Base, Coinbase's layer 2 (a network built on top of Ethereum to make transactions faster and cheaper). A testnet is a practice network where the tokens carry no real value. Everything from here on describes how the protocol is designed to work.

### 1.1 The protocol is infrastructure

NextBlock RWA is a reinsurance tokenization protocol. RWA stands for real-world assets: things that exist outside a blockchain, here insurance policies, represented on it. The protocol is infrastructure, the software that lets a cedent turn a portfolio of real policies into a digital vault and lets an institutional allocator place capital in that vault, where the economics come from insurance premiums, net of claims and fees. It is neither a fund nor a reinsurer, and it does not underwrite risk itself. Nor is it a speculative DeFi product (DeFi is decentralized finance: financial services run by smart contracts, which are programs that execute their rules on a blockchain).

Picture a building with three floors. The first is the data layer, the actuary's desk. Its centrepiece is Wavenure, our proprietary artificial-intelligence engine. Wavenure scores the risk of a portfolio, an estimate of how likely and how large the claims will be, and feeds the actuarial NAV oracle. NAV is net asset value, what a vault holds minus what it owes, and an oracle is a service that publishes outside data on a blockchain. Wavenure also profiles investors during KYC, the know-your-customer identity checks every institution already runs. And it brings in Chainlink price feeds and proof-of-reserves mechanisms, which confirm that the assets a vault reports actually exist.

The second floor is the protocol core, the vault room. The VaultFactory generates insurance vaults under the ERC-4626 standard, a common design in which you deposit an asset and receive share tokens in return. Each vault carries ERC-3643 compliance gates and issues ERC-721 claim receipts. ERC-3643 is a token standard that only lets identified, approved parties hold the token. ERC-721 is the standard for unique tokens, usually called NFTs, and here each one works like a numbered certificate.

The third floor is the access layer, the reception desk: the institutional dashboard, the APIs and the SDK, which are the connections and toolkits that let a company's own systems talk to the protocol. Cedents and allocators use it without needing to understand the technology underneath.

### 1.2 The design choices that matter

Three architectural choices give the protocol its shape.

The first is that NextBlock is non-custodial. The protocol never takes possession of anyone's capital in accounts of its own. Funds sit inside the smart contracts of the vaults, and the rules for moving them are set in advance and designed to be verifiable by anyone.

The second is governance split across four roles. The Owner holds administrative powers, but every change the Owner proposes is subject to a seven-day timelock, a notice period: the change is announced and can only take effect a week later, so everyone else can see it coming. The Curator defines the risk allocation strategy, meaning which risks go into which vault. The Allocator executes that strategy. The Sentinel has strictly emergency powers, pause and veto, and no access to funds. By design, no single role can move capital on its own. (This Allocator is a piece of the vault's machinery. It is a different thing from the institutional allocator of section 4, the organization that provides capital.)

The third is the structural separation of liquidity. Think of a shop with a till and a safe: the till holds cash for the day's ordinary payments, the safe holds the rest. Each vault keeps a liquid buffer, typically 20% of assets, for immediate redemptions. The portion allocated to risk is ring-fenced, meaning set apart and pledged as security for the policies it covers. The separation is written at the smart-contract level and is meant to make orderly redemption possible even in a stressed market. Chapter 3 covered what happened to protocols that ignored the point.

> *The vault in one formula*
>
> The value of a vault is not a declared number. It is a formula that can be checked on-chain: NAV = USDC capital (USDC is a stablecoin, a token designed to hold a steady dollar value) minus premiums not yet earned minus pending claims minus accrued fees. Premiums not yet earned are money received for cover that still has time to run, so the vault owes it to the future. Every component is observable, and the share price derives mathematically from the formula, which means anyone can recompute it instead of taking it on trust.

## 2. How it works

The workings are easiest to follow by tracing the path of value: where risk enters, where capital enters, how the two meet, and how claims and redemptions are settled.

### 2.1 Supply side: from paper portfolio to Policy NFT

Risk enters through two channels. The first is traditional operators: reinsurers, ceding companies and syndicates that supply a portfolio of existing policies together with the data behind it. That means the policy schedule, the claims history of recent years, retention levels (the share of each risk the cedent keeps for itself) and jurisdiction. The second channel is other insurance protocols already on-chain, which the design lets connect through dedicated adapters registered in the AdapterRegistry, the protocol's list of approved adapters.

Every policy is classified under a verification taxonomy with three categories, and the category decides how its claims are handled. On-chain verifiable policies have claims triggered directly by on-chain data. Oracle-dependent policies are triggered by third-party data feeds such as weather or flight delays. Off-chain policies, such as fire, liability or D&O (directors and officers liability), have claims that the insurer verifies manually under traditional processes. After Wavenure's actuarial assessment and the legal structuring, each policy is digitized as a Policy NFT: an ERC-721 token that records its terms, premium and status on-chain.

### 2.2 Demand side: capital buying shares at NAV

Capital enters through the vaults. After KYC verification, a capital provider deposits USDC into the chosen vault and receives share tokens. The price of a share is the NAV per share, the accounting value of the vault computed with the formula above. Nobody bids it up or down. As premiums are earned the NAV rises, and so does the share price, while claims push it the other way. There are no manual distributions: the result shows up in the price.

Before depositing, the capital provider can see the composition of the vault and the risk score that Wavenure has assigned to it. The design promises no rate. What a vault delivers depends on the claims experience of the portfolio it holds.

### 2.3 The meeting point: the Curator allocates capital to risk

Between supply and demand sits the Curator. Think of a syndicate at Lloyd's, the insurance market where groups of capital providers back risks chosen by a professional underwriter. The Curator chooses which tokenized policies enter which vault, and with what weights. NextBlock can hold the role, and the design also allows third-party operators to hold it.

Diversification is built here: a vault can combine different lines of business, jurisdictions and taxonomies, within concentration limits set at the protocol level, which cap how much of a vault can sit in any one place. The Allocator executes the strategy, and the liquidity buffer stays separate from the capital that covers risk.

### 2.4 Claims and settlement: the cycle closes on-chain

When a claim occurs, what happens depends on the policy's category. For parametric and oracle-dependent policies, the trigger is automatic. Parametric cover pays when a measured event occurs, such as wind speed passing a threshold, with nobody needing to assess the loss. For off-chain policies, the cedent assesses the claim under its own standard process and submits it to the protocol. After verification, the vault is designed to pay the approved amount for the ceded portion in USDC within 24 hours of approval. Every payment generates a ClaimReceipt, an ERC-721 token that is a permanent record of the claim from start to finish.

Redemptions follow the buffer logic. Requests within the vault's liquid capacity are immediate. Requests above it join an orderly, transparent queue governed by the smart contracts. At agreed intervals, typically quarterly, the protocol and the cedent reconcile accounts: premiums transferred against premiums due, claims paid against claims due, with any difference settled by a balancing payment. An on-chain audit trail documents the whole cycle.

> *Who does what: the roles of the protocol*
>
> The cedent provides the portfolio, transfers the ceded premiums and handles the claims. It keeps doing its job. The protocol tokenizes the policies, manages the vaults and processes the on-chain operations.
>
> The Curator selects which policies enter which vault and manages risk allocation. Capital providers deposit the capital that backs the ceded risk, and what they receive comes from premiums, net of claims and fees.
>
> Wavenure assesses risk, updates the NAV and oversees KYC. The Sentinel can only pause or veto. Nobody, in any role, can move funds unilaterally.

## 3. Why the design answers the problem

The previous chapter identified the structural problems of the two worlds NextBlock connects. It is worth checking, point by point, how the architecture answers them.

### 3.1 For capital markets: premiums as the source, orderly redemption

Some DeFi products pay returns that depend on token issuance or on new deposits paying earlier ones. A vault is designed on simpler arithmetic: its result is premiums earned minus claims paid minus fees. The source is the insurance technical margin, the gap between premiums and the cost of claims, which has sustained the reinsurance industry for generations. It also means the result can fall. When claims run high the NAV drops, and capital can be lost.

Opacity gets its answer in the verifiable NAV: every component of the formula is observable on-chain, and proof-of-reserves lets anyone check that the collateral exists. Frozen withdrawals get theirs in orderly redemption, with a separate liquidity buffer, transparent queues and rules defined before a depositor enters, not improvised during a crisis. Anonymous counterparties are addressed by the ERC-3643 perimeter: every address that touches the protocol belongs to an identified, verified and whitelisted party. The last problem is the total correlation of the crypto world, and here the asset does the work. The losses of a motor or property portfolio are driven by accidents, storms and fires, not by the price of Bitcoin.

### 3.2 For the cedent: capital freed without changing trade

The cedent's problem, seen in the first chapter, is access to capital. Underwriting capacity is capped by the balance sheet, and the alternatives, retrocession (a reinsurer passing part of its risk to other reinsurers) and traditional ILS (Insurance-Linked Securities, instruments that let capital markets investors take insurance risk), tend to be costly, slow and geared to large players.

NextBlock is designed to address this without asking the cedent to change how it works. Cession through the protocol is meant to free balance-sheet capacity, which in practice is capital relief: less capital has to be held against risk that has been passed on. It also gives real-time transparency on the ceded portfolio and opens access to a new class of capital providers. Underwriting and claims handling stay with the cedent, which is its trade and its competitive advantage.

One design point deserves attention. The cedent does not earn the vault's result, because it has already collected the premium on the portion it retains. Its benefit is the risk transfer and the freed capital. The vault's economics go to capital providers, capacity to the cedent, fees to the protocol. Keeping those incentives apart removes the circular conflicts of interest that chapter 3 identified as the root of DeFi collapses.

### 3.3 For the ecosystem: a shared standard

The remaining problem is the fragmentation described in the previous chapter. Adapters are designed to let existing on-chain insurance protocols bring their risks into NextBlock vaults. The verification taxonomy gives parametric and traditional policies a common language. The governance roles allow third-party operators to curate vaults on the same infrastructure. This is the collaborative model of chapter 3 translated into code: any reinsurance operator can work with the others through one protocol.

## 4. How the protocol is designed to be used

This section describes the flows the protocol is designed for, first for a cedent and then for an institutional allocator, the organization that provides capital. It describes the design only.

### 4.1 The cedent's flow: from submission to settlement

A cedent that wants to cede a portfolio would move through a sequence of stages. In submission and assessment, it supplies the portfolio data (policy schedule, claims history, retention, jurisdiction) and states the cession parameters it wants. NextBlock assesses eligibility, maps the policies onto the verification taxonomy and proposes a term sheet covering the cession percentage, the premium split, claims responsibilities and the protocol fee structure.

Agreement and setup come next. The parties sign a quota share cession agreement, a traditional legal contract in which the cedent passes a fixed percentage of every policy in the portfolio to the vault, with premiums and claims following the same percentage. It defines premium obligations, claims responsibilities and the settlement currency. Operational onboarding follows: KYC/AML verification (know your customer and anti-money laundering checks), configuration of the authorized wallet, dashboard credentials, and a fiat on-ramp through an exchange or OTC desk, a dealer that trades directly with clients, to convert premiums from ordinary currency into USDC.

From then on, operations are continuous. Ceded premiums flow into the vault, the dashboard shows NAV, loss experience and claims status in real time, and the quarterly reconciliation closes each accounting cycle. The cedent does not need to learn blockchain. It signs a treaty and uses a dashboard.

### 4.2 The institutional allocator's flow

For a bank, a fund or a family office, the design follows the operational requirements of an institution with its own compliance obligations. Onboarding is a full KYB, the business version of KYC: entity verification, beneficial ownership (the people who ultimately own or control the entity), the entity's own regulatory status and custody agreements. Wavenure handles the identity, investor status, AML/CFT (anti-money laundering and counter-terrorist financing) and jurisdiction checks, and the verified address is registered on the ERC-3643 whitelist, the list of approved parties, on Base, Coinbase's layer 2.

Money moves in and out through conversion between fiat and USDC, via banks and institutional providers, with a complete audit trail. Custody sits on institutional multisig infrastructure, meaning wallets that need several approvals for each transaction, with whitelisted addresses. Operations can also run programmatically through the SDK and a REST API, for bulk deposits, automated rebalancing and reporting that plugs into internal systems.

Inside the protocol, the allocator compares vaults by NAV, risk score and the composition of the underlying portfolio. It deposits USDC and receives shares priced at NAV. Redemption is immediate within the liquidity buffer and goes through an orderly queue beyond it. The allocator never has to interact with a smart contract directly unless it wants to. It works through interfaces and counterparties it already knows.

### 4.3 What a cedent or an allocator would need to assess

Both sides would ask similar questions. On data: how complete and reliable the portfolio information is, and how the NAV is computed from it. On structure: how the vault, the cession agreement and the four roles fit together. On custody: who controls the keys and addresses, and how movements are approved. On compliance: how identity checks and the whitelist apply to each participant. On liquidity: how large the buffer is, how redemption requests are queued, and what happens in a stressed market.

> *What the cedent and the allocator do not have to do*
>
> The cedent does not have to change how it underwrites or handles claims, or learn Solidity, the programming language used to write smart contracts on Ethereum. It signs a cession treaty and uses a dashboard. The allocator does not have to become a self-taught insurance risk analyst: the risk score, the NAV and the vault composition are designed to be computed and published by the protocol. Neither has to take NextBlock at its word, because every number is designed to be verifiable on-chain. The infrastructure is meant to carry the complexity so that its users do not have to.

## 5. Summary: from architecture to operations

This chapter has covered the distance between an argument and a designed product. The protocol is non-custodial and built on Base, Coinbase's layer 2. It turns reinsurance portfolios into ERC-4626 vaults, with role-separated governance and ERC-3643 compliance built into the technology layer. Policies enter as Policy NFTs sorted by verification taxonomy, capital enters at NAV, the Curator brings the two together, and premiums, claims and redemptions settle in USDC with a complete audit trail.

Each design choice answers a failure seen in the market. Premiums replace subsidies as the source of the result, a verifiable NAV replaces promises, buffers and orderly queues replace frozen withdrawals, an identity-checked whitelist replaces anonymity, and separated incentives replace circular ones. The designed flows ask each participant to keep doing what it already knows how to do and leave the complexity to the infrastructure. The first three chapters set out why this market should exist. This one has set out how the protocol is designed to serve it.

*Information only. Not an offer or solicitation. Nothing in this chapter is investment, legal or tax advice.*
