# Connecting the AI (Braino.ai / WAVENURE)

Status: **the NextBlock side is built and tested; the vendor side is not connected.**
Nothing on the site or on-chain is produced by an AI today, and nothing pretends to be.
Vendor contract: [`contracts/docs/integrations/braino-oracle-spec.md`](../contracts/docs/integrations/braino-oracle-spec.md).

## 1. What exists

| Spec service | NextBlock side | State |
|---|---|---|
| S1 Vault NAV | `app/src/lib/braino/client.ts` (`fetchNav`), keeper `app/scripts/nav-keeper.ts`, workflow `.github/workflows/nav-keeper.yml` | built, idle until `BRAINO_BASE_URL` is set |
| S2 Portfolio risk | `assessPortfolioRisk` in the same client (HMAC, bounds, `documentHash` cited in the report) | client built; no scheduled job (the curator's dossier flow is wired with the vendor in phase P1) |
| S3 Claim assessment | `BrainoAIAssessor` (`app/src/lib/ai-assessor/provider.ts`), cron `POST /api/ai/refresh`, reviewer publishes from `/app/admin/ai-assessments` | built, idle until `AI_ASSESSOR_PROVIDER=braino` |
| S4 Allocation, S5 Analytics | not built | the spec stages them after S1–S3 (phases P3, P4) |

How a response is trusted, in order: the `X-Braino-Signature` HMAC over the **raw** body
(before parsing) → the common envelope → the service's own bounds (scores in [0,1], amounts as
decimal strings with at most 6 decimals, the five claim criteria all present, a recommended
amount never above the request, NAV positive, in USDC and not older than 15 minutes) → only then
a draft or a publish. Anything else is refused and nothing is written. The on-chain hash is
`keccak256(canonical_json(report))` of the vendor's own `report` (spec §5), so a disputed number
can be matched to the report the vendor must retain for seven years. The exact bytes received are
stored with each claim draft.

Authority does not change: the AI is advisory. `AIAssessor` cannot approve or pay; the Claims
Committee and the dispute window still decide. `NavOracle` keeps its staleness (24 h), deviation
(20 %) and minimum-confidence (50 %) guards, and the Sentinel can pause a feed.

Until the vendor is connected: `/api/ai/refresh` answers `configured: false` and drafts nothing,
because the mock provider is refused on production. The NAV job does not run.

## 2. What the vendor must give us

From the spec: a **sandbox base URL**, the **HMAC secret** and a **fixture set** (20 claims for P1).
Three points the spec leaves open and the client assumes. Confirm them in the first call:

1. **Request authentication.** The spec signs responses only. The client sends
   `Authorization: Bearer <BRAINO_API_KEY>` when that key is set. If the vendor wants something
   else, it is one line in `brainoPost`.
2. **Amounts in requests** are decimal USDC strings with six decimals (`"60000.000000"`), the same
   form the vendor uses in responses.
3. **Evidence.** The client sends the on-chain `evidenceHash` for each claim. The vendor's model
   analyses documents at short-lived signed URLs (spec §4), and NextBlock does not mint those yet,
   because it depends on where the cedant's documents are stored. Until it does, an assessment
   can only reason over the hash and the portfolio terms, and its confidence should say so.

## 3. Going live

**A. A key for the node** — in your own PowerShell, so the key never leaves your machine. It
writes the key to a file and prints only the address:

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
$k = "0x" + ([BitConverter]::ToString($b) -replace '-','').ToLower()
Set-Content -Path "$HOME\nb-oracle.key" -Value $k -NoNewline
cast wallet address --private-key $k; $k = $null
```

Send a small amount of Base Sepolia ETH to that address. Never paste the key anywhere, in chat or
in a ticket.

**B. Preflight** (read-only) with that address:

```bash
node --experimental-strip-types app/scripts/ai-preflight.ts --publisher 0xNODE_ADDRESS
```

It simulates the grant as the Safe and prints the exact Safe transaction (`To`, `Value 0`, `Data`).
Run that from the Safe → Transaction Builder → Custom data. Run the preflight again: section 3
must say the node holds `ORACLE_ROLE`.

**C. Secrets and variables.**

| Where | Name | Value |
|---|---|---|
| GitHub variable | `BRAINO_BASE_URL` | the vendor's https base URL (this switches the 15-minute schedule on) |
| GitHub secret | `BRAINO_HMAC_SECRET` | the shared secret |
| GitHub secret | `BRAINO_API_KEY` | only if the vendor issues one |
| GitHub secret | `ORACLE_PRIVATE_KEY` | the contents of `nb-oracle.key` |
| Vercel env | `AI_ASSESSOR_PROVIDER` | `braino` |
| Vercel env | `BRAINO_BASE_URL`, `BRAINO_HMAC_SECRET`, `BRAINO_API_KEY` | same values as above |

Redeploy on Vercel after the env change. The admin system-status page then shows the AI provider
as ready.

**D. First runs.** In Actions → nav-keeper → *Run workflow* with *dry run* ticked: it fetches,
verifies and prints what it would publish for each vault. Untick it for the first real publish,
then confirm with the preflight (section 4) and on the vault page. A vault with no assets and no
shares is skipped: there is no NAV to attest until the first deposit.

**E. Acceptance** is the spec's own (§8): P1 twenty fixture claims with deterministic outputs and
retrievable reports; P2 a seven-day soak with no staleness breach and the deviation guard never
tripped by noise.

## 4. Switching it off, and what turns red

- **Stop everything:** clear the GitHub variable `BRAINO_BASE_URL` (the schedule skips) and set
  `AI_ASSESSOR_PROVIDER` back, or remove it (production then idles).
- **Stop one feed on-chain:** the Sentinel calls `pauseFeed(vault)`.
- **Remove the node:** from the Safe, `revokeRole(ORACLE_ROLE, node)`. The preflight prints the
  transaction when given `--retire`.
- **The keeper turns the run red, and e-mails the owner,** when a figure is withheld because it
  moved more than the deviation guard allows or the feed is paused (a Sentinel must review: it
  calls `acknowledgeDeviation(vault)`, and the next run publishes), or when the vendor fails or
  answers with something that does not verify. It never retries silently and never publishes past
  a guard.

## 5. The simulation identity

`0x899b…Ecd` holds `ORACLE_ROLE` today. It is the identity the agent simulation uses from the
redeploy, not a production node. Retire it from the Safe once the real node is publishing, not
before: the simulation stops publishing when it goes.

## 6. Known limits

- S2 has a client but no scheduled job; S4 and S5 are not built.
- Claim descriptions are empty: nothing on-chain carries the cedant's narrative.
- `/api/ai/refresh` looks at the 100 oldest claim events; past 100 unassessed parametric claims
  it would need a cursor. Not reachable on a testnet.
- The sandbox is the first time the three assumptions in section 2 meet the real service.
