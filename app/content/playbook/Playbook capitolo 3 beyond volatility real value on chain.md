---
title: "Beyond volatility: real value on-chain"
slug: beyond-volatility-real-value-on-chain
chapter: 3
description: Why decentralized finance needs yield with a real economic source, and where tokenized reinsurance and institutional infrastructure fit that need.
---

*Decentralized finance built fast, open rails, then too often ran value on them that only referred back to itself: yields with no economic source, exits that close under stress and collateral that moves in lockstep. This chapter looks at why those problems arise, how a reinsurance vault designed for institutions answers them, and why real-world assets, insurance included, are drawing the largest financial institutions. It closes with how incumbents, vertical operators and infrastructure fit together in one ecosystem.*

## 1. Why a third chapter

The first chapter of this playbook covered the fundamentals: what reinsurance and tokenization are, how each one works, and why putting them together creates value in a very large global market. The second chapter checked whether the model holds up in practice. We looked at three operators active in the real market: a tokenized reinsurance protocol on a public layer 1 (a general-purpose blockchain), a listed reinsurer that tokenized part of its collateral, and an on-chain reinsurance platform built on Solana. All three have live products, and regulators are already engaged with them.

This chapter flips the question. Chapter 2 asked why reinsurance needs the blockchain. The mirror question is why the blockchain, and decentralized finance in particular, needs real assets such as reinsurance, and it matters just as much.

To answer it, we first look at the structural problems of decentralized finance, or DeFi: lending, trading and savings services that run as smart contracts (programs that carry out their own rules automatically) on public blockchains instead of through banks. Two problems stand out. Advertised yields often correspond to no real economic activity, and when a protocol fails, investors can be left unable to sell their positions. Both grow from assets that are so tightly correlated that when the market falls, everything falls together. We then describe how NextBlock RWA approaches these problems by design, why real-world assets are drawing so much attention from large institutions, and how incumbents, vertical operators and infrastructure fit into a single ecosystem.

*Like the previous chapters, this one is written to be read by a CEO who has ten minutes, not by an actuary who has ten hours.*

## 2. The DeFi problem: yield without a real economy

Decentralized finance has shown something real. Financial infrastructure can run nonstop, settle transactions fast, remove layers of intermediaries and record every movement on a public ledger that nobody can quietly edit. The rails work. The trouble is what has been run on top of them.

### 2.1 The illusion of impossible yields

For years, DeFi's main marketing tool was the APY, the annual percentage yield a depositor is promised. The advertised numbers sat far above what banks or bond markets paid. Too few investors asked the simplest question of all, which is where the yield comes from. In finance, a sustainable return has to come from an underlying economic activity: interest on real loans, premiums for risks assumed, profits of an actual business. When the promised yield consistently exceeds what that activity can generate, somebody is subsidizing it. The money comes out of the protocol's reserves, from newly issued tokens, or from the capital of new depositors.

The best-known case is Anchor Protocol, on the Terra ecosystem. It paid a fixed, very high yield on deposits in UST, Terra's algorithmic stablecoin (a token meant to hold a one-dollar value through code instead of through reserves), far above what comparable protocols offered, and it came to hold a large share of all the UST in circulation. No economic activity generated that yield: in the months before the collapse, the company behind Terra had to top up the protocol's reserves from its own funds just to keep the advertised rate.

In May 2022 the mechanism that was supposed to hold UST at one dollar spiraled in on itself, and the Terra ecosystem collapsed within days. The contagion reached Celsius, a lender that promised high yields while making uncollateralized loans and had a sizeable exposure to Anchor, and then Three Arrows Capital, Voyager, BlockFi and Genesis, with losses spreading across the whole market.

> A yield is sustainable only if, upstream, someone is paying for a real economic service. In credit, the borrower pays interest. In insurance, the policyholder pays a premium to move a risk to someone else. When nobody pays and the yield comes from issuing tokens or recycling the deposits of newcomers, the arrangement lasts only as long as fresh capital keeps arriving, which makes it closer to a chain letter than to an investment. The whole difference between the two worlds sits there.

### 2.2 When the exit closes

The second structural problem is more serious than the first, because it hits at the moment protection matters most: the exit. The history of DeFi and of centralized crypto finance is full of frozen withdrawals. Celsius blocked client withdrawals in June 2022, about a month after the Terra collapse. Depositors had no redemption rights they could exercise and no orderly liquidation procedure, only years of bankruptcy proceedings.

Even in genuinely decentralized protocols, the promised liquidity often turns out thinner than advertised. A liquidity pool is a shared pot of tokens from which traders swap and depositors withdraw, and it drains at exactly the moment stress arrives and everyone heads for the exit together. It is a bank run in on-chain form, with the extra problem that a smart contract cannot create liquidity that is not there. Liquidation cascades, chains of forced sales that push collateral prices down and trigger more forced sales, have repeatedly turned ordinary downturns into crashes. Price oracles, the feeds that bring outside prices onto a blockchain, have been manipulated so that attackers could drain whole protocols using falsified data.

None of this is history. Protocols have kept shutting down in 2026, and exploits have drained large sums from others. These episodes come from the same architecture, one in which value mostly refers back to itself.

### 2.3 The root: self-referential assets and correlation

The two problems share a root. In speculative DeFi, collateral often consists of tokens whose value depends on confidence in the very ecosystem they are meant to protect. The governance token backs the stablecoin, the stablecoin feeds the pool, and the pool supports the price of the governance token. It is a bakery that pays its staff in vouchers only the bakery accepts, then points to the vouchers as proof of its strength. Every component is correlated with all the others.

For an institutional investor this has one precise consequence: no real diversification. When crypto sentiment sours, tokens, collateral, liquidity and counterparties fall together. A portfolio that looked spread across several protocols turns out to be a single directional bet on one risk factor. That is the opposite of what institutional capital looks for, which is predictable cash flows, uncorrelated with financial markets, backed by economic activity that exists whatever the price of a token.

## 3. How NextBlock addresses the problem

NextBlock builds B2B institutional infrastructure for tokenizing reinsurance treaties and mid-market and run-off portfolios (books of policies that no longer take new business but still generate claims). It is built on Base, Coinbase's layer 2, a network that runs on top of Ethereum to make transactions cheaper and faster. V1, the ex-post batch version that tokenizes portfolios after the treaties have been written, is live on testnet, the test environment where no real value is at stake.

### 3.1 Actuarial yield versus speculative yield

In a reinsurance vault, the return has one source: the premiums that real insurance companies pay to transfer real risks, net of the claims that come back. It does not come from token issuance or from the deposits of newcomers. It is the same economic flow that has fed the balance sheets of Munich Re and Swiss Re for generations, and it rests on the law of large numbers. Over a large, diversified portfolio, the expected cost of claims can be predicted with actuarial accuracy, and the gap between premiums collected and claims paid is a technical margin that can be measured and, in a bad year, can be negative.

That return has a property speculative DeFi cannot offer: reinsurance risk has little to do with crypto markets or with traditional financial markets. A hurricane does not consult the price of Bitcoin, and a mid-market motor portfolio does not care about a rate hike. For an asset manager this is genuine diversification, the same feature that helped make Insurance-Linked Securities (securities through which capital-market investors take on insurance risk, catastrophe bonds being the best known) an asset class of its own with a large pool of alternative capital. Low correlation is still not the same as no risk. In a bad year, claims can exceed premiums.

### 3.2 Verifiable NAV and orderly liquidation

Instead of a promised APY, a NextBlock vault is designed to show a verifiable NAV. NAV, or net asset value, is what one share of a fund is worth once assets and liabilities are counted. Each tokenized reinsurance portfolio lives in a vault built on the ERC-4626 standard for tokenized vaults, and its NAV is updated continuously by Wavenure, our proprietary engine, from the portfolio's real data: premiums collected, claims reserves (money set aside to pay claims) and loss development (how the estimate of claims changes as time passes). A holder does not have to trust a number posted on a website. The value of each share, and how it has moved, can be checked on-chain.

Vaults are built to settle in USDC, a fully collateralized dollar stablecoin, and not in a token whose value depends on the protocol itself. Subscription and redemption rules are written into the smart contracts in advance, and they follow the actual duration of the underlying reinsurance treaties. A treaty cannot be unwound overnight, so a vault should not promise instant liquidity. It offers redemption windows that are orderly, transparent and programmable, in keeping with the nature of the asset. Think of a ferry: it leaves on a published timetable, and you know the timetable before you buy the ticket. Exit terms are set before anyone enters, which is the reverse of learning about them in the middle of a crisis.

### 3.3 Compliance built into the technology layer

The third pillar is compliance, and we build it into the technology layer. Tokens follow ERC-3643, a standard for permissioned tokens. A token can be transferred only between parties that have been identified, have passed KYC/AML checks (know-your-customer and anti-money-laundering verification) and sit on a whitelist, the approved list that the token itself consults before every transfer. Picture a members-only club with a doorman who checks the list on every entry, including the second visit of the evening.

The perimeter is institutional by design: asset managers, funds, family offices and reinsurance operators, rather than anonymous retail users. Because the token enforces identity checks, the holder base is known. That addresses anonymous counterparty risk, the situation in which nobody knows who holds what, or how much borrowing sits behind it.

### 3.4 What NextBlock brings to the ecosystem

The relationship between NextBlock and DeFi is one of completion. DeFi built excellent rails and spent years using them to circulate self-referential value. We use the same rails, smart contracts, tokenization, fast settlement and on-chain transparency, to circulate value that comes from an insurance premium. What reinsurance offers the digital ecosystem is a source of return tied to real economic activity, one that can be measured and verified on-chain. It is a piece speculative DeFi has often lacked.

The contrast with speculative DeFi can be set out side by side.

| Topic | Speculative DeFi | A NextBlock vault, by design |
| :- | :- | :- |
| Source of yield | Token issuance and capital from new entrants | Reinsurance premiums paid by real insurance companies |
| Share value | A promised APY that cannot be verified | Continuous NAV computed by Wavenure from real portfolio data |
| Exit | Withdrawals frozen in moments of stress | Redemption windows defined in advance in the smart contracts |
| Counterparties | Often anonymous | KYC-verified parties on an ERC-3643 whitelist |
| Correlation | Moves with the crypto cycle | Reinsurance risk has little correlation with crypto or financial markets |

## 4. Why real-world assets are moving on-chain, in finance and in insurance

### 4.1 A migration already underway

The idea that tokenized real-world assets (RWAs: bonds, funds, credit and other traditional assets represented as tokens) are heading for the center of finance has moved from forecast to something we can observe. Excluding stablecoins, the on-chain value of RWAs has multiplied several times over in a little more than a year. The tokenized US Treasury market, on its own, has grown into a market of real size.

The more telling detail is who is driving the growth. BlackRock, the largest asset manager in the world, runs a tokenized fund, BUIDL, that has attracted substantial assets. JPMorgan launched its own tokenized money market fund, MONY, in December 2025, and BNY and Goldman Sachs have launched a joint tokenized money market fund solution aimed at the same mandates. When the largest financial institutions build tokenized products of their own, the debate has moved on to how fast finance goes on-chain. In 2022, Boston Consulting Group and ADDX estimated that tokenized illiquid assets could reach about $16 trillion by 2030, and later BCG work uses different scenarios. Long-range estimates deserve some caution, and they are best read as orders of magnitude.

### 4.2 Why insurance is a natural candidate

Within this migration, reinsurance has structural reasons to sit near the front. An asset that suits tokenization has contractual, measurable cash flows, a value rooted in economic activity outside the crypto world, and a deep underlying market. Reinsurance meets all three. Premiums are set by contract, the risk can be assessed with actuarial methods refined over centuries, and the market is very large and well capitalized.

There is also a historical precedent. The Insurance-Linked Securities market showed that capital-market money can take on insurance risk in securitized form. Tokenization is a natural next step, more accessible and more transparent, and potentially more efficient. Regulators have noticed. The Bermuda Monetary Authority published a discussion paper on asset tokenization in November 2025, with a section on insurance-linked securities, and the London Stock Exchange Group launched a blockchain-based digital markets platform in September 2025, whose first use was a fund that raises reinsurance capital.

Finally, two needs fit together. The reinsurance industry looks for new and more efficient sources of capital, and the digital ecosystem looks for returns that come from something real. Each side has what the other lacks. Infrastructure that connects them opens a market that already exists and has long been hard for outside capital to reach.

## 5. One ecosystem: infrastructure, incumbents and vertical operators

### 5.1 Infrastructure and operators

When someone looks at NextBlock, a natural question is how it relates to everyone else in tokenized reinsurance. Different participants do different jobs, and chapter 2 already drew the first distinction.

The incumbents are the traditional reinsurers and the brokers who place business with them. They hold the portfolios and the underwriting expertise, built up over generations. The vertical operators are the ones analyzed in chapter 2: a tokenized reinsurance protocol on a public layer 1, a listed reinsurer that tokenized part of its collateral, and an on-chain platform on Solana. A vertical operator underwrites risk on its own account, issues its own products and manages its own portfolio. Their existence shows that the market works. Infrastructure is a third job, and it is the one NextBlock does. We do not underwrite risk on our own account. We build the layer a reinsurance operator would use to tokenize its portfolios, present them to institutional holders and settle flows on-chain.

The comparison we find most useful is an airport. Airlines compete with one another, and the airport is the place where they all operate. An airport does not fly planes, and it depends on the airlines as much as the airlines depend on the runway. An operator that builds on shared infrastructure gets tools and connections it would otherwise have to build itself.

### 5.2 The collaborative paradigm

The reference model is Lloyd's of London. Lloyd's is a marketplace where independent syndicates underwrite risk, brokers bring business and capital providers share in the results, all within one framework of rules, standards and mutual trust. For centuries this model has shown that, in risk, collaboration on common infrastructure creates more value than a fragmented market.

We build NextBlock on the same idea, on-chain. The roles of the reinsurance chain sit side by side on the infrastructure. Ceding companies, the insurers that pass part of their risk to a reinsurer, bring portfolios. Reinsurers structure and assess risk, brokers intermediate, and asset managers and market makers provide capital. Each role has permissions and responsibilities defined at the protocol level. In an arrangement like this, a newcomer adds portfolios, capacity or capital that the rest of the system can use.

### 5.3 Network effects

An architecture like this produces classic network effects. The more reinsurance operators use a shared infrastructure, the more portfolios become accessible to capital. The more portfolios are available, the more capital has a reason to come. The more capital is present, the stronger the reason for operators to bring more portfolios. That loop is what built stock exchanges and payment networks, and it works only when participants trust the rules.

The tokenized share of reinsurance is still small. At this stage, the limit on growth is the speed at which infrastructure and standards get built.

> Each participant has a role. Vertical operators show that the market works by underwriting risk on their own account, and any of them could build on shared infrastructure like everyone else. Traditional reinsurers supply portfolios and underwriting expertise. Asset managers supply capital. Brokers are the origination channel. Infrastructure supplies the rules, roles and settlement that let the others work together on the same rails.

## 6. Taking stock

DeFi showed that the rails work, and for years it used them to circulate self-referential value: subsidized yields that collapse, liquidity that evaporates under stress, and correlation with the crypto cycle. The collapse of Terra, the frozen withdrawals at Celsius and the exploits that keep draining protocols are the cost of an architecture with no real economy underneath.

Real-world assets are a structural answer to that problem, and the migration is visible: BlackRock, JPMorgan and other large institutions are building tokenized products. Reinsurance fits the pattern well. It has contractual cash flows, actuarial valuation, low correlation with financial markets and a very large underlying market that outside capital has found hard to reach.

NextBlock is built as infrastructure that joins the two worlds. The design replaces subsidized APYs with a return that comes from premiums, promises with an NAV anyone can check, anonymity with identity checks enforced by the token, and frozen withdrawals with redemption windows set in advance. Cedents, reinsurers, brokers and asset managers share the same rails and keep their own roles.

None of this replaces due diligence. A cedent or an allocator looking at any tokenized reinsurance structure would want to assess the same five things set out in chapter 2: the quality and history of the data, the structure of the vehicle, where the assets are held and by whom, how compliance is enforced, and how and when investors can get out.

*Information only. Not an offer or solicitation. Nothing in this chapter is investment, legal or tax advice.*
