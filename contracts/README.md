# NextBlock Protocol — Smart Contracts

Institutional, Base-only protocol for tokenizing reinsurance portfolios:
permissioned ERC-4626 vaults (`nbUSDC`), on-chain RBAC, ERC-3643-style
compliance, UPR accounting, committee-gated claims and UMA-style bordereau
attestations.

**Author:** Anton Carlo Santoro — NextBlock Group Ltd.
**Status:** MVP, Phases 1-12 (end-to-end demo flow) complete. Internal checks
passed (357 Foundry tests, 10 stateful invariants). No external audit yet.
See `CHANGELOG.md` for ABI-breaking changes and security assumptions.

---

## 1. Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| [Foundry](https://getfoundry.sh) | >= 1.7.x (`foundryup --install stable`) | Build, unit/fuzz/invariant tests, scripts |
| Git | any recent | Dependency installation (`lib/`) |
| Solidity | 0.8.24 (pinned in `foundry.toml`) | Installed automatically by Forge |
| Node.js + npm | Node >= 20 | Only for the frontend in `../app` (`npm ci`) |

## 2. Library installation (exact versions)

`lib/` is **not versioned** (see section 8). Reconstruct it deterministically:

```bash
cd contracts
git clone --depth 1 --branch v1.9.7  https://github.com/foundry-rs/forge-std            lib/forge-std
git clone --depth 1 --branch v5.4.0  https://github.com/OpenZeppelin/openzeppelin-contracts lib/openzeppelin-contracts
```

Pinned commits used during development (for byte-level reproducibility):

| Library | Tag | Commit |
|---|---|---|
| forge-std | `v1.9.7` | `77041d2ce690e692d6e03cc812b57d1ddaa4d505` |
| openzeppelin-contracts | `v5.4.0` | `c64a1edb67b6e3f4a15cca8909c9482ad33a02b0` |

Remappings are already configured in `foundry.toml`
(`@openzeppelin/contracts/` -> `lib/openzeppelin-contracts/contracts/`,
`forge-std/` -> `lib/forge-std/src/`).

## 3. Build

```bash
forge build
```

Expected: `Compiler run successful` (only pre-existing lint notes on the
legacy mocks). Solc 0.8.24, optimizer 200 runs, EVM `cancun`, `via_ir = false`
— constructors with many fields use packed structs (`VaultInitParams`) to stay
within legacy-codegen stack limits; do not flatten them back into long
parameter lists.

## 4. Tests

```bash
forge test -vvv
```

Expected baseline (2026-06-10, post Phase 12): **357 tests passed,
0 failed** across 21 suites — unit, revert, fuzz, integration (`test/integration/FullFlow.t.sol`)
and stateful invariants.

### Invariant / integration subsets

```bash
# Stateful invariant campaign only (10 properties: USDC conservation, UPR
# bounds, allocation/coverage caps, claim-reserve solvency, no-custody checks)
forge test --match-path 'test/invariant/*' -vvv

# Legacy end-to-end demo flow
forge test --match-path 'test/integration/*' -vvv
```

Invariant runs/depth are set per-file via inline `forge-config` comments in
`test/invariant/VaultInvariant.t.sol` (64 runs x 48 depth, fail-on-revert).

## 5. Module map (16 contracts in `src/`)

| Contract | Responsibility |
|---|---|
| `ProtocolRoles.sol` | Central on-chain RBAC: 10 canonical roles (Owner, Underwriting Curator, Allocator, Sentinel, Claims Committee, Premium Depositor, Authorized Cedant, Vault Factory, KYC Operator, Oracle). Sole source of authorization — no frontend whitelists. |
| `ComplianceRegistry.sol` | ERC-3643-style mock: LP whitelist, KYC expiry, jurisdiction codes, block flags, investor limits. Gates every nbUSDC mint/transfer/burn. |
| `PortfolioRegistry.sol` | RWA registry of ceded reinsurance portfolios/treaties: cedant, structure type (QS/XoL/Surplus/Parametric), coverage, ceded premium, documentHash, lifecycle SUBMITTED -> ... -> EXPIRED/REJECTED. Holds no funds. |
| `VaultFactory.sol` | Permissioned vault deployment (curator-gated); wires registries and roles. |
| `VaultDeployer.sol` | Phase 12.1 | Holds the `InsuranceVault` creation code (EIP-170 split: factory was 24,972 B > 24,576 B limit, found by the Base Sepolia dry run). Bind-once: only the bound factory can deploy, so curator gating is preserved. |
| `InsuranceVault.sol` | ERC-4626 USDC vault (nbUSDC shares): compliance hooks, deposit cap, UPR accounting, liquidity buffer, portfolio allocations (bound VaultAllocator only), claim reserve/payout path (bound ClaimManager only). Final solvency enforcer. Legacy demo claim triggers REMOVED in 9.5. |
| `PremiumDistributor.sol` | Receives ceded premiums; documented parametric split (protocol fee 1.5% default, underwriting fee 10% default, LP quota -> vault UPR). Exact conservation. |
| `NavOracle.sol` | Attestation layer for Braino.ai/WAVENURE NAV & risk scores: staleness guard, deviation guard with anomaly auto-pause, Sentinel review cycle. Advisory only — moves no funds. |
| `VaultAllocator.sol` | Strategy/controller layer: allocation proposals with TTL, portfolio/cedant concentration limits, advisory oracle guard, parametric split (70/30 demo). Non-custodial. |
| `ClaimManager.sol` | Canonical claim lifecycle: cedant submission, AI gate, mandatory dispute window (>= 24h) for non-parametric claims, Committee-only approval, Sentinel freeze/dispute, payout exclusively via the vault. |
| `AIAssessor.sol` | Advisory mock store for AI claim assessments (score, anomaly, recommendation, sourceHash). Structurally unable to approve or pay. |
| `BordereauOracle.sol` | UMA-style optimistic attestations for premium/policy/claims bordereaux: liveness, Sentinel dispute, Committee resolution, finalization. No economic effects. |
| `AdapterRegistry.sol` | Non-custodial allowlist of optional external risk-pool adapters (Ensuro/OnRe/Nexus-class) + `IRiskPoolAdapter` interface. No call forwarding, no core bypass. |
| `NextBlockLens.sol` | Phase 10 | Canonical READ MODEL: 9 never-reverting dashboards (protocol, vault, LP, portfolio, premium, claim, oracle, bordereau, adapter) + strict `raw*` twins for auditors. Read-only, non-custodial, no duplicated accounting; module address book settable by OWNER_ROLE for gradual Base Sepolia rollout. |
| `ClaimReceipt.sol` | Soulbound ERC-721 claim receipts (minted at approval, burned at payout). |
| `PolicyRegistry.sol` | LEGACY demo policy registry (virtual clock, BTC/flight/fire policies). Kept for the legacy demo flows; superseded by `PortfolioRegistry` for the institutional model. |
| `MockUSDC.sol` / `MockOracle.sol` | Test/demo mocks (USDC 6 decimals; BTC/flight feeds for the legacy demo). |

Scripts: `script/DemoSetup.s.sol` (full local demo deployment with role
grants and KYC onboarding), `script/Keeper.s.sol` (RETIRED in 9.5 —
notice stub; the legacy triggers it drove no longer exist).

## 6. Target environments

- **Local / devnet:** Anvil (`anvil` + `forge script script/DemoSetup.s.sol --rpc-url http://localhost:8545 --broadcast`).
- **Testnet:** **Base Sepolia only** for the institutional stack (deployment scripts land in Phase 9.5).
- **No mainnet.** No deployment to Base Mainnet or any other chain until the
  external audit and the protocol-readiness review are complete. Do not add
  non-Base RPC configs to the MVP.

Frontend cross-reference: `../app` (Next.js + wagmi/viem). ABIs in
`app/src/config/contracts.ts` are **generated from `out/`** after every
contract change — never edit them by hand. Institutional module addresses are
zero until deployed; the UI renders "Unavailable" by design.

## 7. Conventions enforced by the test suite

- Every privileged function is gated on-chain through `ProtocolRoles`.
- No magic numbers: all fees, buffers, windows and caps are named constants
  with documented bounds.
- Rounding: down toward users, up for fees/liabilities/reserves.
- Claims: AI is advisory-only; the Committee approves; the vault pays; double
  payout and ungated payout are impossible by construction (tested).
- Conservation: USDC in/out reconciles exactly (stateful invariants).

## 8. Regenerable artifacts (not versioned)

The following directories are build/dependency outputs. They are expected to
be missing from a fresh checkout and **must not be committed**:

| Path | Regenerate with |
|---|---|
| `contracts/lib/` | section 2 git clones |
| `contracts/out/`, `contracts/cache/` | `forge build` |
| `app/node_modules/` | `npm ci` (in `app/`) |
| `app/.next/` | `npm run build` (in `app/`) |

## Deployment (Base Sepolia staging — Phase 11)

**Scope: Base Sepolia (84532) and local Anvil (31337) ONLY.** The deploy
script hard-reverts on any other chain (including Base mainnet). No real keys,
no production addresses, no real funds: the settlement asset is a capped
`MockUSDC` faucet (100M USDC per call; deployer uncapped for seeding).

```bash
cp .env.example .env          # fill BASE_SEPOLIA_RPC_URL + testnet PRIVATE_KEY

# Local rehearsal (Anvil)
anvil &
forge script script/DeployStack.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# Base Sepolia staging (add --verify with BASESCAN_API_KEY for explorer verification)
forge script script/DeployStack.s.sol --rpc-url base_sepolia --broadcast --verify -vvv

# Read-only post-deploy sanity (no transactions)
forge script script/SanityCheck.s.sol --rpc-url base_sepolia
```

Properties:

- **NOT idempotent (by design, declared):** every run deploys a fresh stack and
  overwrites `deployments/<chainId>-staging.json`. Reuse a deployment by not
  re-running the script; reuse an existing mock USDC via `USDC_ADDRESS`.
- **Ordered wiring:** asset -> roles -> registries -> oracle/AI -> economic
  modules -> attestation/adapters -> factory + vault -> ClaimReceipt registrar,
  vault `claimManager`/`vaultAllocator` binding (Phase 9.5 sole paths) ->
  canonical role grants (contracts first, then operators) -> Lens (full module
  address book).
- **Verified on-script:** code.length on all 17 addresses, every canonical role,
  both vault bindings, Lens readable with the vault dashboard AVAILABLE, USDC
  decimals. Any failure reverts the whole script.
- **Deterministic output:** `deployments/<chainId>-staging.json` with chainId,
  timestamp, lens/schema versions, all module addresses and role holders —
  consumed by `SanityCheck.s.sol` and by the frontend address book.
- Role addresses default to the deployer for staging; production requires an
  OWNER_ROLE handover to a multisig/timelock and deployer revocation (out of
  scope here).

Before any broadcast, confirm every contract is under the EIP-170 limit
(enforced on Base Sepolia, NOT enforced by local test EVMs):

```bash
forge build --sizes   # every runtime size must be < 24,576 bytes
```

End-to-end demo (deploy + LP + premium + allocation + claim + bordereau +
lens + conservation checks): see **`DEMO_FLOW.md`** and `script/DemoFlow.s.sol`.

Manual explorer verification, if `--verify` was skipped:

```bash
forge verify-contract <address> src/<Module>.sol:<Module> --chain base-sepolia --watch
```

## 9. WARNING — Mounted-folder sync (read before editing)

During development inside sandboxed/remote environments, this project folder
was accessed through a **mounted filesystem that silently truncates existing
files when they grow**: an in-place edit that increases a file's size can be
cut at the file's previous byte length, corrupting the source while looking
successful. Newly created files are not affected.

Operating rules that proved safe:

1. **Never edit large existing sources directly on the mount.** Work on a
   local/sandbox copy and run `forge build && forge test` there first.
2. **Sync back with a byte-verifying copy**, e.g.
   `cat src/Foo.sol > /mount/.../src/Foo.sol && cmp src/Foo.sol /mount/.../src/Foo.sol`
   (or `rsync -rc` followed by `diff -qr`). A sync is complete only when the
   comparison reports zero differences.
3. **After any suspicious edit**, check `wc -c` against the expected size and
   confirm the file still ends with its closing brace.
4. Deletions of read-only artifacts (e.g. `lib/*/.git`) may fail on the mount
   with "Operation not permitted" — clone dependencies in the working copy
   instead and leave the mount's `lib/` placeholders alone.

This is an environment defect, not a property of the codebase. On a normal
local checkout (git clone to a native filesystem) none of these precautions
are needed.

## 10. Verification checklist (auditor quick-start)

```bash
cd contracts
git clone --depth 1 --branch v1.9.7 https://github.com/foundry-rs/forge-std lib/forge-std
git clone --depth 1 --branch v5.4.0 https://github.com/OpenZeppelin/openzeppelin-contracts lib/openzeppelin-contracts
forge build          # Compiler run successful
forge test -vvv      # 357 passed, 0 failed (21 suites, 10 invariants)
```

If those two outputs match, the environment is faithfully reconstructed.
