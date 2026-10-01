---
title: The bridge between reinsurance and tokenization
slug: the-bridge-between-reinsurance-and-tokenization
chapter: 1
description: How tokenizing reinsurance portfolios links reinsurers with on-chain capital, with the model step by step, what each side gains and the risks to weigh.
---

*Reinsurance is the insurance that insurers buy for themselves. It is a very large market that has stayed hard for outside capital to enter, while decentralized finance offers programmable settlement and open capital pools but few real assets of its own. This chapter shows how tokenizing reinsurance portfolios links the two, walks through the model step by step, and sets out what it means for reinsurers and asset managers and which risks each side has to weigh.*

## 1. Introduction: two worlds meet

Reinsurance is insurance for insurance companies. An insurer that writes thousands of policies passes part of the risk to a reinsurer, a larger and more diversified balance sheet built to absorb it. The market is worth hundreds of billions of dollars a year in gross premiums (the total premiums written, before deductions), and it is one of the pillars of financial stability worldwide. Without it, insurers could not carry catastrophe risks, large concentrations of value or the year-to-year swings in claims that come with modern insurance.

Despite that systemic importance, reinsurance has stayed a closed market for decades. It is open mainly to large institutional players, its processes are slow and the way it raises capital is still largely analog.

Over the past few years a different financial architecture has taken shape: decentralized finance, or DeFi. It is a set of financial services built on public blockchains, which are shared digital ledgers that no single party controls. DeFi offers full transparency, automation through smart contracts (programs that run by themselves once preset conditions are met), access from anywhere and settlement in moments rather than days. What it lacks is what traditional finance has in abundance: real assets, mature regulation and a verifiable track record.

Picture two riverbanks. One holds a great deal of cargo and a long tradition of carrying it. The other has fast boats and not much to load on them. This playbook looks at the bridge between the two. The idea is simple: tokenize reinsurance portfolios and turn them into digital vaults open to investors. Capital from DeFi then funds real insurance assets underwritten within regulated markets, which creates value for those who insure and for those who invest.

### 1.1 Traditional finance (TradFi)

Traditional finance, or TradFi, is the world of banks, insurers, funds and exchanges that most of us deal with every day. It brings centuries of experience and stability. Insurance and reinsurance rest on established statistical principles, chiefly the law of large numbers, which Jakob Bernoulli proved in a work published in 1713 (section 2.2 explains it). They also rest on a mature regulatory framework. Solvency II is the European Union's capital and risk rulebook for insurers, the NAIC rules come from the National Association of Insurance Commissioners, which coordinates US state regulators, and EIOPA, the European insurance supervisor, issues guidelines of its own.

Relationships between cedents (the insurers that pass risk on) and reinsurers are built over years, on trust and on "utmost good faith", the principle under which each side must disclose everything material to the other, and which governs the whole industry.

Actuarial models, the statistical models that estimate the expected cost of claims, let a reinsurer forecast losses on large portfolios with reasonable accuracy and spread the risk across several carriers. Yet reinsurance capital is still raised through traditional channels: bilateral negotiations, specialist brokers and annual renewal cycles that take months to negotiate. The system works. It is also slow, costly and narrow in who can take part.

### 1.2 Decentralized finance (DeFi)

DeFi is a different way of building financial services. It runs on public blockchains such as Ethereum, Polygon and other networks, and it offers a programmable, transparent infrastructure. Smart contracts can handle premium flows, claims and the distribution of returns without intermediaries. A vending machine is a fair picture: the rules are fixed in advance, and once the conditions are met the machine delivers, with no clerk in between.

Decentralized insurance has grown quickly, though from a small base next to the traditional market. Protocols in this segment already offer cover against smart contract exploits (attacks that take advantage of a bug in code), stablecoin de-pegging (a token meant to stay at one dollar drifting away from that price) and parametric risks tied to the real world, where cover pays out when a measured trigger, such as a wind speed, is reached.

DeFi brings speed of settlement, 24/7 operation and the transparency of every transaction on an immutable ledger, a record that cannot be altered after the fact. Above all it brings access to global capital pools without the barriers typical of the institutional world.

### 1.3 The challenge and the opportunity

The challenge is to combine the stability and regulatory discipline of the insurance world with the liquidity, speed and efficiency of blockchain. The answer explored here is the tokenization of reinsurance portfolios, a process that turns real reinsurance contracts into digital tokens. Each token represents a measurable share of risk and return and is managed through smart contracts. It can also be traded on secondary markets, the venues where investors resell what they already hold.

> *Tokenization complements reinsurance. It is a bridge that can bring in more capital and more transparency, to the benefit of both those who insure and those who invest.*

## 2. Reinsurance: fundamentals and how it works

To see what tokenization can do for reinsurance, it helps to know how reinsurance works and why the financial system leans on it.

### 2.1 Definition and purpose

> *In essence, reinsurance is insurance for insurance companies. Under a reinsurance agreement, a reinsurer takes on part of the risk that an insurer has written.* (Swiss Re, The essential guide to reinsurance)

Put simply, reinsurance is insurance for insurance companies. A primary insurer (the company that sells the policy to the customer) uses it mainly for two reasons: to limit the annual swings in claims it has to bear on its own, and to protect itself in the event of a catastrophe. No insurer could carry the cost of events such as hurricanes, earthquakes or large-scale fires without it.

The chain of risk is straightforward. The insured pays a premium to the primary insurer, which takes on 100% of the risk. The primary insurer then cedes, or passes on, part of that risk to a reinsurer under a cession contract. The reinsurer may in turn retrocede part of it to a retrocessionaire, which is simply a reinsurer of the reinsurer. The result is a chain of risk distribution that crosses several operators and geographies. Think of passing the parcel, with the difference that everyone holding it is paid to do so.

### 2.2 The law of large numbers

The mathematical foundation of the insurance industry is the law of large numbers, first proved by Jakob Bernoulli in a work published after his death, in 1713. Nobody can predict when an individual will suffer a loss, or how large it will be. But for large groups of insureds exposed to the same types of risk, and assuming each loss is a separate event, the larger the group, the closer the average loss comes to a defined and predictable value.

Thanks to this law, an insurer can predict the total expected annual claims of the whole group with reasonable accuracy, far better than it can for any single person. Expected losses are then spread across the insureds and determine the premium. Even with sophisticated probabilistic models, however, actual results can drift away from forecasts. That gap is called actuarial risk, and it is what makes reinsurance necessary.

### 2.3 Balanced and unbalanced portfolios

An insurance portfolio is called "homogeneous" or "balanced" when it holds many similar, equivalent risks. Claims then offset one another collectively, and the loss ratio (claims paid divided by premiums collected) moves very little from year to year. The motor portfolio of a large insurer comes close to this ideal: with, say, 200,000 insured cars, the law of large numbers works well.

At the opposite end are strongly unbalanced portfolios, such as nuclear or aviation insurance, where an enormous exposure rests on a relatively small number of insured objects. A single company cannot carry these risks, and they call for national and international pools. Fire, accident, liability, marine and life portfolios sit between the two extremes, each with its own reinsurance needs.

Even a homogeneous portfolio is exposed to unexpected deviations in claims experience, from random fluctuation and from the risk of change, where the underlying pattern shifts. A well-known example of the second is the surge in car thefts in Central Europe after the fall of the Iron Curtain. This is why it is advisable to reinsure portfolios that look balanced as well.

### 2.4 Forms of reinsurance

There are two forms, and the difference between them is a bit like hailing a single taxi versus holding an account with a taxi company.

Facultative reinsurance is the older form and covers individual risks. The primary insurer is free to choose which specific risks it wants to reinsure, and the reinsurer is free to accept or decline each one offered. The insurer submits a full offer, and the reinsurer decides after examining it. Facultative cover is used when the capacity of the insurer's retention (the part of the risk it keeps for itself) and of its treaty reinsurance is exhausted, or when a policy contains risks the treaty excludes.

In treaty reinsurance, the primary insurer must cede a contractually defined share of the risks specified in the treaty, and the reinsurer must accept it. Neither party can refuse an individual risk that falls within the scope of the treaty. This form covers entire portfolios of policies and is the backbone of modern reinsurance.

### 2.5 Types of reinsurance

In proportional reinsurance, primary insurer and reinsurer share premiums and claims according to a contractually defined ratio. In a quota share, the ratio is the same for all risks: if the reinsurer accepts 30%, it receives 30% of the premiums and pays 30% of the claims, much like splitting a restaurant bill in fixed proportions whatever anyone ordered. It is simple and cost-effective, but it applies one yardstick to every risk.

A surplus treaty works differently. The primary insurer retains all risks up to a given amount (the retention), and the reinsurer accepts the excess, up to a limit expressed as a multiple of the retention, called "lines". The ratio between retained and ceded risk therefore varies from risk to risk. Surplus is well suited to balancing the insurer's portfolio by capping its heaviest exposures, but it is more complex to administer.

In non-proportional reinsurance there is no predetermined ratio for dividing premiums and claims. The primary insurer bears all claims up to a defined threshold, the deductible, and the reinsurer pays the claims above that threshold, up to an agreed limit of cover. This is known as excess of loss.

Excess of loss has two main variants. WXL-R (working excess of loss per risk) can be triggered by any single claim on any single risk. Cat-XL (catastrophe excess of loss) responds only when one event involves several insured risks at once. An earthquake, for example, would trigger a Cat-XL because it damages many properties at the same time.

Stop-loss is the most complete form of protection. The reinsurer covers any part of total annual claims that exceeds the agreed deductible, whether it comes from one large loss or from the accumulation of many small and medium ones. It is the broadest protection, and the one reinsurers grant with the most caution.

## 3. The reinsurance market today

The global reinsurance market is very large. Insurers cede hundreds of billions of dollars in gross premiums to their reinsurers each year. Research firms give different totals, depending on the definitions they use.

Global reinsurance capital reached about 735 billion dollars at 30 June 2025, according to Aon's September 2025 Snapshot Guide to the Reinsurance Renewal. That capital is split between traditional rated reinsurers (reinsurers with an agency credit rating), which form the dominant component, and alternative capital sources such as Insurance-Linked Securities (ILS, financial instruments whose payout depends on insurance events), catastrophe bonds and sidecars. A small group of very large names, among them Munich Re, Swiss Re, Hannover Re and Lloyd's, writes a large share of the business.

### 3.1 Business distribution

The market divides into two major lines of business. Property and casualty (P&C) is the larger of the two and covers property damage, liability, motor, marine and aviation. Life and health is the remainder: mortality, morbidity (the risk of illness), longevity (the risk that people live longer than expected) and health risks.

By distribution channel, brokers handle the larger share of the business, thanks to their global networks, negotiating power and specialist expertise. The rest goes through the direct channel (direct writing), where insurers deal with reinsurers without a broker in between.

### 3.2 A historically closed market

Despite its size and profitability, the reinsurance market has historically been out of reach for outside capital. Traditional Insurance-Linked Securities require large minimum investments, which in practice rules out the vast majority of investors. Risk pools tied to global reinsurance have been for decades the preserve of a small number of institutional operators. It is a members' club with a very high joining fee: the doors are not locked, but few can afford to walk in.

This has created a paradox. The market's returns have historically shown low correlation with traditional financial cycles, yet very few investors can reach it. Tokenization addresses the paradox directly, by opening the reinsurance market to a broader and more diversified base of eligible investors.

## 4. How the tokenized model works

Tokenizing a reinsurance portfolio turns real reinsurance contracts into digital instruments open to investors. The model has five linked phases, each combining traditional expertise with DeFi infrastructure.

### 4.1 Phase 1: insurance operators supply the portfolios

The process starts in the real world. Insurance companies and traditional reinsurers identify the portfolios of policies to be reinsured and supply the necessary data: claims history, actuarial analyses, portfolio composition, historical loss ratio and profitability projections. These portfolios are real assets with predictable cash flows and a risk profile that can be quantified from decades of data.

Data quality matters most in this phase. The soundness of the whole tokenized model depends on the transparency and accuracy of the underlying actuarial information, and this is where the long experience of the reinsurance world does the heavy lifting.

### 4.2 Phase 2: tokenization and vault creation

Each reinsurance portfolio is turned into a digital vault on a blockchain. A vault is a programmable container that represents the whole portfolio. It is divided into tokens, each of which stands for a proportional share of the underlying risk and return. Think of a cake cut into equal slices, except that the cake is a portfolio of reinsurance contracts and each slice carries a right to its share of premiums and claims.

The vault structure defines the main parameters: the total value of the portfolio, the number of tokens issued (and therefore the unit value of each token), the exit windows for investors and the rules for distributing cash flows. All of this is written into verifiable smart contracts whose rules are meant to stay fixed once deployed.

### 4.3 Phase 3: asset managers and market makers provide capital

Investors buy vault tokens and so supply fresh capital to the reinsurance pool. They include institutional asset managers (firms that invest money on behalf of clients), market makers (firms that quote buy and sell prices to keep a market liquid) and other qualified investors. Each token bought represents a capital commitment against the underlying risk and a proportional right to the premiums collected.

For these investors, the mechanism opens an asset class that was previously out of reach, with returns that depend on insured events rather than on financial market cycles. Insurance claims do not follow stock market cycles: an earthquake in Japan or a hurricane in Florida has no link to the performance of the S&P 500. That is why tokenized reinsurance can be a useful diversification tool.

### 4.4 Phase 4: smart contracts manage the flows

Once capital is in the vault, smart contracts take over. They collect premiums from the primary insurer automatically, pay claims according to the treaty rules, distribute returns to token holders and record every cash flow as it happens.

This automation removes much of the administrative burden of traditional reinsurance. There is less need for manual reconciliations (matching two sets of records line by line), for intermediaries to move funds or for periodic reports. Every transaction is recorded on-chain, and any participant can verify it in real time. That should lower administrative costs compared with traditional off-chain processes (those handled outside the blockchain), though the size of the saving depends on the structure and on how well it connects to the insurer's systems.

### 4.5 Phase 5: the reinsurer continues its role

The traditional reinsurer keeps its place, and its role evolves. It continues to perform the functions that no smart contract can replicate: risk assessment, underwriting (deciding which risks to accept and at what price), actuarial analysis, exposure monitoring and the handling of complex claims. What changes is that it has more capital, raised faster, with risk spread more widely.

The reinsurer can also create new sources of revenue: vault management fees, actuarial valuation services for tokens and advice on structuring on-chain pools. It becomes both a risk carrier and a technology-enabled service provider.

## 5. Why it matters to an asset manager

For an asset manager or a market maker, tokenized reinsurance offers access to a return stream driven by insured events, in a market that has historically been closed, with liquidity and transparency features that are new to this sector.

### 5.1 Low correlation with financial markets

Reinsurance returns have historically shown low correlation with traditional financial markets. Correlation measures how far two assets move in step. Insurance claims are driven by natural events, accidents and other factors that have no relationship with economic cycles, interest rates or equity market volatility. When the Federal Reserve raises rates or stock markets fall, a reinsurance portfolio does not move in the same way.

For an asset manager, this can act as a natural cushion for the portfolio. Adding a tokenized reinsurance component to a strategic allocation can, depending on its size and structure, lower overall volatility. Finding uncorrelated alpha, the return a manager earns beyond what the market itself delivers, is increasingly hard. Reinsurance is one of the few asset classes that remain weakly correlated with financial markets.

### 5.2 Access to a closed market

Historically, exposure to reinsurance was available only through ILS and catastrophe bonds, with high entry thresholds and multi-year lock-ups (periods during which the money cannot be withdrawn). Tokenization fractionalizes this access. A 50 million euro vault, for example, can be split into 500 tokens of 100,000 euros each, which puts the market within reach of a much wider group of eligible investors. The global reinsurance sector holds a pool of returns that most investors have never been able to reach, and tokenization is one way to widen that access.

### 5.3 Programmed liquidity

One of the main deterrents for investors in traditional ILS is the lock-up of capital. A lock-up works like a parking garage that opens only on the owner's schedule: your car is safe, but you leave when the gate does. Tokenized vaults address this with predefined exit windows, written into the smart contract, and with the option of trading tokens on on-chain secondary markets. Multi-year lock-ups of the kind typical of insurance private equity are not part of the design.

### 5.4 Full transparency

In traditional reinsurance, investors have to rely on periodic reports and on the valuations of managers. In a tokenized vault, every cash flow (premiums collected, claims paid, returns distributed, reserves set aside) is recorded on the blockchain, and any token holder can verify it in real time. That reduces information asymmetry (one side knowing much more than the other) and can increase investor confidence.

### 5.5 What an allocator would need to assess

An allocator is the person or institution that decides how capital is spread across investments, such as a pension fund or a family office. One reviewing any tokenized reinsurance structure would want to assess five things.

The first is data: the depth and quality of the claims history, actuarial analysis and portfolio composition behind the vault. The second is structure: how the vehicle is ring-fenced (legally separated from the rest of the sponsor's business), how each token maps to the underlying treaty and which rights it carries. The third is custody: who holds the off-chain asset and how legal rights are enforced in a dispute. The fourth is compliance: how investor eligibility, KYC/AML checks (the identity and anti-money-laundering checks that financial firms run on clients) and transfer restrictions are applied. The fifth is liquidity: the design of exit windows, the depth of any secondary market and the treatment of claims that are still developing.

## 6. Why it matters to a reinsurer

Tokenization gives the traditional reinsurer a tool that adds to its existing capabilities and widens its business. The advantages are concrete.

### 6.1 More capital, faster

The traditional process of raising reinsurance capital takes months of negotiation with retrocessionaires, brokers and institutional investors, typically concentrated in annual renewal cycles, when treaties are renegotiated. With tokenization, a reinsurer can raise capital from global investors in days, drawing on DeFi and stablecoin liquidity pools directly (a stablecoin is a token pegged to a currency such as the US dollar).

Traditional relationships stay in place. Tokenization adds a complementary channel, particularly useful for opportunities that arise outside the renewal cycles and for funding a new line of business quickly.

### 6.2 Distributed risk

The founding principle of reinsurance is the distribution of risk, the same principle that reinsurers such as Swiss Re have applied for generations, spreading risk across many countries and many lines of business. Tokenization takes that principle a step further by splitting exposure among hundreds of investors instead of concentrating it in a few retrocessionaires.

A 50 million euro vault with 500 tokens means up to 500 risk participants, each with an exposure of 100,000 euros. This lowers concentration risk and is meant to make the system more resilient.

### 6.3 Operational efficiency

Managing traditional reinsurance carries significant administrative costs: manual reconciliations, document exchange, bordereau handling, commission calculation and periodic reporting to retrocessionaires. A bordereau is the periodic report on premiums and claims that the primary insurer sends to the reinsurer. Smart contracts can automate much of this work, which should bring administrative costs down.

The blockchain also provides a single source of truth for all parties. When everyone reads the same record, there are fewer disputes over whose spreadsheet is right, and settlement times can shrink considerably.

### 6.4 New sources of revenue

Tokenization opens revenue streams for the reinsurer beyond core risk transfer. Vault management fees produce recurring income in proportion to the capital managed. Actuarial valuation services for structuring tokens are a high value-added advisory offering. Explaining the risk profile to investors creates further chances to work with them.

The reinsurer thus moves from pure risk carrier toward an integrated platform for risk transfer and asset management.

## 7. The bridge between TradFi and DeFi

The model described in this playbook combines traditional and decentralized finance. It is a bridge between two worlds, built to draw on the strengths of each.

### 7.1 What TradFi brings

Traditional finance supplies what a financial product needs before institutions will take it seriously: real portfolios with a verified claims history and deep actuarial data, and risk assessment and underwriting skills built up over centuries. It also supplies regulatory compliance within globally recognized frameworks such as Solvency II and the NAIC rules, along with the reputation and institutional trust that only operators with decades of track record can offer.

### 7.2 What DeFi brings

Decentralized finance contributes the technology infrastructure that makes innovation possible. Scalable, secure blockchains act as a transparent ledger that cannot be rewritten after the fact. Programmable smart contracts automate the management of flows and rules. Global capital pools are open 24/7, without geographic or bureaucratic barriers. Every participant can verify every transaction in real time.

### 7.3 The meeting point: tokenized vaults with compliance built in

The meeting point between the two worlds is the tokenized vault, a hybrid structure in which digital capital funds real insurance assets. Each vault is built on a real reinsurance portfolio with verified actuarial data and is managed through smart contracts on a blockchain, with programmed liquidity and native transparency.

Compliance is enforced in the technology layer: ERC-3643 identity and whitelist checks, KYC/AML and an institutional perimeter. ERC-3643 is a token standard that lets a token check who is buying it before a transfer goes through. The whitelist is the list of approved participants, and the institutional perimeter limits participation to eligible institutional investors. The aim is products that pair the compliance standards of insurance with the efficiency of the blockchain, inside the rules.

The wider market is moving too. Regulators in several markets are still working out how tokenized assets fit existing rules, and some infrastructure providers are building blockchain-based systems for issuance and settlement. Reinsurers and investors that follow these developments early may gain a competitive edge as the market develops.

## 8. A simplified numerical example

To make the model concrete, consider a simplified example of how a 50 million euro reinsurance portfolio is tokenized and opened to investors. The figures are illustrative and do not describe any actual vault.

### 8.1 Vault structure

The reinsurance portfolio is worth 50,000,000 euros. It is a property and casualty portfolio with a historical loss ratio of 60% and an average contract duration of 12 months.

The portfolio is divided into 500 tokens with a nominal value of 100,000 euros each. Each token represents a proportional share of the underlying portfolio and carries a right to a proportional share of the premiums collected, net of claims paid.

That gives each token 0.2% of the vault's net result, which is premiums collected minus claims paid and operating costs. The result depends on actual claims experience, and it can come in lower than planned or turn negative. Its main driver is the frequency and severity of insured events.

### 8.2 The asset manager's perspective

An asset manager that buys 10 tokens, an investment of 1,000,000 euros, holds 2% of the vault. It is exposed to 2% of a diversified reinsurance portfolio, with a result that depends on insured events rather than on equity, bond or crypto markets. Where a secondary market is available, tokens can be traded on-chain in predefined windows in place of multi-year lock-ups. On-chain transparency lets the manager follow premiums and claims in real time.

### 8.3 The reinsurer's perspective

For the reinsurer, the 50 million euros are raised on-chain in days rather than after months of negotiation with retrocessionaires. Risk is spread across up to 500 investors instead of being concentrated in a few operators. Beyond core risk transfer, the reinsurer earns additional revenue through vault management fees and through performance fees on results above expectations.

The example is simplified, but the mechanics hold: digital capital funds a real insurance asset, and value is shared between both parties in a transparent, programmable structure.

## 9. Risks and considerations

Every innovation brings risks that have to be understood and managed, and tokenized reinsurance is no exception. Knowing them is the first line of defense. Any bridge needs regular inspections.

### 9.1 Technical complexity

Tokenization requires reliable blockchain infrastructure, specific skills in smart contract development and integration with the actuarial and management systems that insurers already run. This can be a real barrier, especially for smaller reinsurers that may not have the resources to invest.

### 9.2 Regulatory uncertainty

In most jurisdictions the framework for tokenized assets is still being defined. The Financial Stability Board, the international body that monitors the global financial system, has published recommendations for the regulation of crypto-assets. Even so, considerable uncertainty remains about how reinsurance tokens will be treated under existing rules in different countries.

### 9.3 Smart contract risk

Smart contracts, however well tested and verified, can contain bugs or vulnerabilities. Oracle price feeds (services that carry outside data, such as prices, into a smart contract), redemption mechanisms and the logic that splits ownership into fractions are all potential points of failure or manipulation. Rigorous code audits, specific cyber insurance and governance mechanisms for handling emergencies are essential parts of any credible tokenized structure.

### 9.4 Custody and the on-chain and off-chain link

Perhaps the most delicate challenge is the link between the digital token and the real asset behind it. Someone has to hold the asset off-chain, which is what custody means. There has to be a way to show that the token really represents a share of the reinsurance portfolio. Legal rights have to be enforceable in a dispute. Meeting these requirements takes sound legal structures and reliable custody mechanisms that connect the digital world with the off-chain one.

### 9.5 Multiple jurisdictions and adoption

A tokenized vault can involve an insurance portfolio in Europe, investors in Asia and a token issuer in a third jurisdiction. Cross-border compliance is complex and needs specialist legal expertise in several legal systems.

Tokenization is also new to many insurers. Resistance to change, unfamiliarity with blockchain and security concerns can slow adoption. Education and transparency help, and so do concrete examples that show the structure working.

## 10. Market examples in 2025

By 2025, tokenized reinsurance had moved beyond academic papers and conference slides: several operators are building and running structures that link digital capital to real reinsurance portfolios. Three examples follow, described by what they do.

### 10.1 A tokenized reinsurance protocol on a public layer 1

One on-chain reinsurance platform, built on a public layer 1 (a base blockchain that runs on its own rather than on top of another network), has recently expanded the capital available to it ahead of the 2026 renewal season. Its on-chain capital structure is designed to give counterparties detailed visibility into the underlying risks and the collateral. The capital supports existing relationships as well as new placements under negotiation. Demand comes from insurers looking for additional capacity options and from capital providers seeking risk-adjusted returns (returns judged against the risk taken) through reinsurance-linked structures.

### 10.2 A listed reinsurer that tokenizes reinsurance contracts

A publicly listed reinsurer, through a dedicated subsidiary, tokenizes real reinsurance contracts and offers them to digital investors. Because it is a listed company, it operates under full regulatory supervision, which adds to its appeal for investors. Its focus is Florida catastrophe risk, a line in which reinsurance takes a large share of every premium dollar. Its management has said that tokenization brings new capital into the insurance ecosystem and gives investors access to an asset class that was previously closed to them.

### 10.3 An on-chain reinsurance platform built on Solana

Another on-chain reinsurance platform, built on Solana, has launched a tokenized yield model in which the value of its token is tied to the capital deployed on the platform and reflects the underlying underwriting activity. The launch coincides with a pickup in on-chain capital market activity, driven by growing stablecoin adoption and demand for low-volatility yields.

### 10.4 The DeFi insurance ecosystem

Alongside the players focused on tokenized reinsurance, decentralized insurance is maturing. The larger protocols are cover pools, in which participants put up capital to back protection against smart contract exploits, exchange hacks and governance attacks (attempts to seize control of a protocol's voting rights). Some position themselves as insurers that link the efficiency of blockchain with traditional insurance practice. Others offer multi-chain cover across several networks.

## 11. Conclusions

Reinsurance is one of the invisible pillars of global financial stability. Without it, insurance companies could not cover the catastrophe risks that allow modern society to function, from buildings in large cities to aircraft fleets, from power plants to digital infrastructure. Yet for decades this market has remained closed, slow and analog, open to a small group of institutional operators.

Tokenization changes the terms. It complements traditional reinsurance, can make it more efficient and opens it to a broader capital base. The reinsurer keeps its role as risk assessor and underwriter, and gains access to faster capital, better distributed risk and new sources of revenue. The asset manager gains access to a market that has been exclusive, with returns that depend on insured events, on-chain transparency and programmed liquidity.

The risks are real: technical complexity, regulatory uncertainty, custody challenges and adoption. Still, the operators active in 2025, from tokenized reinsurance protocols to a listed reinsurer, show that the model can be operated. Rule makers are working on the frameworks, infrastructure providers are building, and some capital is already flowing.

> *Tokenization complements reinsurance. It is a bridge that can bring in more capital and more transparency, to the benefit of both those who insure and those who invest.*

Reinsurers and investors that engage early may have a say in shaping the rules of the market. The connection between TradFi and DeFi now exists in working form on several fronts, and each cedent and each allocator will set its own timing.

## Glossary

The main technical terms in this playbook, in plain words. Read the half you know as a refresher and the other half as a translation.

### Insurance and reinsurance terms

| Term | In plain words |
| :- | :- |
| Reinsurance | Transfer of part of the risks a primary insurer has assumed to a second operator, the reinsurer. Insurance for insurance companies. The reinsurer has no direct relationship with the final insured. |
| Cedent (ceding company) | The primary insurer that passes on, or cedes, part of its risks to a reinsurer. |
| Retention | The share of risk the primary insurer keeps for its own account. Below this threshold, the insurer bears the whole claim. |
| Retrocession | The reinsurance of reinsurance. A reinsurer passes part of the risks it has taken on to another reinsurer, the retrocessionaire, which builds a multi-level chain. |
| Quota share | Proportional reinsurance in which the reinsurer takes a fixed percentage of every risk in the portfolio. At 30%, it receives 30% of the premiums and pays 30% of the claims, on every policy. |
| Surplus | Proportional reinsurance in which the reinsurer takes only the part of a risk above the insurer's retention. Unlike quota share, the ratio changes from risk to risk. |
| Excess of loss (XL) | Non-proportional reinsurance in which the reinsurer steps in only when a claim exceeds a set threshold, the deductible. Variants exist for single risks (WXL-R) and for catastrophe events (Cat-XL). |
| Cat-XL (catastrophe excess of loss) | Non-proportional cover that responds when a single catastrophic event, such as an earthquake, hurricane or flood, causes claims on several insured risks at the same time. |
| Stop-loss | The broadest form of non-proportional reinsurance. The reinsurer covers any part of total annual claims above the agreed deductible, whatever the cause, so it protects the result for the year. |
| Loss ratio | Claims paid divided by premiums collected, usually shown as a percentage. At 60%, every 100 euros of premiums collected means 60 euros paid out in claims. |
| Underwriting | Evaluating, selecting and pricing the risks an insurer or reinsurer agrees to take, which means analyzing data, estimating how likely and how severe claims will be, and setting the premium. |
| Bordereau | A detailed report the primary insurer sends the reinsurer at regular intervals, with premiums collected, claims paid and other accounting data on the contract. |
| ILS (Insurance-Linked Securities) | Financial instruments whose return is tied to insurance events rather than to ordinary market factors, such as catastrophe bonds, sidecars and collateralized reinsurance. They carry insurance risk into the capital markets. |
| Catastrophe bond (cat bond) | A bond whose principal, coupon or both are at risk if a predefined catastrophe occurs, for example a Category 4 or higher hurricane in Florida. If the event does not occur, the investor typically receives a return above market rates. |
| Solvency II | The European Union directive that sets capital and risk management requirements for insurers and reinsurers. It is the main insurance regulatory framework in Europe. |
| NAIC | The National Association of Insurance Commissioners, the US body that coordinates policy among the individual states and sets standards for solvency and reporting. |
| Actuarial risk | The risk that actual claims turn out very different from what actuarial models predicted, through random fluctuation, shifting trends or errors in estimating parameters. |
| Utmost good faith (uberrima fides) | A basic principle of insurance law: both parties must disclose all material information that could influence the other side's decision. |

### Blockchain and DeFi terms

| Term | In plain words |
| :- | :- |
| Blockchain | A distributed digital ledger in which transactions are grouped into blocks linked cryptographically. Every participant can verify transactions without a central authority, and past records cannot be quietly edited. |
| DeFi (decentralized finance) | Financial services built on public blockchains that run without centralized intermediaries: lending, borrowing, trading, insurance, all operated through smart contracts. |
| TradFi (traditional finance) | A colloquial name for the traditional financial system: banks, insurers, investment funds, stock exchanges and everyone else working inside centralized, regulated structures. |
| Smart contract | A program stored on a blockchain that runs by itself when predefined conditions are met. In reinsurance it can collect premiums, pay claims and distribute returns automatically. |
| Token | A digital unit recorded on a blockchain that represents a right, an asset or a value. In tokenized reinsurance, each token stands for a proportional share of a portfolio and the cash flows that go with it. |
| Tokenization | Converting a real asset, here a reinsurance portfolio, into digital tokens on a blockchain. Each token is a fraction of the underlying asset and can be transferred, traded or held digitally. |
| Vault | A smart contract that pools capital from several investors and manages it under programmed rules. In this playbook, the digital container that represents an entire tokenized reinsurance portfolio. |
| Stablecoin | A cryptocurrency pegged to a stable asset, typically the US dollar (USDC and USDT are examples). DeFi uses it as a unit of account and a means of payment, without the price swings of other cryptocurrencies. |
| Oracle | A service that feeds data from the outside world to smart contracts, such as information on catastrophe events or weather that triggers automatic payments. |
| On-chain and off-chain | On-chain is anything recorded directly on the blockchain, which makes it visible and hard to alter. Off-chain is activity or data that lives outside it, in the traditional world. |
| Settlement | The final step of a transaction, when funds or assets actually change hands. On a blockchain it is close to instant, while in traditional markets it can take days. |
| Secondary market | A market where investors buy and sell instruments already issued. For reinsurance tokens, it lets investors trade their shares without waiting for the contract to expire. |
| Yield | The return an investment generates, usually shown as an annual percentage of the capital invested. In tokenized reinsurance it comes from premiums net of claims and operating costs, so it can be low or negative in a year with heavy claims. |

### General financial terms

| Term | In plain words |
| :- | :- |
| Asset class | A category of financial instruments with similar traits in risk, return and market behavior, such as equities, bonds, real estate and commodities. Tokenized reinsurance can be seen as an emerging alternative asset class. |
| Decorrelation | Little or no statistical correlation between the returns of two assets. Reinsurance returns have historically shown low correlation with financial markets because they depend on insurance events rather than on economic or market factors. |
| Asset manager | A firm or professional that manages investments for institutional or private clients within an agreed mandate and risk profile. |
| Market maker | An operator that supplies liquidity by committing to buy and sell an instrument continuously, earning on the gap between the buying price (bid) and the selling price (ask). In DeFi, smart contracts can do the job. |
| Lock-up | A period in which an investor cannot redeem or sell an investment. In private equity funds and traditional ILS, lock-ups can run for years. Predefined exit windows and secondary markets are designed to ease that restriction. |
| RWA (real-world assets) | Assets from the traditional economy, such as real estate, receivables, commodities or, here, insurance portfolios, that are tokenized and made available on a blockchain. It is one of the ways TradFi and DeFi are meeting. |
| Risk-adjusted return | The return on an investment after taking into account the risk run to earn it, which makes different investments comparable. A lower return with low volatility can beat a higher return with high volatility once risk is counted. |

*Information only. Not an offer or solicitation. Nothing in this chapter is investment, legal or tax advice.*
