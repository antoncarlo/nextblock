# Governance hardening — from testnet governance to governance worth trusting

Status on Base Sepolia, read from the chain on 2026-10-05:

| Control | Today | Target before real value |
|---|---|---|
| Governance Safe `0x0969…Ef15` | three owners (`0x6495…28dB` a smart-contract wallet, `0x810f…be3e`, `0x312e…3b35`), threshold 2. **The third owner has not yet signed anything**: only the first two have, so in practice it is still two keys | 2 of 3 with every signer proven to sign |
| Timelock `0xD94e…5950` delay | **86 400 s (24 h)**, changed 2026-10-05 in block 47720526 (`0xf880c49b5e51fa2d0a950cab54c7e30cebd43c27f8a338368ae7c23f54933801`) | 24 h on staging, 48 h or more before mainnet |
| Deployer EOA | no role anywhere | unchanged |
| Operational roles (curator, sentinel, committee, KYC operator, allocator, oracle, cedant) | held by the simulation identities from the redeploy | held by the real operators |

Nothing below moves funds. Each step is a Safe transaction you sign and execute yourself; the
data are prepared and were simulated on a fork of Base Sepolia.

## 1. Make the Safe a real multisig (2 of 3)

The previous Safe was 2-of-2 and became unusable when one key was lost. The rule that follows: the
threshold must always be reachable with one signer missing, and every step is tested before the
next one is taken.

You need three signers on three separate devices or with three separate people. The current owner
(a Coinbase smart wallet) can be one of them; the other two should not share its device, its
recovery phrase or its cloud backup. A hardware wallet is the usual second one.

In the Safe app → **Settings → Setup**:

1. **Add owner B, keep the threshold at 1.** Use "Add new owner" and leave "Required confirmations"
   at 1 out of 2. Check the address character by character against what B shows on its own device.
2. **Prove B works.** From B, create and execute a harmless transaction (for instance 0 ETH to the
   Safe itself). If B cannot execute, stop here: nothing has been lost, the threshold is still 1.
3. **Add owner C, keep the threshold at 1**, and prove C the same way.
4. **Raise the threshold to 2** ("Required confirmations" 2 out of 3).
5. **Prove 2-of-3 with a pair that does not include the original owner**, for example B and C. This
   is the recovery test: it shows the Safe survives losing the first key.
6. **Write down the recovery plan** — where each recovery phrase is kept, who can reach it — and keep
   it offline and apart from the keys.

After step 4 every Safe transaction needs two signatures, including the timelock operations below.

## 2. Lengthen the timelock delay (done on 2026-10-05)

Executed through the Safe (signed by `0x6495…28dB` and `0x810f…be3e`); the timelock emitted `MinDelayChange(3600, 86400)` and `isOperationDone` is true for the operation below. What follows is the procedure as it was run, kept for the next change (48 h before mainnet).

`updateDelay` can only be called by the timelock itself, so the change goes through the timelock
under the current 1-hour delay: the Safe schedules it, waits an hour, then executes it. Rehearsed on a
fork: scheduling works for the Safe and not for anyone else, execution one second early is refused,
execution after the hour sets the delay to 86 400 s, and the Safe remains proposer and executor.

Run it before step 4 above if you prefer to do it with the single signer, or after, with two.

**Transaction 1 — schedule.** Safe → Transaction Builder → Custom data:

- To: `0xD94ea36FD19a0D3Cb3A8EA1214C6F97A947e5950`
- Value: `0`
- Data:

```
0x01d5062a000000000000000000000000d94ea36fd19a0d3cb3a8ea1214c6f97a947e5950000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000009cbf02e7efd20b139c1f8089356e4bd5c68444f85b8d7095fa5738012224c1290000000000000000000000000000000000000000000000000000000000000e10000000000000000000000000000000000000000000000000000000000000002464d62353000000000000000000000000000000000000000000000000000000000001518000000000000000000000000000000000000000000000000000000000
```

The operation id is `0x3e580d062e5e047cc2c3e8e5620af70e2db206750f7e88db4dc0956ed728f2e9`
(24 h = 86 400 s; salt `0x9cbf02e7…c129`).

**Transaction 2 — execute, at least one hour later.** Same destination, Value `0`, Data:

```
0x134008d3000000000000000000000000d94ea36fd19a0d3cb3a8ea1214c6f97a947e5950000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000009cbf02e7efd20b139c1f8089356e4bd5c68444f85b8d7095fa5738012224c129000000000000000000000000000000000000000000000000000000000000002464d62353000000000000000000000000000000000000000000000000000000000001518000000000000000000000000000000000000000000000000000000000
```

Check from any terminal:

```bash
cast call 0xD94ea36FD19a0D3Cb3A8EA1214C6F97A947e5950 "getMinDelay()(uint256)" --rpc-url https://sepolia.base.org   # 86400 afterwards
cast call 0xD94ea36FD19a0D3Cb3A8EA1214C6F97A947e5950 "isOperationDone(bytes32)(bool)" 0x3e580d062e5e047cc2c3e8e5620af70e2db206750f7e88db4dc0956ed728f2e9 --rpc-url https://sepolia.base.org
```

From then on every governance operation waits 24 hours between schedule and execute. That is the
point: it is the window in which a mistaken or hostile proposal can be seen and cancelled (the Safe
holds the canceller role). For mainnet use the same procedure with a longer value: only the number
in the calldata changes (`cast calldata "updateDelay(uint256)" 172800` for 48 h, then rebuild the
schedule and execute data with a new salt).

Sentinel actions — pause, dispute, block — are deliberately **not** timelocked: reducing risk must
stay immediate.

## 3. Replace the simulation identities with the real operators

The roles below are held by identities derived for the agent simulation. They exist to exercise the
protocol, not to run it. For each role, from the Safe: grant the role to the real address first,
confirm it works, then revoke the simulation identity. Never revoke first.

| Role | Held today by | Who should hold it |
|---|---|---|
| Underwriting curator | `0xBDEE…5907` | the underwriting syndicate's operating key |
| Sentinel | `0xDD66…FDF5` | a hot key, or a small multisig, reachable at any hour (it only reduces risk) |
| Claims committee | `0x4dA5…F555` | the committee's multisig |
| KYC operator | `0xe6b3…7cf0` | the compliance operator |
| Allocator | `0xe10E…23D8` | the allocator bot's dedicated key |
| Oracle publisher | `0x899b…Ecd` | the AI node's dedicated key — see `docs/AI_INTEGRATION.md` |
| Cedant | `0xbF0b…ce4D` | the ceding insurer's own wallet |

Put the real addresses in `contracts/roles.rotation.template.json` (a copy) and run
`node scripts/prepare-role-rotation.mjs --plan <file>`. It refuses an unfilled role, an address that
would hold two roles, and the Safe, the timelock or the deployer as a holder; it simulates every call
as the Safe on the live chain and writes two Transaction Builder batches, `roles-1-grant.json` and
`roles-2-revoke.json`. Run the first, confirm every new holder can act, then the second. Afterwards
`--check` reads the chain and says which roles have moved. The calls are `grantRole` and `revokeRole`
on ProtocolRoles `0xB073F2Da83F008be6C3Abce25eDe2aebD621c1ba`; the Safe administers all of them, so
no timelock delay applies.

## 4. After all three

Re-read the state and record it in `docs/PROJECT_STATUS.md`: Safe owners and threshold, timelock
delay, and who holds each operational role. Until all three are done the governance is a testnet
setup and no real value should depend on it.
