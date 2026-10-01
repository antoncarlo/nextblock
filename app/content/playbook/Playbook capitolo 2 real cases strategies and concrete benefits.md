---
title: Real cases, strategies and concrete benefits
slug: real-cases-strategies-and-concrete-benefits
chapter: 2
description: "How tokenized reinsurance works in practice: three operating cases, what insurers gain, what allocators should check and what regulators are saying."
---

*This chapter walks through three operating cases of tokenized reinsurance: a protocol on a public layer 1, a listed reinsurer with tokenized collateral and an on-chain platform on Solana. It then explains what insurers gain, what an asset manager would need to check and what a regulator and an exchange group are signaling. It closes with the Insurance-Linked Securities market, the older cousin that tokenization builds on.*

## 1. Why this second chapter

The first chapter of the playbook covered what reinsurance and tokenization are, how each one works and why bringing them together matters. This chapter moves from theory to practice.

It is written for people who have to make decisions, so it sticks to four questions: whether tokenized reinsurance already works, who is doing it, what the underwriting record looks like, and what concrete benefits an insurance company and an asset manager would find when they evaluate the model.

To answer them we look at three operators active in the real market in 2025. They are past the design or announcement stage: they have live products, premiums written and regulators engaged. We describe each strategy in plain terms, for readers who know one of the two worlds but not the other, and then go through the specific advantages that collateralized, tokenized reinsurance offers to each party. "Collateralized" simply means that the money which may be needed to pay claims is set aside in advance.

> *This chapter is written to be read by a CEO who has ten minutes, not by an actuary who has ten hours. The technical concepts are all there, explained the way you would explain them to a smart colleague from another industry.*

## 2. Case A: a tokenized reinsurance protocol on a public layer 1

### 2.1 What the protocol is

Case A is a decentralized reinsurance protocol built on a public layer 1 blockchain, which is a base network that other applications are built on top of. The founding idea is a marketplace modeled on Lloyd's, where global capital meets insurance risk, with the collateral visible on-chain and the reinsurance written through a regulated entity.

Lloyd's operates as a marketplace where those who hold capital meet those who need cover. The protocol replicates that model on a blockchain. Capital providers play the role of Members (the individuals and firms that back risks at Lloyd's). They deposit stablecoins into the protocol, and those stablecoins are used to provide collateralized reinsurance to real insurance companies.

### 2.2 How it works in practice

The mechanism runs in four steps, and none of them requires any knowledge of blockchain.

It starts with a deposit. An asset manager, a fund or a qualified investor puts stablecoins into the protocol, for example USDC or a yield-bearing dollar stablecoin. Stablecoins are digital dollars designed to hold a 1:1 value against the US dollar, and a yield-bearing one also pays a return to whoever holds it. The capital is locked in a dedicated vault, a smart contract that holds funds for one defined purpose.

Next, the capital becomes collateral. The protocol converts it into surplus notes, a debt-like capital instrument that regulators recognize as regulatory capital for insurance companies. Through a regulated reinsurance entity in the Cayman Islands, that capital is made available to insurers as collateralized reinsurance.

Then insurers put the capital to work. US insurance companies writing lines such as commercial auto, liability, property and workers' compensation use it to underwrite policies. In practice, the protocol supplies the reinsurance that lets these companies write more business. Think of it as a second, larger umbrella held over the insurer's book: the company can write more policies because someone else has agreed to stand under part of the rain.

Finally, premiums flow back. The premiums the insurers collect, net of claims paid and operating costs, are distributed to the capital providers. All of it is tracked on-chain, meaning recorded on the blockchain, and can be verified in real time through Chainlink Proof of Reserve, a system that publicly certifies that the collateral exists and is sufficient.

### 2.3 The numbers

Case A is an operating protocol with sizeable volumes. By the end of the third quarter of 2025 it had written 168.8 million dollars in premiums since inception (the premium on the contracts signed, as reported by the company), which shows that traditional insurers are willing to accept capital that arrives through blockchain infrastructure. The protocol also authorized more than 134 million dollars of reinsurance capacity across several programs ahead of the January 2026 renewals, and it evaluated more than 18.3 billion dollars of premiums during 2025. That last number measures the programs it looked at, not business it wrote.

The figure that says the most is the combined ratio of 92% at the end of the third quarter of 2025. The combined ratio adds up a reinsurer's claims and operating costs and compares them with its premiums, so it needs a short explanation.

> Reading a 92% combined ratio
>
> The combined ratio measures how much it costs a reinsurer to run its business. Below 100%, the reinsurer is making money. A 92% combined ratio means that for every 100 dollars of premium collected, 92 go to claims and operating costs, leaving 8 dollars of technical profit. Many traditional reinsurers run close to 100% or even at a technical loss, so 92% compares well with the sector.

### 2.4 The two product tiers

In 2025 the protocol launched two products for institutional capital on its public layer 1.

The first carries no direct insurance risk. It is built on T-bills (short-term US government securities) and on delta-neutral strategies on Ethereum, which are positions arranged so that gains and losses from price moves cancel out. It works as an entry point for capital providers who want to approach the sector without underwriting exposure.

The second is the core product. Its token is backed by fully collateralized underwriting of US insurance lines (auto, property, workers' compensation), with on-chain tracking and built-in liquidity. The holder has direct exposure to the results of real reinsurance.

The distinction matters, because the two carry very different risk profiles: one is a conservative point of entry, the other is full exposure.

### 2.5 Why it matters

Case A is evidence that the model can run at scale. With almost 170 million dollars of premiums written, it is well beyond a small pilot. US insurers accept the capital, regulators recognize the surplus notes as regulatory capital, and the risk sits in insurance lines that are uncorrelated with financial markets, meaning their results do not move with equity or credit prices.

## 3. Case B: a listed reinsurer with tokenized collateral

### 3.1 What the company is

Case B is a reinsurance company based in the Cayman Islands and listed on a US exchange. Through a subsidiary launched in 2022, it became one of the first listed companies to sponsor security-backed reinsurance tokens. That detail matters for due diligence. The issuer is a regulated, listed reinsurance company, subject to SEC reporting (the disclosure rules of the US securities regulator) and to the disclosure obligations of its exchange, and the program sits inside an established reinsurance group.

Its business centers on catastrophe reinsurance in the US Gulf of Mexico region, in particular hurricane risk in Florida. In 2021 and 2022, Florida domestic insurers ceded roughly half of their gross premium to reinsurers (54% and 49%, according to ALIRT Insurance Research). That is a very high share, and it shows how much insurers depend on reinsurance capacity in this region and what it costs them.

### 3.2 How the token model works

The subsidiary built what works as a digital reinsurance sidecar. A sidecar, in reinsurance as on a motorbike, is a smaller vehicle attached to a bigger one. It travels with the reinsurer's book of business and takes a share of the result, while keeping its own separate funding. The model runs in four steps.

Investors buy tokens first. The subsidiary issues them on a public blockchain, first on one public layer 1 and later on another. The minimum investment is 5,000 dollars. Traditional insurance-linked securities (ILS), the bonds and funds through which capital markets take on insurance risk, are much larger tickets: catastrophe bond notes typically start at 250,000 dollars (CoinDesk, September 2026), and direct collateralized reinsurance or sidecar participations run higher.

The capital then funds the sidecar. The money collected capitalizes a reinsurance vehicle, the sidecar, that is fully regulated in the Cayman Islands. The sidecar takes part through quota share agreements with the group's operating reinsurance company. In a quota share, the reinsurer takes a fixed percentage of every policy in a book and receives the same percentage of the premiums and of the losses.

Third, the sidecar reinsures real policies. The operating reinsurer provides catastrophe cover to insurance companies in the Gulf region for the hurricane season, from June to November. If no major hurricane occurs, the sidecar keeps the premiums as profit.

Last come the results. At the end of the season the outcome is calculated from underwriting performance and distributed to token holders. Tokens can be redeemed in the windows that the contract sets.

### 3.3 Track record: four years of issuance

The program is in its fourth consecutive year of issuing reinsurance tokens. The record so far looks like this:

> The first issuance ran in 2023/2024. The 2023 hurricane season brought no significant event to the Gulf region, and the structure was not called on to pay large catastrophe claims.
>
> A second issuance in 2024 covered the 2024 season, and Hurricane Milton affected it (section 3.4).
>
> Two issuances with different risk profiles followed for 2025/2026, opened for subscription in March 2025 with coverage effective 1 June 2025: one token with a balanced risk profile and one with a higher risk profile. Both went through the 2025 hurricane season with no significant event in the Gulf region.
>
> The new issuance for 2026/2027 changes the structure. The sponsor introduced preferential hurdle rates. A hurdle rate is a return threshold: investors are paid up to it first, before the sponsor shares in the profits, so the interests of the issuer and of the investors line up much more closely.

### 3.4 What Case B teaches

The case shows a few basic principles. The first is size: the model works on a smaller scale, and you do not need to be Swiss Re to tokenize reinsurance. The second is that a listing adds public disclosure that institutional investors and regulators can read. The third is that the results trace back to reinsurance fundamentals. The first issuance came through a hurricane season without catastrophic events, in a traditional reinsurance portfolio whose outcome can be checked against the underlying policies.

The risk is real. If a category 4 or 5 hurricane hits Florida, investors can lose part or all of the capital invested. The earlier record shows that Hurricane Milton (2024) affected the tokens of the 2024 season. That is the nature of catastrophe risk, and it is why capacity in these layers is priced at a premium.

## 4. Case C: an on-chain reinsurance platform on Solana

### 4.1 What the platform is

Case C is a regulated on-chain reinsurance platform that launched a token in May 2025. Its approach differs from the other two cases. Case A positions itself as a marketplace and Case B as the issuer of tokenized sidecars. Case C combines three sources of income: reinsurance performance (premiums net of claims), the return on the invested collateral and protocol incentives, which are extra rewards a protocol pays to attract early deposits.

### 4.2 The business model

The platform runs on the Solana blockchain and uses a yield-bearing dollar stablecoin as its deposit asset. Investors deposit that stablecoin into the platform's reinsurance pool, and the deposits are allocated to a diversified portfolio of reinsurance contracts, underwritten by the platform's own actuarial and underwriting team.

What sets the model apart is that the same capital does two jobs. Collateral standing behind reinsurance contracts can be invested while it waits, much like an escrow account that pays interest until the deal closes. The pool therefore earns investment income on the collateral and underwriting income from the premiums.

> A worked example
>
> Imagine 10 million dollars posted as collateral. Invested in short-dated instruments, that capital earns investment income. Used at the same time as collateral behind reinsurance contracts, it also earns the premiums collected for selling protection against rare events, net of claims. The capital works twice. It also carries a double exposure: the collateral has to be available when a covered event occurs, so the same dollars that earn investment income are the ones at risk of loss.

### 4.3 The token

The value of the platform token is linked to the platform's total value locked (TVL), the total value of the assets deposited in it, and so it reflects the underlying underwriting activity. Its income combines reinsurance results, collateral return and protocol incentives.

The distinction to keep in view is between the durable component, tied to actuarial performance, and the initial protocol incentives, which tend to shrink over time. An allocator, meaning the person or team that decides how capital is split across strategies, looking at a structure of this kind should ask what remains once the incentives normalize, and give the durable component the most weight.

## 5. Concrete benefits for the insurance company

So far we have looked at the model from the side of the capital provider. An insurance company wants to know what it gains by accepting reinsurance from a blockchain platform when a traditional reinsurer is already on its panel. The benefits are concrete and measurable, and some of them are large enough to change what a balance sheet can support.

### 5.1 Full collateralization and credit risk

In traditional reinsurance, the insurer that passes risk on to a reinsurer, called the cedent, is in effect relying on that reinsurer's financial strength. If the reinsurer fails or cannot pay claims, the cedent is left with the risk and without cover. This is the reinsurer's credit risk, and it is a real one: history has examples of reinsurers that could not honor their commitments.

In tokenized, collateralized reinsurance, this risk is removed for the collateralized portion. The investors' capital is locked in a trust or in a smart contract before the policy is issued. The collateral covers 100% of the reinsurance limit, less the net premiums collected. The reinsurer's word is replaced by money that is already there, locked and available. In Case A, the collateral is also verified publicly in real time through Chainlink Proof of Reserve.

> In plain words
>
> In traditional reinsurance, the reinsurer says: "if something happens, I will pay you." In collateralized reinsurance, the money to pay you is already deposited in an account that nobody can touch until the contract expires. It is the difference between a friend who promises to lend you money and a friend who has already put it in a restricted account in your name.

### 5.2 Balance sheet impact: credit for reinsurance and reserves

For an insurance company, reinsurance transfers risk and also works as a balance sheet management tool. When a company cedes risk to a reinsurer, it can take "credit for reinsurance" in its regulatory accounts. That credit lets the company reduce the reserves it must hold, which frees capital to write new policies.

Collateralized reinsurance makes it much easier to obtain this credit. Under the NAIC framework (the standards set by the association of US state insurance regulators), US regulators allow cedents to take full credit for reinsurance ceded to "non-admitted" reinsurers, meaning those not directly authorized in the state, provided the reinsurer posts collateral equal to the amount ceded. Because tokenized reinsurance is fully collateralized by design, the cedent can obtain credit for reinsurance without worrying about the reinsurer's creditworthiness.

> Reserves, worked through
>
> Say a company holds 100 million dollars in claims reserves and cedes 30% through collateralized reinsurance. It can record 30 million as reinsurance recoverable (an amount due from the reinsurer) and reduce its net reserves to 70 million. That reduction frees capital the company can use to underwrite new business. Because the collateral stands at 100%, the credit does not need a write-down for counterparty risk.

### 5.3 Effect on the loss ratio

The loss ratio, which measures claims as a share of premiums, is one of the main indicators for any insurance company.

One point first. The cedent's loss ratio does not become zero simply because of collateralized reinsurance. It is calculated on gross business and then adjusted for the ceded share. Even so, collateralized reinsurance has a clear positive effect on the net loss ratio and on the stability of results, and there are three reasons.

The first is lower volatility. By ceding the catastrophe component of the portfolio, the company cuts the peaks in claims. In a year with a devastating hurricane, the gross loss ratio could reach 150%, while the net loss ratio (after reinsurance cover) could stay at 65% to 70%. Reinsurance absorbs the shock.

The second is certainty of recovery. In traditional reinsurance, a company can show a theoretically good net loss ratio and discover months later that the reinsurer is not paying or is disputing the claims. With collateralized reinsurance, recovery is backed by collateral held in trust, which removes the risk that the net loss ratio worsens retroactively because a recovery fails.

The third is faster settlement. In the traditional model the cedent has to wait for the reinsurer to pay. With collateral in trust, funds are available immediately to pay claims, which improves settlement times and the company's cash flow.

### 5.4 Capital relief: more business with the same capital

For an insurer that wants to grow, this benefit can decide whether tokenized reinsurance is a nice extra or a necessity.

Solvency II in Europe and Risk-Based Capital (RBC) in the United States are the capital rules for insurers, and both require them to hold capital in proportion to the risks they underwrite. The more business you write, the more capital you need. That puts a ceiling on growth: even when market opportunities exist, the company cannot take them without enough capital.

Reinsurance addresses the problem because it transfers the risk, and the capital requirement with it. If a company cedes 40% of its portfolio through a quota share, its capital requirement falls in proportion. The company can then use the freed capital to underwrite new policies, enter new markets or open new lines of business.

> Capital relief, worked through
>
> A company has 50 million in capital and an RBC requirement that lets it underwrite 200 million in premiums (a premium-to-surplus ratio of 4:1). By ceding 30% of the portfolio through collateralized reinsurance, it frees about 15 million of capital, which it can use to underwrite a further 60 million in premiums. With no new equity capital, the company has increased its production capacity by 30%.

Case A illustrates the point. The protocol states that its partner insurers use it to obtain additional capacity, meaning the ability to write more policies without recapitalizing. It also describes the capital as serving existing relationships as well as new placements, which is consistent with insurers using it as a growth lever.

### 5.5 Diversification of capital sources

A basic principle of corporate risk management is not to depend on a single source for any critical resource. Reinsurance capital is one of those resources for any insurer, and historically its sources have been few: a handful of large global reinsurers and the brokers who intermediate them.

Tokenized reinsurance adds a complementary channel that draws on entirely different pools of capital: investors from decentralized finance (DeFi), crypto funds, alternative asset managers and, potentially, qualified retail investors. It sits alongside the large reinsurers such as Munich Re and Swiss Re, and it gives the cedent a wider base of capacity to call on.

Bermuda, one of the main centers of collateralized reinsurance business, already recognizes this model. In November 2025 the Bermuda Monetary Authority (BMA) published a discussion paper on asset tokenization, with a section on tokenized insurance and insurance-linked securities such as catastrophe bonds, collateralized reinsurance and sidecars. Section 7.1 looks at what it says.

### 5.6 Operational efficiency and transparency

In traditional reinsurance, data moves between cedent and reinsurer through periodic bordereaux (the regular reports of policies and claims that a cedent sends), manual reconciliations and reporting processes that take weeks. Claims are notified, verified, disputed and paid through chains of emails, documents and negotiations.

With on-chain reinsurance, every cash flow is recorded on the blockchain. The cedent can see in real time the state of the collateral, the claims paid and the premiums collected. Case A uses Chainlink Proof of Reserve to publish verifiable collateralization data. Fewer manual reconciliations and less back and forth should also mean lower administrative costs than in traditional off-chain processes.

## 6. Considerations for the asset manager

The insurance company asks why it should accept this capital. The asset manager asks what it would be taking on. The answers differ, and they complement each other.

### 6.1 What the track record shows and what it does not

The three cases give an allocator three kinds of evidence: underwriting metrics (Case A: a 92% combined ratio in the third quarter of 2025 and 168.8 million dollars of cumulative premiums written), outcomes by hurricane season (Case B) and structure (Case C: three sources of income on the same pool of capital). They do not give a forecast.

The result of a structure exposed to catastrophes is set by the events of the season. If a category 5 hurricane hits Florida, catastrophe tokens can lose most of their capital. The 2023 season brought no significant hurricane to the Gulf region, and Hurricane Milton in 2024 affected the tokens of that season. In a different year the outcome would have been very different. A careful allocator looks at risk-adjusted results over a multi-year cycle and sizes the exposure to that cycle.

Before allocating to a structure of this type, an allocator or a cedent needs to assess five things, and it helps to go through them in the same order every time. Data comes first: how underwriting, claims and valuation data are produced, audited and made available, and how often. Structure is next: which risks are covered, how premiums and losses are shared (quota share, catastrophe layer, preferred return) and what ranks ahead of the capital in the waterfall, the order in which money is paid out. Custody follows: where the collateral is held (trust or smart contract), who can move it and how its existence is proven. Compliance is the fourth: investor eligibility, KYC and AML controls (the know-your-customer and anti-money-laundering checks) and the rules that apply in each relevant market. Liquidity closes the list: how quickly a position can be redeemed or sold, and how that compares with the liquidity of the underlying reinsurance exposure.

### 6.2 Decorrelation from financial markets

The most useful property of reinsurance as an asset class is decorrelation. Insurance losses are driven by physical events (hurricanes, earthquakes, hailstorms) that bear no statistical relation to financial markets.

When the Federal Reserve raises rates, when equity markets fall, when crypto markets drop sharply in a week, the risk profile of a reinsurance portfolio stays where it was. Hurricanes and earthquakes do not respond to interest rates or to the S&P 500. That indifference to financial cycles makes reinsurance one of the few real diversifiers available in the global investment universe.

For an asset manager building portfolios, adding a tokenized reinsurance component can lower overall portfolio volatility and, in technical terms, improve the portfolio's Sharpe ratio (the return earned per unit of risk taken), provided the exposure is sized and priced with care.

### 6.3 Access and granularity

Historically, access to reinsurance went to investors who could place large tickets in ILS, in catastrophe bonds (bonds whose principal pays claims if a specified catastrophe occurs) or in specialized reinsurance funds. Tokenization has lowered that entry ticket.

Case B sets a minimum investment of 5,000 dollars, far below the ticket of traditional ILS. Case A gives qualified investors access through stablecoin deposits, without prohibitive minimum thresholds. Case C takes deposits in a yield-bearing dollar stablecoin and allocates them to a pool of reinsurance contracts.

For an asset manager, this makes it possible to build reinsurance exposure in small increments, without the minimum sizes of traditional ILS. It also makes it possible to spread the exposure across several pools and providers instead of concentrating it in one fund. Granularity has a cost in diligence, though: each pool and each provider has to be assessed on the five points listed in section 6.1.

### 6.4 Liquidity and transparency

Traditional ILS have two structural problems: long lock-ups and opacity. A lock-up works like a parking garage that opens only on the owner's schedule: the car is safe, but you cannot take it out when you want. The investor buys, waits and receives quarterly reports. To exit before maturity, the investor has to find a buyer in a secondary market that is illiquid and often over the counter (OTC), meaning negotiated privately instead of traded on an exchange.

Tokenized reinsurance addresses both problems. Tokens can be traded on on-chain secondary markets, with liquidity supplied by automated pools, which are smart contracts that hold both sides of a trade so that buyers and sellers do not have to find each other. Transparency is much higher: every cash flow, every claim paid and every premium collected is recorded on the blockchain and can be verified in real time. A holder does not have to wait for the quarterly report and can check the state of a position at any moment.

Liquidity needs a careful reading, though. A token can look more liquid than the reinsurance exposure behind it, and the regulator discussed in section 7.1 flags exactly this mismatch.

## 7. Validation from the market and from regulators

A financial innovation gets little traction if regulators ignore it. Two of the clearest signals that tokenized reinsurance is being taken seriously come from a regulator and from an exchange group.

### 7.1 The Bermuda Monetary Authority (BMA)

Bermuda remains the leading domicile (legal home) for Insurance-Linked Securities (Artemis, April 2026, reporting BMA data) and is one of the global capitals of reinsurance. The European Commission treats its commercial (re)insurance regime as equivalent to Solvency II, and the NAIC has recognized Bermuda as a reciprocal jurisdiction since 2020, meaning that US regulators treat its supervision as comparable to their own.

In November 2025 the BMA published a discussion paper on asset tokenization in general, covering investments, funds, insurance, real estate and other markets. One section deals with tokenized insurance and insurance-linked securities: catastrophe bonds, collateralized reinsurance and sidecars. The document asks how such products should operate within existing regulatory frameworks. The regulator is working on the rules that let this innovation operate safely.

The paper also discusses the risks of tokenization in general: smart contract vulnerabilities, oracle risk (a contract fed inaccurate or manipulated outside data) and the danger that tokens look more liquid than the underlying asset, creating liquidity mismatches. Setting out the opportunities and the risks in the same paper is what one expects from a serious regulator.

### 7.2 LSEG

LSEG launched its Digital Markets Infrastructure platform in September 2025. It is built on blockchain technology for the issuance, tokenization, settlement and servicing of financial instruments. It started with private funds, and other asset classes are planned. Artemis reported that its first use was a fund that raises reinsurance capital.

When one of the oldest exchange groups in the world builds blockchain infrastructure for digital financial instruments, the direction for capital markets is clear. The debate has moved from whether tokenization will reach institutional markets to how fast. What it means for reinsurance in particular is still open, and it depends on which instruments the platform ends up supporting.

### 7.3 The ILS market as precedent

The Insurance-Linked Securities market is the direct predecessor of tokenized reinsurance. Outstanding catastrophe bonds reached 65.6 billion dollars at the end of June 2026, up from 61.3 billion at the end of 2025 and 49.4 billion at the end of 2024 (Artemis).

Tokenized reinsurance builds on a market that already exists and has worked for decades. It digitizes that market and widens access to it, applying blockchain technology to real problems of efficiency, transparency and access. Think of it as new plumbing in a building that is already occupied.

## 8. Conclusions: what the operating data shows

Anyone asking whether tokenized reinsurance works can find much of the answer in the numbers. Case A had written 168.8 million dollars in cumulative premiums by the third quarter of 2025, with a quarterly combined ratio of 92%. Case B is in its fourth consecutive year of token issuance. Case C runs a model that combines collateral income with underwriting. The BMA has published a discussion paper on asset tokenization, and LSEG has launched its platform.

For the insurance company, the benefits are structural: full collateralization that removes credit risk on the collateralized portion, credit for reinsurance that frees reserves, capital relief that allows growth without recapitalization, more diverse sources of capital and less operational friction. Tokenized reinsurance sits next to traditional reinsurance as one more channel.

For the asset manager, the points to weigh are a risk that is uncorrelated with financial markets, on-chain transparency and programmable liquidity, meaning liquidity that smart contracts manage under set rules. The risk is real: a hurricane can erase the result of a season and erode capital. It can be quantified and modeled, and it is independent of the other risks in a portfolio. Any decision belongs within the assessment framework of section 6.1: data, structure, custody, compliance and liquidity.

> *Whether the model works now has operating data behind it. What remains open is how each program is built. Data, structure, custody, compliance and liquidity decide whether a given program suits a given cedent or allocator.*

*Information only. Not an offer or solicitation. Nothing in this chapter is investment, legal or tax advice.*
