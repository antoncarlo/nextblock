# Governance Phase 2 Stage A - Pre-flight (Base Sepolia)

Status: PREPARATION ONLY. Nothing in this document executes anything.
Stage A requires (1) the dedicated addresses below to be provided by the
owner, (2) a separate explicit authorization. Stage B remains BLOCKED
behind its own authorization on top of that (see `docs/GOVERNANCE_PHASE2.md`
and the PRODUCTION BLOCK in `docs/OPERATIONS.md`).

## 1. Verified current topology

Source: `script/GovernanceCheck.s.sol` executed read-only on 2026-06-13
against live Base Sepolia state. Note: `forge script` WITHOUT the
`--broadcast` flag is the no-broadcast mode (there is no `--no-broadcast`
flag); the run performs `eth_call` reads only and needs no key.

```bash
cd contracts
forge script script/GovernanceCheck.s.sol --rpc-url "$BASE_SEPOLIA_RPC_URL"
```

| Contract | Address (from `contracts/deployments/84532-staging.json`) |
|---|---|
| ProtocolRoles | `0xEE93166a2cf213243eF330a664682290b195c976` |
| ProtocolTimelock | `0x6e2927627d83A90EDC9cDA3c626B49875f9449CF` (minDelay 3600s) |
| Safe (proposer/executor/canceller) | `0x8Fd8b45Ba2612E7535bbeB21615554701CfaF870` |
| Deployer EOA | `0xfF6f0d49dD2187351264C4d3bbd5537bE8Ad81d2` |

Role holders verified on-chain (deployer / timelock / safe):

| Role | Hash (`cast keccak <name>`) | deployer | timelock | safe | Stage A action |
|---|---|---|---|---|---|
| OWNER_ROLE | `0xb19546dff01e856fb3f010c267a7b1c60363cf8a4664e21cc89c26224620214e` | true | true | false | none in Stage A (Stage B renounce only) |
| DEFAULT_ADMIN_ROLE | `0x0000...0000` | true | true | false | none in Stage A (Stage B renounce only) |
| UNDERWRITING_CURATOR_ROLE | `0xf4a721a10c6fe5f01e074333800161457a6667839d48f8575d798c05ad6e74f3` | true | false | false | grant to dedicated curator |
| ALLOCATOR_ROLE | `0x68bf109b95a5c15fb2bb99041323c27d15f8675e11bf7420a1cd6ad64c394f46` | true | false | false | grant to dedicated allocator/bot key |
| SENTINEL_ROLE | `0x0e58f09080507613e45c927895fdc351ce79a3743ce0a3e127396951be78d0a9` | true | false | false | grant to dedicated guardian key(s) |
| CLAIMS_COMMITTEE_ROLE | `0x983b448801a2d04d897dd6baa2900de596214fe2ead88f3a76851191d645135b` | true | false | false | grant to committee Safe (3-of-5 target) |
| KYC_OPERATOR_ROLE | `0xdf54a8fce50b9de7187b8b9daaa3b95e6ef1bf1df5fe0a03ddea8faa73de2a10` | true | false | false | grant to dedicated operator key/Safe |
| AUTHORIZED_CEDANT_ROLE | `0xdded2152fd4de9b4e504520e18716b01155da2db03dde62a88648c2263475df0` | true | false | false | grant to labelled test cedant wallet |
| ORACLE_ROLE | `0x68e79a7bf1e0bc45d0a330c573bc367f9cf464fd326078812f301165fbda4ef1` | true | false | false | grant to dedicated oracle-node key |
| PREMIUM_DEPOSITOR_ROLE | - | false | false | false | none (vault-level path, intentional) |
| VAULT_FACTORY_ROLE | - | false (factory holds it) | false | false | none (correct by design) |

Timelock wiring verified: safe is proposer, executor and canceller;
timelock is self-administered; deployer is NOT a timelock admin; the
timelock already holds OWNER_ROLE and DEFAULT_ADMIN_ROLE on ProtocolRoles.

## 2. REQUIRED INPUTS - dedicated addresses (owner must provide)

Stage A cannot proceed until every row is filled and confirmed in writing.
Keys must be freshly generated, custodied separately from the deployer key,
and test-signed once before use.

| Role | Dedicated address | Custody notes (fill in) |
|---|---|---|
| UNDERWRITING_CURATOR_ROLE | `REPLACE_WITH_CURATOR_ADDRESS` | |
| ALLOCATOR_ROLE | `REPLACE_WITH_ALLOCATOR_ADDRESS` | |
| SENTINEL_ROLE | `REPLACE_WITH_SENTINEL_ADDRESS` | may be granted to multiple guardians |
| CLAIMS_COMMITTEE_ROLE | `REPLACE_WITH_COMMITTEE_ADDRESS` | committee Safe recommended (3-of-5 target) |
| KYC_OPERATOR_ROLE | `REPLACE_WITH_KYC_OPERATOR_ADDRESS` | used by KYB review + whitelist acts |
| AUTHORIZED_CEDANT_ROLE | `REPLACE_WITH_CEDANT_ADDRESS` | labelled test cedant wallet |
| ORACLE_ROLE | `REPLACE_WITH_ORACLE_ADDRESS` | oracle-node key (Braino feed) |

Rules: no address may equal the deployer EOA; the same address may hold at
most one role (except a deliberate, documented exception); EOA vs Safe
choice per role must be recorded in the custody column.

## 3. What Stage A executes (and what it does not)

For EACH role above, through the timelock:

1. The Safe schedules on ProtocolTimelock:
   `schedule(protocolRoles, 0, grantRole(<roleHash>, <dedicatedAddress>), 0x0, <salt>, 3600)`.
2. Wait at least MIN_DELAY = 3600 seconds (operation becomes Ready).
3. The Safe executes the matured operation:
   `execute(protocolRoles, 0, <same data>, 0x0, <same salt>)`.
4. Verify the grant (section 5), then test the dedicated key with one
   harmless role-gated action before relying on it.

Notes:
- The timelocked path is the institutional default and matches the
  rehearsed mechanics (`test/governance/GovernancePhase2Rehearsal.t.sol`,
  `test/fork/GovernancePhase2Fork.t.sol`). The runbook also documents that
  while the deployer still holds OWNER_ROLE these grants COULD be sent as
  plain deployer transactions; that shortcut is rejected here because every
  authority change must go through the proposer/executor path we are
  handing control to.
- Salts: use a distinct, human-readable salt per operation
  (`keccak256("stageA:<ROLE_NAME>")`) so operation ids are unique and
  auditable even though differing calldata already guarantees uniqueness.
- Stage A is REVERSIBLE: nothing is revoked from the deployer here.
- Stage A grants ADD holders; protocol behavior is unchanged until the
  dedicated keys start acting.

What Stage A explicitly does NOT do:
- No revoke, no renounce, nothing touches OWNER_ROLE or DEFAULT_ADMIN_ROLE.
- Stage B (revoking operational roles from the deployer, then the final
  renounce of OWNER_ROLE and DEFAULT_ADMIN_ROLE) must NOT start until ALL
  dedicated addresses are confirmed operational: each new key must have
  successfully performed at least one real role-gated action, and the
  owner must give a separate explicit authorization. Until Stage B, the
  deployer retains full control - the production block stays in force.

## 4. Safe Transaction Builder payload - Stage A schedule batch (TEMPLATE)

Import into the Safe Transaction Builder (Safe
`0x8Fd8b45Ba2612E7535bbeB21615554701CfaF870`, chain 84532) AFTER replacing
every `REPLACE_WITH_*` placeholder. Each transaction calls
`schedule` on the ProtocolTimelock; `data` is the inner
`grantRole(bytes32,address)` calldata for ProtocolRoles.

Generate each inner `data` field once addresses are known:

```bash
cast calldata "grantRole(bytes32,address)" <ROLE_HASH> <DEDICATED_ADDRESS>
# layout: 0x2f2ff15d ++ roleHash(32) ++ zero-padded address(32)
```

Generate each salt:

```bash
cast keccak "stageA:UNDERWRITING_CURATOR_ROLE"   # repeat per role name
```

```json
{
  "version": "1.0",
  "chainId": "84532",
  "createdAt": 0,
  "meta": {
    "name": "NextBlock Governance Phase 2 - Stage A schedule batch",
    "description": "Schedules 7 timelocked grantRole operations (key separation). Execute batch follows after minDelay 3600s. No revoke/renounce included."
  },
  "transactions": [
    {
      "to": "0x6e2927627d83A90EDC9cDA3c626B49875f9449CF",
      "value": "0",
      "data": null,
      "contractMethod": {
        "name": "schedule",
        "payable": false,
        "inputs": [
          { "name": "target", "type": "address" },
          { "name": "value", "type": "uint256" },
          { "name": "data", "type": "bytes" },
          { "name": "predecessor", "type": "bytes32" },
          { "name": "salt", "type": "bytes32" },
          { "name": "delay", "type": "uint256" }
        ]
      },
      "contractInputsValues": {
        "target": "0xEE93166a2cf213243eF330a664682290b195c976",
        "value": "0",
        "data": "0x2f2ff15df4a721a10c6fe5f01e074333800161457a6667839d48f8575d798c05ad6e74f3000000000000000000000000REPLACE_WITH_CURATOR_ADDRESS_NO_0x",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "REPLACE_WITH_SALT_CURATOR",
        "delay": "3600"
      }
    },
    {
      "to": "0x6e2927627d83A90EDC9cDA3c626B49875f9449CF",
      "value": "0",
      "data": null,
      "contractMethod": {
        "name": "schedule",
        "payable": false,
        "inputs": [
          { "name": "target", "type": "address" },
          { "name": "value", "type": "uint256" },
          { "name": "data", "type": "bytes" },
          { "name": "predecessor", "type": "bytes32" },
          { "name": "salt", "type": "bytes32" },
          { "name": "delay", "type": "uint256" }
        ]
      },
      "contractInputsValues": {
        "target": "0xEE93166a2cf213243eF330a664682290b195c976",
        "value": "0",
        "data": "0x2f2ff15d68bf109b95a5c15fb2bb99041323c27d15f8675e11bf7420a1cd6ad64c394f46000000000000000000000000REPLACE_WITH_ALLOCATOR_ADDRESS_NO_0x",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "REPLACE_WITH_SALT_ALLOCATOR",
        "delay": "3600"
      }
    },
    {
      "to": "0x6e2927627d83A90EDC9cDA3c626B49875f9449CF",
      "value": "0",
      "data": null,
      "contractMethod": {
        "name": "schedule",
        "payable": false,
        "inputs": [
          { "name": "target", "type": "address" },
          { "name": "value", "type": "uint256" },
          { "name": "data", "type": "bytes" },
          { "name": "predecessor", "type": "bytes32" },
          { "name": "salt", "type": "bytes32" },
          { "name": "delay", "type": "uint256" }
        ]
      },
      "contractInputsValues": {
        "target": "0xEE93166a2cf213243eF330a664682290b195c976",
        "value": "0",
        "data": "0x2f2ff15d0e58f09080507613e45c927895fdc351ce79a3743ce0a3e127396951be78d0a9000000000000000000000000REPLACE_WITH_SENTINEL_ADDRESS_NO_0x",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "REPLACE_WITH_SALT_SENTINEL",
        "delay": "3600"
      }
    },
    {
      "to": "0x6e2927627d83A90EDC9cDA3c626B49875f9449CF",
      "value": "0",
      "data": null,
      "contractMethod": {
        "name": "schedule",
        "payable": false,
        "inputs": [
          { "name": "target", "type": "address" },
          { "name": "value", "type": "uint256" },
          { "name": "data", "type": "bytes" },
          { "name": "predecessor", "type": "bytes32" },
          { "name": "salt", "type": "bytes32" },
          { "name": "delay", "type": "uint256" }
        ]
      },
      "contractInputsValues": {
        "target": "0xEE93166a2cf213243eF330a664682290b195c976",
        "value": "0",
        "data": "0x2f2ff15d983b448801a2d04d897dd6baa2900de596214fe2ead88f3a76851191d645135b000000000000000000000000REPLACE_WITH_COMMITTEE_ADDRESS_NO_0x",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "REPLACE_WITH_SALT_COMMITTEE",
        "delay": "3600"
      }
    },
    {
      "to": "0x6e2927627d83A90EDC9cDA3c626B49875f9449CF",
      "value": "0",
      "data": null,
      "contractMethod": {
        "name": "schedule",
        "payable": false,
        "inputs": [
          { "name": "target", "type": "address" },
          { "name": "value", "type": "uint256" },
          { "name": "data", "type": "bytes" },
          { "name": "predecessor", "type": "bytes32" },
          { "name": "salt", "type": "bytes32" },
          { "name": "delay", "type": "uint256" }
        ]
      },
      "contractInputsValues": {
        "target": "0xEE93166a2cf213243eF330a664682290b195c976",
        "value": "0",
        "data": "0x2f2ff15ddf54a8fce50b9de7187b8b9daaa3b95e6ef1bf1df5fe0a03ddea8faa73de2a10000000000000000000000000REPLACE_WITH_KYC_OPERATOR_ADDRESS_NO_0x",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "REPLACE_WITH_SALT_KYC_OPERATOR",
        "delay": "3600"
      }
    },
    {
      "to": "0x6e2927627d83A90EDC9cDA3c626B49875f9449CF",
      "value": "0",
      "data": null,
      "contractMethod": {
        "name": "schedule",
        "payable": false,
        "inputs": [
          { "name": "target", "type": "address" },
          { "name": "value", "type": "uint256" },
          { "name": "data", "type": "bytes" },
          { "name": "predecessor", "type": "bytes32" },
          { "name": "salt", "type": "bytes32" },
          { "name": "delay", "type": "uint256" }
        ]
      },
      "contractInputsValues": {
        "target": "0xEE93166a2cf213243eF330a664682290b195c976",
        "value": "0",
        "data": "0x2f2ff15ddded2152fd4de9b4e504520e18716b01155da2db03dde62a88648c2263475df0000000000000000000000000REPLACE_WITH_CEDANT_ADDRESS_NO_0x",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "REPLACE_WITH_SALT_CEDANT",
        "delay": "3600"
      }
    },
    {
      "to": "0x6e2927627d83A90EDC9cDA3c626B49875f9449CF",
      "value": "0",
      "data": null,
      "contractMethod": {
        "name": "schedule",
        "payable": false,
        "inputs": [
          { "name": "target", "type": "address" },
          { "name": "value", "type": "uint256" },
          { "name": "data", "type": "bytes" },
          { "name": "predecessor", "type": "bytes32" },
          { "name": "salt", "type": "bytes32" },
          { "name": "delay", "type": "uint256" }
        ]
      },
      "contractInputsValues": {
        "target": "0xEE93166a2cf213243eF330a664682290b195c976",
        "value": "0",
        "data": "0x2f2ff15d68e79a7bf1e0bc45d0a330c573bc367f9cf464fd326078812f301165fbda4ef1000000000000000000000000REPLACE_WITH_ORACLE_ADDRESS_NO_0x",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "REPLACE_WITH_SALT_ORACLE",
        "delay": "3600"
      }
    }
  ]
}
```

After MIN_DELAY elapses, build the EXECUTE batch: identical 7 transactions
with `contractMethod.name = "execute"` and the same `target`, `value`,
`data`, `predecessor`, `salt` fields (no `delay` parameter -
`execute(address,uint256,bytes,bytes32,bytes32)`, selector `0x134008d3`).
The schedule selector is `0x01d5062a`. Operation readiness can be checked
before executing:

```bash
cast call 0x6e2927627d83A90EDC9cDA3c626B49875f9449CF \
  "isOperationReady(bytes32)(bool)" <OPERATION_ID> \
  --rpc-url "$BASE_SEPOLIA_RPC_URL"
# OPERATION_ID = hashOperation(target, 0, data, 0x0, salt)
cast call 0x6e2927627d83A90EDC9cDA3c626B49875f9449CF \
  "hashOperation(address,uint256,bytes,bytes32,bytes32)(bytes32)" \
  0xEE93166a2cf213243eF330a664682290b195c976 0 <DATA> \
  0x0000000000000000000000000000000000000000000000000000000000000000 <SALT> \
  --rpc-url "$BASE_SEPOLIA_RPC_URL"
```

## 5. Post-execution verification (read-only, no key)

1. Re-run the topology audit (unchanged expectation for deployer/timelock/
   safe rows, since Stage A only ADDS holders):

```bash
cd contracts
forge script script/GovernanceCheck.s.sol --rpc-url "$BASE_SEPOLIA_RPC_URL"
```

2. Verify EVERY dedicated address directly (GovernanceCheck maps only
   deployer/timelock/safe, so the new holders need explicit checks):

```bash
R=0xEE93166a2cf213243eF330a664682290b195c976
RPC="$BASE_SEPOLIA_RPC_URL"
cast call $R "hasRole(bytes32,address)(bool)" 0xf4a721a10c6fe5f01e074333800161457a6667839d48f8575d798c05ad6e74f3 REPLACE_WITH_CURATOR_ADDRESS --rpc-url $RPC
cast call $R "hasRole(bytes32,address)(bool)" 0x68bf109b95a5c15fb2bb99041323c27d15f8675e11bf7420a1cd6ad64c394f46 REPLACE_WITH_ALLOCATOR_ADDRESS --rpc-url $RPC
cast call $R "hasRole(bytes32,address)(bool)" 0x0e58f09080507613e45c927895fdc351ce79a3743ce0a3e127396951be78d0a9 REPLACE_WITH_SENTINEL_ADDRESS --rpc-url $RPC
cast call $R "hasRole(bytes32,address)(bool)" 0x983b448801a2d04d897dd6baa2900de596214fe2ead88f3a76851191d645135b REPLACE_WITH_COMMITTEE_ADDRESS --rpc-url $RPC
cast call $R "hasRole(bytes32,address)(bool)" 0xdf54a8fce50b9de7187b8b9daaa3b95e6ef1bf1df5fe0a03ddea8faa73de2a10 REPLACE_WITH_KYC_OPERATOR_ADDRESS --rpc-url $RPC
cast call $R "hasRole(bytes32,address)(bool)" 0xdded2152fd4de9b4e504520e18716b01155da2db03dde62a88648c2263475df0 REPLACE_WITH_CEDANT_ADDRESS --rpc-url $RPC
cast call $R "hasRole(bytes32,address)(bool)" 0x68e79a7bf1e0bc45d0a330c573bc367f9cf464fd326078812f301165fbda4ef1 REPLACE_WITH_ORACLE_ADDRESS --rpc-url $RPC
```

Every call must return `true`. Then each dedicated key performs one
harmless role-gated action (operational confirmation) before Stage B may
even be discussed.

3. Record the new holders in `contracts/deployments/84532-staging.json`,
   regenerate the address book (`npm run codegen:addressbook`) and update
   `docs/SECURITY_MODEL.md` section 2.

## 6. Abort criteria

Stop immediately and report (do not improvise) if: any schedule or execute
reverts; an operation never becomes Ready after the delay; GovernanceCheck
shows any unexpected holder; a dedicated key cannot sign; the Safe quorum
is in doubt; or the address book and on-chain state disagree.

---
*Author: Anton Carlo Santoro. Prepared read-only on 2026-06-13 at main
`96eafe3` - no transaction was broadcast, no key was used or requested.*
