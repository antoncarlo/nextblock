---
title: Cat bond lock-ups are deliberate, and they have a price
slug: cat-bond-lock-ups-continuous-nav
date: 2026-08-30
description: Why catastrophe bond capital stays tied up for years, what that costs an allocator, and what a continuously updated NAV changes and leaves alone.
category: Market notes
tags: [cat bonds, ILS, reinsurance, ERC-4626, NAV]
---

A cat bond investor gets their money back on the sponsor's schedule, not their own. A cat bond, short for catastrophe bond, is a security that gives an insurer or reinsurer (the sponsor) cover against natural disaster losses, paid for by investors who put up the capital and earn a return for carrying the risk.

## Why the lock-up exists

The typical structure runs three to five years of risk period, with extension provisions on top. There is also a secondary market, where investors can sell before maturity. It works for the large 144A names (bonds sold under the US rule that lets big institutions trade privately placed securities among themselves) and thinly for everything else.

That is deliberate. The capital has to sit there for the cover to be real. Picture a parking garage whose barrier lifts on the owner's timetable: you chose the garage, but you do not choose when the car leaves.

## What the lock-up costs

The cost shows up somewhere else. An allocator, meaning the institution that decides how a portfolio is split across asset types, sizing a reinsurance sleeve (the slice set aside for that asset) prices illiquidity into the return they demand. Illiquidity is the difficulty of selling quickly at a fair price, and investors charge for it.

A treasurer who might have put money to work for eighteen months does not participate at all.

## What a continuous NAV changes

A vault built on ERC-4626 changes the accounting of that problem. ERC-4626 is a common technical standard for tokenized vaults, which hold assets and issue shares against them. Positions carry a NAV, the net asset value per share, that updates continuously against the underlying portfolio instead of being marked at quarterly intervals.

Redemption becomes a function of what the vault holds and what the ring-fenced structure permits, rather than a fixed multi-year calendar. Ring-fenced means the assets behind a position sit in a separate pot, apart from everything else.

The risk period stays as long as it was, because losses still develop over years. What changes is that the position can be valued and transferred while they do.

NextBlock RWA's V1 runs on Base, Coinbase's layer 2, in testnet.

> **In plain words:**
>
> A cat bond keeps your money tied up for years because the cover only works if the money stays. A vault that reprices continuously cannot shorten those years. It can tell you what your position is worth on any given day, and it makes handing that position to someone else practical.

*Information only. Not an offer or solicitation.*
