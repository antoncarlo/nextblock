# Governance Phase 2 Stage A - Pre-flight (Base Sepolia) - FINAL

Status: PAYLOAD READY, EXECUTION NOT AUTHORIZED YET. The dedicated
addresses below were provided by the owner and verified read-only on
2026-06-13. Executing Stage A still requires a separate explicit owner
authorization and happens exclusively through the Safe UI - nothing in
this repository broadcasts transactions. Stage B remains BLOCKED behind
its own authorization (see `docs/GOVERNANCE_PHASE2.md` and the PRODUCTION
BLOCK in `docs/OPERATIONS.md`).

## 1. Verified current topology

Source: `script/GovernanceCheck.s.sol` executed read-only on 2026-06-13
against live Base Sepolia state (`forge script` WITHOUT `--broadcast` is
the no-broadcast mode; the run performs `eth_call` reads only and needs no
key).

| Contract | Address |
|---|---|
| ProtocolRoles | `0xEE93166a2cf213243eF330a664682290b195c976` |
| ProtocolTimelock | `0x6e2927627d83A90EDC9cDA3c626B49875f9449CF` (minDelay 3600s) |
| Safe (proposer/executor/canceller) | `0x8Fd8b45Ba2612E7535bbeB21615554701CfaF870` |
| Deployer EOA | `0xfF6f0d49dD2187351264C4d3bbd5537bE8Ad81d2` |

The deployer still holds OWNER_ROLE, DEFAULT_ADMIN_ROLE and all seven
operational roles; the timelock holds OWNER_ROLE and DEFAULT_ADMIN_ROLE;
the Safe holds nothing on ProtocolRoles and is proposer, executor and
canceller on the timelock. Stage A only ADDS holders; it revokes nothing.

## 2. Dedicated Address Registry (provided by owner, 2026-06-13)

| Role | Dedicated address | Wallet | Role hash |
|---|---|---|---|
| UNDERWRITING_CURATOR_ROLE | `0xB5F9A30253f6a5CB5247FEdbd0D84D963699B506` | #1 | `0xf4a721a10c6fe5f01e074333800161457a6667839d48f8575d798c05ad6e74f3` |
| ALLOCATOR_ROLE | `0x57A7Eae0592D061EBB88db547fe54eE3de970463` | #2 | `0x68bf109b95a5c15fb2bb99041323c27d15f8675e11bf7420a1cd6ad64c394f46` |
| SENTINEL_ROLE | `0xc38297E456680d97E20d0D8e73166E40a3925238` | #3 | `0x0e58f09080507613e45c927895fdc351ce79a3743ce0a3e127396951be78d0a9` |
| CLAIMS_COMMITTEE_ROLE | `0x5b39851625dF1ACCe299c751BC08735ad6DE04f7` | #4 | `0x983b448801a2d04d897dd6baa2900de596214fe2ead88f3a76851191d645135b` |
| KYC_OPERATOR_ROLE | `0x6E4C79C1D4FA40188b70349f7590cC5bB3Bfcab2` | #5 | `0xdf54a8fce50b9de7187b8b9daaa3b95e6ef1bf1df5fe0a03ddea8faa73de2a10` |
| AUTHORIZED_CEDANT_ROLE | `0x2B1DaFD7f25B109cBbBaC3F01a674A89Af788f55` | #6 | `0xdded2152fd4de9b4e504520e18716b01155da2db03dde62a88648c2263475df0` |
| ORACLE_ROLE | `0xd5D8705d4852b871af70Ee3fAAD9d938fb9cD489` | #7 | `0x68e79a7bf1e0bc45d0a330c573bc367f9cf464fd326078812f301165fbda4ef1` |

All seven are EIP-55 checksum-valid, mutually distinct, and distinct from
the deployer, the Safe and the timelock. The intended mapping is also
recorded (non-authoritatively) in
`contracts/deployments/84532-staging.json` under `pendingStageA`; the
current role fields keep pointing to the deployer until Stage A executes
on-chain.

## 3. Pre-flight verification of the dedicated wallets

Commands (read-only) and the result measured on 2026-06-13 against
`https://sepolia.base.org`:

```bash
RPC=https://sepolia.base.org
for A in \
  0xB5F9A30253f6a5CB5247FEdbd0D84D963699B506 \
  0x57A7Eae0592D061EBB88db547fe54eE3de970463 \
  0xc38297E456680d97E20d0D8e73166E40a3925238 \
  0x5b39851625dF1ACCe299c751BC08735ad6DE04f7 \
  0x6E4C79C1D4FA40188b70349f7590cC5bB3Bfcab2 \
  0x2B1DaFD7f25B109cBbBaC3F01a674A89Af788f55 \
  0xd5D8705d4852b871af70Ee3fAAD9d938fb9cD489; do
  echo "$A nonce=$(cast nonce $A --rpc-url $RPC) balance=$(cast balance $A --rpc-url $RPC) code=$(cast code $A --rpc-url $RPC)"
done
```

Measured: every wallet has nonce 0, balance 0 wei and no code - all seven
are fresh EOAs never used on Base Sepolia. Expectations:

- Fresh key: nonce 0 and no code at pre-flight (met for all seven).
- Gas funding: Stage A itself needs NO funding of these wallets (the Safe
  pays gas for schedule/execute). Before the post-Stage-A operational
  confirmation, each wallet that must SEND transactions on Base Sepolia
  (sentinel, curator, oracle node, allocator, cedant, and the kycOperator
  for the on-chain whitelist act) needs a small amount of Base Sepolia
  test ETH from a faucet. Test ETH has no monetary value.
- Mainnet hygiene: these keys should show zero history on any mainnet;
  reusing mainnet-active keys as staging role keys is rejected.

## 4. Stage A mechanics (recap)

For each role: the Safe schedules
`schedule(protocolRoles, 0, grantRole(roleHash, dedicated), 0x0, salt, 3600)`
on the ProtocolTimelock, waits MIN_DELAY = 3600s until the operation is
Ready, then executes the same operation. Salts are
`keccak256("stageA:<ROLE_NAME>")` (precomputed below). Stage A is
reversible and revokes nothing; the timelocked path matches the rehearsed
mechanics (`test/governance/GovernancePhase2Rehearsal.t.sol`,
`test/fork/GovernancePhase2Fork.t.sol`).

Operation parameters and precomputed ids (ids returned read-only by the
deployed timelock's `hashOperation` on 2026-06-13):

| Role | Salt (`keccak256("stageA:<ROLE>")`) | Operation id |
|---|---|---|
| UNDERWRITING_CURATOR_ROLE | `0x4175d74fd12de80f618bc15f3338709e2a50ec7085fd1248fb2de7a813baaa84` | `0x1e2dc8aa24f33307e6083bc039fc420be061e03e3a5e0c40a7b10c544fec9e33` |
| ALLOCATOR_ROLE | `0x262590179ebb0207aecda44061fd3fea04b2774520db8b7c5aa26c086398b550` | `0x0208038c2ced4ab291fad5e1fc9a4a6c4513fae01e36d29bf062f8867dd40207` |
| SENTINEL_ROLE | `0x8b366795b1cd09dc8be9eaba668697973bdb57e52e3321535079dc2622fa051a` | `0x97e0ae850b47aba2baf132caf49cad3028df213d30ea5f6c812fd11b8486aa89` |
| CLAIMS_COMMITTEE_ROLE | `0x8319acccd2bc764aa66593a066981f39cde4ff5c2ddb255f2daeeb8b9d110141` | `0x62d65c5ad1fa079aa991685650b3c400b014148e296ca62fb04e01db2c368d77` |
| KYC_OPERATOR_ROLE | `0x0862acf9ec34c72ddbd591cff6bbc3cb6757de7b31e0e8b55f27a8bce561f234` | `0x17978cd2fdc395c74a70fa100e967c9fcfb559a5c7d042ab4a3e2641ca10a6b8` |
| AUTHORIZED_CEDANT_ROLE | `0x6209e3b01560a7dc208bfd38d1b1b22775448c22c8f2dd7b9e6eb4d3c3b00e64` | `0x1b59bb0cba2c3c5a22a61678b0edf3961b434810031944250e28e828fb4dec37` |
| ORACLE_ROLE | `0xb49b2586fbf7f574327633f647955b58d5730746385ce0d4af1962f6c5654b8f` | `0xc8f19a588e72e31e1f0b32073940142a543c4c8b0346a4025e228621e2939823` |

## 5. FINAL Safe payload - Stage A SCHEDULE batch

Import into the Safe Transaction Builder (Safe
`0x8Fd8b45Ba2612E7535bbeB21615554701CfaF870`, chain 84532). Every field is
final; nothing needs replacement.

```json
{
  "version": "1.0",
  "chainId": "84532",
  "createdAt": 0,
  "meta": {
    "name": "NextBlock Governance Phase 2 - Stage A SCHEDULE batch (FINAL)",
    "description": "Schedules 7 timelocked grantRole operations (key separation) on ProtocolRoles via ProtocolTimelock. Execute batch follows after minDelay 3600s. No revoke or renounce included."
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
        "data": "0x2f2ff15df4a721a10c6fe5f01e074333800161457a6667839d48f8575d798c05ad6e74f3000000000000000000000000b5f9a30253f6a5cb5247fedbd0d84d963699b506",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "0x4175d74fd12de80f618bc15f3338709e2a50ec7085fd1248fb2de7a813baaa84",
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
        "data": "0x2f2ff15d68bf109b95a5c15fb2bb99041323c27d15f8675e11bf7420a1cd6ad64c394f4600000000000000000000000057a7eae0592d061ebb88db547fe54ee3de970463",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "0x262590179ebb0207aecda44061fd3fea04b2774520db8b7c5aa26c086398b550",
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
        "data": "0x2f2ff15d0e58f09080507613e45c927895fdc351ce79a3743ce0a3e127396951be78d0a9000000000000000000000000c38297e456680d97e20d0d8e73166e40a3925238",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "0x8b366795b1cd09dc8be9eaba668697973bdb57e52e3321535079dc2622fa051a",
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
        "data": "0x2f2ff15d983b448801a2d04d897dd6baa2900de596214fe2ead88f3a76851191d645135b0000000000000000000000005b39851625df1acce299c751bc08735ad6de04f7",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "0x8319acccd2bc764aa66593a066981f39cde4ff5c2ddb255f2daeeb8b9d110141",
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
        "data": "0x2f2ff15ddf54a8fce50b9de7187b8b9daaa3b95e6ef1bf1df5fe0a03ddea8faa73de2a100000000000000000000000006e4c79c1d4fa40188b70349f7590cc5bb3bfcab2",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "0x0862acf9ec34c72ddbd591cff6bbc3cb6757de7b31e0e8b55f27a8bce561f234",
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
        "data": "0x2f2ff15ddded2152fd4de9b4e504520e18716b01155da2db03dde62a88648c2263475df00000000000000000000000002b1dafd7f25b109cbbbac3f01a674a89af788f55",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "0x6209e3b01560a7dc208bfd38d1b1b22775448c22c8f2dd7b9e6eb4d3c3b00e64",
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
        "data": "0x2f2ff15d68e79a7bf1e0bc45d0a330c573bc367f9cf464fd326078812f301165fbda4ef1000000000000000000000000d5d8705d4852b871af70ee3faad9d938fb9cd489",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "0xb49b2586fbf7f574327633f647955b58d5730746385ce0d4af1962f6c5654b8f",
        "delay": "3600"
      }
    }
  ]
}
```

## 6. FINAL Safe payload - Stage A EXECUTE batch (after the 3600s delay)

Import and submit ONLY after every operation id reports Ready:

```bash
RPC=https://sepolia.base.org
TL=0x6e2927627d83A90EDC9cDA3c626B49875f9449CF
for ID in \
  0x1e2dc8aa24f33307e6083bc039fc420be061e03e3a5e0c40a7b10c544fec9e33 \
  0x0208038c2ced4ab291fad5e1fc9a4a6c4513fae01e36d29bf062f8867dd40207 \
  0x97e0ae850b47aba2baf132caf49cad3028df213d30ea5f6c812fd11b8486aa89 \
  0x62d65c5ad1fa079aa991685650b3c400b014148e296ca62fb04e01db2c368d77 \
  0x17978cd2fdc395c74a70fa100e967c9fcfb559a5c7d042ab4a3e2641ca10a6b8 \
  0x1b59bb0cba2c3c5a22a61678b0edf3961b434810031944250e28e828fb4dec37 \
  0xc8f19a588e72e31e1f0b32073940142a543c4c8b0346a4025e228621e2939823; do
  echo "$ID ready=$(cast call $TL 'isOperationReady(bytes32)(bool)' $ID --rpc-url $RPC)"
done
```

```json
{
  "version": "1.0",
  "chainId": "84532",
  "createdAt": 0,
  "meta": {
    "name": "NextBlock Governance Phase 2 - Stage A EXECUTE batch (FINAL)",
    "description": "Executes the 7 matured grantRole operations scheduled by the Stage A schedule batch. Same target, payload, predecessor and salt; no delay parameter."
  },
  "transactions": [
    {
      "to": "0x6e2927627d83A90EDC9cDA3c626B49875f9449CF",
      "value": "0",
      "data": null,
      "contractMethod": {
        "name": "execute",
        "payable": true,
        "inputs": [
          { "name": "target", "type": "address" },
          { "name": "value", "type": "uint256" },
          { "name": "payload", "type": "bytes" },
          { "name": "predecessor", "type": "bytes32" },
          { "name": "salt", "type": "bytes32" }
        ]
      },
      "contractInputsValues": {
        "target": "0xEE93166a2cf213243eF330a664682290b195c976",
        "value": "0",
        "payload": "0x2f2ff15df4a721a10c6fe5f01e074333800161457a6667839d48f8575d798c05ad6e74f3000000000000000000000000b5f9a30253f6a5cb5247fedbd0d84d963699b506",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "0x4175d74fd12de80f618bc15f3338709e2a50ec7085fd1248fb2de7a813baaa84"
      }
    },
    {
      "to": "0x6e2927627d83A90EDC9cDA3c626B49875f9449CF",
      "value": "0",
      "data": null,
      "contractMethod": {
        "name": "execute",
        "payable": true,
        "inputs": [
          { "name": "target", "type": "address" },
          { "name": "value", "type": "uint256" },
          { "name": "payload", "type": "bytes" },
          { "name": "predecessor", "type": "bytes32" },
          { "name": "salt", "type": "bytes32" }
        ]
      },
      "contractInputsValues": {
        "target": "0xEE93166a2cf213243eF330a664682290b195c976",
        "value": "0",
        "payload": "0x2f2ff15d68bf109b95a5c15fb2bb99041323c27d15f8675e11bf7420a1cd6ad64c394f4600000000000000000000000057a7eae0592d061ebb88db547fe54ee3de970463",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "0x262590179ebb0207aecda44061fd3fea04b2774520db8b7c5aa26c086398b550"
      }
    },
    {
      "to": "0x6e2927627d83A90EDC9cDA3c626B49875f9449CF",
      "value": "0",
      "data": null,
      "contractMethod": {
        "name": "execute",
        "payable": true,
        "inputs": [
          { "name": "target", "type": "address" },
          { "name": "value", "type": "uint256" },
          { "name": "payload", "type": "bytes" },
          { "name": "predecessor", "type": "bytes32" },
          { "name": "salt", "type": "bytes32" }
        ]
      },
      "contractInputsValues": {
        "target": "0xEE93166a2cf213243eF330a664682290b195c976",
        "value": "0",
        "payload": "0x2f2ff15d0e58f09080507613e45c927895fdc351ce79a3743ce0a3e127396951be78d0a9000000000000000000000000c38297e456680d97e20d0d8e73166e40a3925238",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "0x8b366795b1cd09dc8be9eaba668697973bdb57e52e3321535079dc2622fa051a"
      }
    },
    {
      "to": "0x6e2927627d83A90EDC9cDA3c626B49875f9449CF",
      "value": "0",
      "data": null,
      "contractMethod": {
        "name": "execute",
        "payable": true,
        "inputs": [
          { "name": "target", "type": "address" },
          { "name": "value", "type": "uint256" },
          { "name": "payload", "type": "bytes" },
          { "name": "predecessor", "type": "bytes32" },
          { "name": "salt", "type": "bytes32" }
        ]
      },
      "contractInputsValues": {
        "target": "0xEE93166a2cf213243eF330a664682290b195c976",
        "value": "0",
        "payload": "0x2f2ff15d983b448801a2d04d897dd6baa2900de596214fe2ead88f3a76851191d645135b0000000000000000000000005b39851625df1acce299c751bc08735ad6de04f7",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "0x8319acccd2bc764aa66593a066981f39cde4ff5c2ddb255f2daeeb8b9d110141"
      }
    },
    {
      "to": "0x6e2927627d83A90EDC9cDA3c626B49875f9449CF",
      "value": "0",
      "data": null,
      "contractMethod": {
        "name": "execute",
        "payable": true,
        "inputs": [
          { "name": "target", "type": "address" },
          { "name": "value", "type": "uint256" },
          { "name": "payload", "type": "bytes" },
          { "name": "predecessor", "type": "bytes32" },
          { "name": "salt", "type": "bytes32" }
        ]
      },
      "contractInputsValues": {
        "target": "0xEE93166a2cf213243eF330a664682290b195c976",
        "value": "0",
        "payload": "0x2f2ff15ddf54a8fce50b9de7187b8b9daaa3b95e6ef1bf1df5fe0a03ddea8faa73de2a100000000000000000000000006e4c79c1d4fa40188b70349f7590cc5bb3bfcab2",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "0x0862acf9ec34c72ddbd591cff6bbc3cb6757de7b31e0e8b55f27a8bce561f234"
      }
    },
    {
      "to": "0x6e2927627d83A90EDC9cDA3c626B49875f9449CF",
      "value": "0",
      "data": null,
      "contractMethod": {
        "name": "execute",
        "payable": true,
        "inputs": [
          { "name": "target", "type": "address" },
          { "name": "value", "type": "uint256" },
          { "name": "payload", "type": "bytes" },
          { "name": "predecessor", "type": "bytes32" },
          { "name": "salt", "type": "bytes32" }
        ]
      },
      "contractInputsValues": {
        "target": "0xEE93166a2cf213243eF330a664682290b195c976",
        "value": "0",
        "payload": "0x2f2ff15ddded2152fd4de9b4e504520e18716b01155da2db03dde62a88648c2263475df00000000000000000000000002b1dafd7f25b109cbbbac3f01a674a89af788f55",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "0x6209e3b01560a7dc208bfd38d1b1b22775448c22c8f2dd7b9e6eb4d3c3b00e64"
      }
    },
    {
      "to": "0x6e2927627d83A90EDC9cDA3c626B49875f9449CF",
      "value": "0",
      "data": null,
      "contractMethod": {
        "name": "execute",
        "payable": true,
        "inputs": [
          { "name": "target", "type": "address" },
          { "name": "value", "type": "uint256" },
          { "name": "payload", "type": "bytes" },
          { "name": "predecessor", "type": "bytes32" },
          { "name": "salt", "type": "bytes32" }
        ]
      },
      "contractInputsValues": {
        "target": "0xEE93166a2cf213243eF330a664682290b195c976",
        "value": "0",
        "payload": "0x2f2ff15d68e79a7bf1e0bc45d0a330c573bc367f9cf464fd326078812f301165fbda4ef1000000000000000000000000d5d8705d4852b871af70ee3faad9d938fb9cd489",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "0xb49b2586fbf7f574327633f647955b58d5730746385ce0d4af1962f6c5654b8f"
      }
    }
  ]
}
```

Note on field names: the timelock ABI names the bytes parameter `data` in
`schedule` and `payload` in `execute` (OpenZeppelin v5); both carry the
identical grantRole calldata per role.

## 7. Post-execution verification (read-only, no key)

```bash
R=0xEE93166a2cf213243eF330a664682290b195c976
RPC=https://sepolia.base.org
cast call $R "hasRole(bytes32,address)(bool)" 0xf4a721a10c6fe5f01e074333800161457a6667839d48f8575d798c05ad6e74f3 0xB5F9A30253f6a5CB5247FEdbd0D84D963699B506 --rpc-url $RPC
cast call $R "hasRole(bytes32,address)(bool)" 0x68bf109b95a5c15fb2bb99041323c27d15f8675e11bf7420a1cd6ad64c394f46 0x57A7Eae0592D061EBB88db547fe54eE3de970463 --rpc-url $RPC
cast call $R "hasRole(bytes32,address)(bool)" 0x0e58f09080507613e45c927895fdc351ce79a3743ce0a3e127396951be78d0a9 0xc38297E456680d97E20d0D8e73166E40a3925238 --rpc-url $RPC
cast call $R "hasRole(bytes32,address)(bool)" 0x983b448801a2d04d897dd6baa2900de596214fe2ead88f3a76851191d645135b 0x5b39851625dF1ACCe299c751BC08735ad6DE04f7 --rpc-url $RPC
cast call $R "hasRole(bytes32,address)(bool)" 0xdf54a8fce50b9de7187b8b9daaa3b95e6ef1bf1df5fe0a03ddea8faa73de2a10 0x6E4C79C1D4FA40188b70349f7590cC5bB3Bfcab2 --rpc-url $RPC
cast call $R "hasRole(bytes32,address)(bool)" 0xdded2152fd4de9b4e504520e18716b01155da2db03dde62a88648c2263475df0 0x2B1DaFD7f25B109cBbBaC3F01a674A89Af788f55 --rpc-url $RPC
cast call $R "hasRole(bytes32,address)(bool)" 0x68e79a7bf1e0bc45d0a330c573bc367f9cf464fd326078812f301165fbda4ef1 0xd5D8705d4852b871af70Ee3fAAD9d938fb9cD489 --rpc-url $RPC
```

Every call must return `true`. Then: re-run
`forge script script/GovernanceCheck.s.sol --rpc-url $RPC` (the deployer/
timelock/safe rows must be unchanged - Stage A only adds holders); each
dedicated key performs one harmless role-gated action (operational
confirmation); promote `pendingStageA` into the authoritative role fields
of `contracts/deployments/84532-staging.json`, run
`npm run codegen:addressbook`, commit both together, and update
`docs/SECURITY_MODEL.md` section 2.

## 8. Stage B remains blocked

Stage B (revoking operational roles from the deployer, then renouncing
OWNER_ROLE and DEFAULT_ADMIN_ROLE) must NOT start until ALL seven
dedicated keys are confirmed operational with at least one real role-gated
action each, and the owner gives a separate explicit authorization. Until
then the deployer retains full control and the PRODUCTION BLOCK in
`docs/OPERATIONS.md` stays in force.

## 9. Abort criteria

Stop immediately and report if: any schedule or execute reverts; an
operation never becomes Ready after the delay; an operation id on-chain
differs from the precomputed table above; GovernanceCheck shows any
unexpected holder; a dedicated key cannot sign; the Safe quorum is in
doubt; or the address book and on-chain state disagree.

---
*Author: Anton Carlo Santoro. Prepared read-only on 2026-06-13 - no
transaction was broadcast, no key was used or requested. All hashes,
calldata and operation ids were computed with cast against the live
contracts.*
