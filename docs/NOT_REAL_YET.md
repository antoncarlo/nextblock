# What is not real yet

One register of everything in the project that is a test fixture, a stand-in, or simply not
connected, with what it would take to close each. It is kept honest by being short and by being
checked against the chain, the database and the code on the date below. Last full check:
**2026-10-05**. If you make something real, move it out of this file in the same change.

"Testnet" is not on this list. The protocol runs on Base Sepolia with Circle's testnet USDC; that
is what it is, and the interface says so in those words and no others.

## 1. Closed

| What was not real | How it was closed |
|---|---|
| The screening provider defaulted to a fixture that answers "clear" to everyone | Refused on production. Entities are screened against the official OFAC SDN, OFAC consolidated and UN lists; wallets against Chainalysis's public sanctions oracle on Base |
| All 49 screening runs in the audit log (42 entities, 7 wallets, July to October 2026) came from that fixture | Migration `0018_screening_evidential` (applied 2026-10-05): the rows are kept, marked `evidential = false`, and a trigger keeps any fixture run that way. The two cedant APIs that report screening status read only evidential runs, so a fixture run can no longer show as "screened" |
| E-mail "sent" by a console logger | Production reports "not sent" until a real provider is configured |
| The AI assessor drafted assessments from a fixture | Refused on production; idle until Braino is connected |
| The admin page opened for two addresses written into the bundle; two wallets greeted by name | Removed. The gate is the on-chain roles or an authorised admin e-mail |
| Wallet configuration accepted Ethereum Sepolia and Arc Testnet with the addresses of old demo deployments | Base only |
| A "Get Test USDC" button calling `mint` on Circle's USDC, which cannot work | Links to Circle's faucet |
| Landing figures with no source, a correlation table with no source | Replaced by Gallagher Re's full-year 2025 numbers with the link; the table by what drives each return |
| Invented company names as form hints; "Demo Viewer"; "demonstration purposes"; "Pilot" | Neutral hints; the words are gone, it says testnet |
| "simulated or illustrative" in the terms of use | Now says the application runs on the testnet and amounts have no monetary value (counsel to review the wording) |
| The nightly invariant campaign had not run for at least ten days (agent-simulation failed at its smoke step every night since 2026-09-26) | Path resolution fixed in `packages/sim`; Foundry pinned like the pull-request workflow |

## 2. Open, and only the owner can close it

| What | Evidence | How to close |
|---|---|---|
| The seven operational roles are held by simulation identities (curator, sentinel, committee, KYC operator, allocator, oracle, cedant) | read from ProtocolRoles on 2026-10-05 | Fill `contracts/roles.rotation.template.json` with the real operators' addresses, run `node scripts/prepare-role-rotation.mjs --plan <file>`: it simulates every call as the Safe and writes two batches (grant, then revoke) for the Safe to sign. `--check` confirms afterwards |
| `MockOracle` (a fixture with a BTC price of 85 000 and a flight flag) is deployed, referenced by `InsuranceVault.oracle`, and read by nothing; the deployer EOA still owns it and could change its price | `oracle()` of the vault; no contract calls it; `owner()` is the deployer | Disarm it now: from the deployer key, in PowerShell with the key loaded into `$env:PRIVATE_KEY` as for the other deployer commands, `cast send 0x6D65110bc8de553d5B59e6C2B0a5fDC1D91F5677 "renounceOwnership()" --rpc-url $env:BASE_SEPOLIA_RPC_URL --private-key $env:PRIVATE_KEY` (simulated: it succeeds). It then has no owner and its price is frozen. Removing it altogether needs the next generation, see section 4 |
| Eight KYB applications, all approved: one labelled fictitious, the others the owner's own test entries; one offering-terms row for the previous generation's vault `0x47b1…` | database | Tell me which to keep. To remove the fictitious application and the stale terms: `delete from public.kyb_review_events where application_id = 'ee6262f8-8a5d-4eff-b371-d0067de03407'; delete from public.kyb_applications where id = 'ee6262f8-8a5d-4eff-b371-d0067de03407'; delete from public.vault_offering_terms where vault_address = '0x47b1f34b1aa2683ebd0bc3a5d0f8507af064bca3';` (check for dependants first) |
| The approved applications have no screening run that proves anything | database | Run the workflow *scheduled-jobs* by hand: its re-screening job screens every approved application with the real providers and writes evidential runs; the one-word names `CARL` and `Carl` will be held for Sentinel review, because they equal an OFAC entry |
| The Safe's third owner `0x312e…3b35` has never signed | transaction service | Sign any harmless transaction with it, or replace it |
| The Alchemy key for the site's RPC was returned by a public endpoint and printed in public logs | health responses and Actions logs before 2026-10-05 | Regenerate it, update `BASE_SEPOLIA_RPC_URL` on Vercel and GitHub, redeploy, delete the old key; give NextBlock its own provider account |
| Product claims on the documentation site and in the blog that the owner must stand behind: a target net yield of 6 to 10% a year described as "illustrative", a minimum cession of about $5m, an issuance cost under $75k | `app/public/docs/index.html`, `app/content/blog` | Keep them only if they are the real targets, worded as targets; otherwise remove them. About 50 other figures in the blog are attributed to named sources (Artemis, Gallagher Re, NAIC, Aon, public filings) and were not re-verified here |

## 3. Open, and needs someone else

| What | What it is | What it needs |
|---|---|---|
| NAV, risk score, claim assessment | Advisory figures from Braino.ai / WAVENURE. Built and idle: nothing is produced by an AI today | Sandbox URL, signing secret and fixtures from the vendor; `docs/AI_INTEGRATION.md` |
| KYC with a licence | Identity checks on the people behind each applicant, done by a regulated provider that stands behind the result | A contract with such a provider and a webhook from it to the KYC operator role; until then KYB is a manual review |
| PEP and adverse media | Politically exposed persons and negative news about an applicant. Datasets are commercial: OpenSanctions' data is free only for non-commercial use, and a business pays a licence or per query | A licence or an account with such a provider, wired in as a screening provider (the adapter slot exists) |
| E-mail | A sending account | A Resend account and a verified domain |
| The legal wrapper and the risk underneath | The vehicle that holds the treaty, and a treaty to hold | Counsel and a cedant; no code makes this real |

## 3b. Open, and buildable without anyone's permission

| What | State today | What it takes |
|---|---|---|
| UMA with bonds | `BordereauOracle` is a stand-in: it has a liveness window and a dispute path but holds no funds and posts no bond. UMA's Optimistic Oracle V3 **is deployed on Base Sepolia** at `0x0F7fC5E6482f096380db6158f978167b57388deE`, and **Circle's USDC is on its bond whitelist** (checked on-chain 2026-10-05); on Base mainnet it is at `0x2aBf1Bd76655de80eDB3086114315Eec75AF500c` | A contract that calls `assertTruth` with a USDC bond and receives `assertionResolvedCallback`, with tests against the real oracle on a Base Sepolia fork. No account, no vendor: it ships with the next deployment |
| EU and UK sanctions lists | The official EU consolidated list (about 26 MB XML) and the UK Sanctions List (about 22 MB XML) are public and free, like the OFAC and UN lists already in use | Not built yet. Parsers for the two formats, and a daily snapshot of the names so that a cold start does not download and index about 60 MB on every serverless instance |

## 4. Deferred to the next deployment, because it changes a deployed contract

- Remove `MockOracle` from `InsuranceVault` (the `oracle` field and the `p.oracle` initialiser
  parameter), `VaultDeployer`, `VaultFactory` and `DeployStack`, with the tests that construct it;
  regenerate the ABIs and the subgraph.
- Rename `DataSource.MOCK_ORACLE` in `NextBlockLens` to a name that says what it is (an oracle-fed
  figure), and drop the word "mock" from the NatSpec of `AIAssessor`, `NavOracle`, `ComplianceRegistry`,
  `PortfolioRegistry`, `BordereauOracle`, `ClaimManager`, `InsuranceVault`, `VaultFactory` and `NavShareOracle`.
- Editing those comments in place would change the metadata hash of contracts already deployed and
  verified, so it waits for the generation that redeploys them anyway.
