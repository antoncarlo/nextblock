> **SUPERSEDED (2026-10-01).** The handover it describes was done on the new generation, with a different Safe.
> The governance described below belongs to the June 2026 Base Sepolia generation,
> whose Safe (`0x8Fd8b45Ba2612E7535bbeB21615554701CfaF870`) is 2-of-2 and cannot be used any more. It is kept as a
> historical record. Current governance: Safe `0x0969B20f1d8a5628613f00fa6aDBE85e715fEf15`, ProtocolTimelock
> `0xc2d419c6EEaC865fE81DAFa7C848fD7d5a5674a7`, phase 2 done. See
> `contracts/REDEPLOY_RUNBOOK.md` and `docs/OPERATIONS.md`.

# Safe Multisig Handover — Runbook (live generation)

**Author:** Anton Carlo Santoro
**Scope:** transfer privileged governance of the live Base Sepolia generation from the
deployer EOA to a Gnosis Safe + ProtocolTimelock, and seat the 3-of-5 Claims Committee.

The handover **script already exists** — `script/GovernanceMigration.s.sol` (two-phase). This
runbook documents executing it against the live generation. No code change required.

## Live generation addresses (deployed 2026-06-30)

| Contract | Address |
|---|---|
| ProtocolRoles | `0x3e961139Ea0EDA926bfE8f7bfe5022D7AA108192` |
| ComplianceRegistry | `0x60AE032A4a315fdd62387271b7649056f951D860` |
| InsuranceVault (nbRV) | `0xc496Bb59e68c95eDC90c95dBF078910542aC08D6` |
| RedemptionQueue | `0x243205af6C2a89C33c67f967901415C06F2a9cc0` |
| MockUSDC | `0xBA4B7F7C67844D9829a2F287aCF99bB796BC163b` |
| Deployer EOA (current OWNER) | `0xfF6f0d49dD2187351264C4d3bbd5537bE8Ad81d2` |

## Owner prerequisites (not automatable)

1. Create the **protocol Safe** (e.g. 2-of-3 or 3-of-5) on Base Sepolia → `SAFE_ADDRESS`.
2. Create the **Claims Committee Safe** (3-of-5) → `COMMITTEE_SAFE`.
3. Decide the timelock `MIN_DELAY` (≥ 1 hour floor; production typically 24–48h).

## Phase 1 — deploy timelock + grant (deployer keeps roles)

```bash
cd contracts
PROTOCOL_ROLES=0x3e961139Ea0EDA926bfE8f7bfe5022D7AA108192 \
SAFE_ADDRESS=<protocol safe> \
EXECUTOR_ADDRESS=<protocol safe or executor> \
MIN_DELAY=86400 \
WRITE_DEPLOYMENT_JSON=false \
forge script script/GovernanceMigration.s.sol:GovernanceMigration --rpc-url base_sepolia --broadcast
```

Records the new `ProtocolTimelock` address (→ `TIMELOCK_ADDRESS`). OWNER_ROLE +
DEFAULT_ADMIN_ROLE are now held by BOTH the timelock and the deployer.

## Phase 1.5 — seat the Claims Committee + rehearse

- Grant `CLAIMS_COMMITTEE_ROLE` to `COMMITTEE_SAFE` through a timelocked op (schedule from the
  protocol Safe → wait `MIN_DELAY` → execute). Revoke the old single-key committee.
- Rehearse one full timelocked op end-to-end (e.g. a no-op `grantRole`) to prove the Safe →
  schedule → delay → execute path works on the live generation. This is the gate before Phase 2.

## Phase 2 — deployer renounces (IRREVERSIBLE)

Only after a successful rehearsal:

```bash
PROTOCOL_ROLES=0x3e961139Ea0EDA926bfE8f7bfe5022D7AA108192 \
TIMELOCK_ADDRESS=<from phase 1> \
RENOUNCE_DEPLOYER=true \
WRITE_DEPLOYMENT_JSON=false \
forge script script/GovernanceMigration.s.sol:GovernanceMigration --rpc-url base_sepolia --broadcast
```

The deployer EOA renounces OWNER_ROLE + DEFAULT_ADMIN_ROLE. Governance then flows
**exclusively** through the timelock (proposed by the protocol Safe). Sentinel emergency
powers remain immediate and direct (not timelocked), per design.

## Post-handover verification

- `ProtocolRoles.hasRole(OWNER_ROLE, timelock) == true`
- `ProtocolRoles.hasRole(OWNER_ROLE, deployer) == false`
- `ProtocolRoles.hasRole(CLAIMS_COMMITTEE_ROLE, committeeSafe) == true`
- A direct `grantRole` from the deployer or the Safe now reverts; only timelocked execution works.

This mirrors the rehearsed coverage in `test/governance/GovernancePhase2Rehearsal.t.sol` (7/7).
