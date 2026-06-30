# Real Provider Integration — NAV / AI / Bordereau (adapter seams)

**Author:** Anton Carlo Santoro
**Status:** integration spec. The mock adapters are live; swapping in real providers is
owner-gated (accounts, endpoints, keys). This documents the seam, the on-chain authority
boundary, and the go-live steps for each.

## Authority boundary (non-negotiable)

AI and oracles are **advisory**. They inform decisions but never hold unlimited business
authority: every value they produce is gated by an on-chain role + a human/timelock step.
A real provider only changes WHERE the data comes from, never WHO can act on it.

| Advisory input | On-chain authority that consumes it | Boundary |
|---|---|---|
| NAV | `NavOracle` (ORACLE_ROLE publishes); vault NAV formula is independent | stale/deviation guard blocks bad feeds; Sentinel can pause feed |
| AI assessment (SCR/IBNR/loss ratio) | `AIAssessor` (stored), `ClaimManager` reads it | advisory only; Claims Committee approves, dispute window enforced |
| Bordereau / premium assertion | `BordereauOracle` (UMA OOv3-style) | liveness + dispute path; Sentinel can dispute |

## 1. NAV — signed attestation provider (Braino.ai / off-chain signer)

- **Seam:** `NavOracle.publishNav(vault, nav, deviationBps, sourceHash)` — caller holds ORACLE_ROLE.
- **Real provider:** a dedicated off-chain signer key (held by Braino.ai or the protocol oracle
  node) is granted ORACLE_ROLE via the Safe/timelock. It publishes NAV on a cadence; the tx
  signature IS the attestation.
- **Hardening (recommended):** verify an EIP-712 NAV attestation on-chain so the publishing key
  and the data-signing key can differ (publisher relays, signer attests). Add a `verifyNavSig`
  step in a thin adapter in front of `publishNav`.
- **Env / keys (owner):** `ORACLE_SIGNER_KEY`, `BRAINO_NAV_ENDPOINT`. The signer address must be
  granted ORACLE_ROLE.
- **Go-live:** grant ORACLE_ROLE to the signer → run the publisher on a schedule → confirm the
  staleness window + deviation guard reject a missing/anomalous feed (Sentinel `pauseFeed` covers
  the anomaly case).

## 2. AI assessment — Braino.ai provider (backend already pluggable)

- **Seam:** backend `AIAssessorProvider` interface — `Mock` (deterministic, dev/CI) + `Braino`
  placeholder (fail-loud) already exist. On-chain: `AIAssessor.publishAssessment` (reviewer-signed,
  via Sentinel/Safe).
- **Real provider:** implement the `Braino` provider against the real endpoint; the backend
  produces a draft assessment, a reviewer (Sentinel) publishes it on-chain. No server-side private
  key signs business actions — the reviewer signs.
- **Env / keys (owner):** `AI_ASSESSOR_PROVIDER=braino`, `BRAINO_API_KEY`, `BRAINO_ASSESS_ENDPOINT`.
- **Go-live:** set the provider env on the backend → reviewer publishes via the existing
  `/app/admin/ai-assessments` flow → confirm the claim path still enforces window + committee.

## 3. Bordereau — UMA OOv3 assertion

- **Seam:** `BordereauOracle` (assert + liveness + dispute); Sentinel `disputeAssertion`.
- **Real provider:** wire the UMA Optimistic Oracle V3 on Base for premium/bordereau assertions
  with a bonded liveness window; disputes route to UMA's DVM.
- **Env / config (owner):** UMA OOv3 address on Base, bond currency (USDC), liveness seconds.
- **Go-live:** configure the OOv3 address + bond → assert a bordereau → confirm the dispute path
  resolves before any dependent payout.

## Shared go-live checklist

1. Roles granted to provider keys **via the Safe/timelock**, never the deployer EOA.
2. Each provider has a **kill switch**: Sentinel `pauseFeed` / `disputeAssertion` / freeze claim.
3. Mock providers remain the CI/dev default — real providers gated behind env so tests stay
   hermetic.
4. No provider gains fund-movement authority (see `docs/security/audit-prep.md`, invariant I10).
