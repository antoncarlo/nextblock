# Governance Phase 2 — Readiness and Dry-Run Runbook

Status: PREPARATION ONLY. Nothing in this document is authorized for
execution. Every on-chain step below requires a separate, explicit owner
authorization, and Phase 2 itself additionally requires a successful
timelock rehearsal. See the standing block in `docs/OPERATIONS.md`.

On-chain state in this document was verified read-only on Base Sepolia
(2026-06-12) with `script/GovernanceCheck.s.sol` (pure simulation, no key).

## 1. Current vs target role matrix

Holders: deployer = `0xfF6f...81d2`, timelock = `0x6e29...49CF`
(ProtocolTimelock, minDelay 3600s), safe = `0x8Fd8...F870`.

| Contract | Role | Current holder (verified) | Target holder | Risk if unchanged | Action |
|---|---|---|---|---|---|
| ProtocolRoles | DEFAULT_ADMIN_ROLE | deployer + timelock | timelock ONLY | Single EOA can rewire all role admins instantly, bypassing the delay | Phase 2 stage B: deployer renounce |
| ProtocolRoles | OWNER_ROLE | deployer + timelock | timelock ONLY | Single EOA can execute every risk-increasing config with no delay | Phase 2 stage B: deployer renounce |
| ProtocolRoles | UNDERWRITING_CURATOR_ROLE | deployer | Dedicated curator key or curator Safe | Underwriting decisions keyed to the deploy key | Stage A: grant to dedicated address, revoke from deployer |
| ProtocolRoles | ALLOCATOR_ROLE | deployer | Dedicated allocator/bot key (caps-bounded) | Allocation authority tied to deploy key | Stage A |
| ProtocolRoles | SENTINEL_ROLE | deployer | Dedicated guardian key(s)/Safe, FAST path (never timelocked) | Emergency response depends on one busy key | Stage A; may hold multiple guardians |
| ProtocolRoles | CLAIMS_COMMITTEE_ROLE | deployer | Claims committee Safe (3-of-5 target) | Off-chain claim approval is single-signer | Stage A |
| ProtocolRoles | AUTHORIZED_CEDANT_ROLE | deployer | Real/labelled test cedant wallets only | Cedant flows muddled with admin key | Stage A |
| ProtocolRoles | KYC_OPERATOR_ROLE | deployer | Dedicated operator key/Safe (used by KYB review + whitelist acts) | Compliance authority on deploy key | Stage A |
| ProtocolRoles | ORACLE_ROLE | deployer | Dedicated oracle-node key | NAV/attestation authority on deploy key | Stage A |
| ProtocolRoles | PREMIUM_DEPOSITOR_ROLE | nobody | nobody (vault-level `setAuthorizedPremiumDepositor` is the path) | none | none (verified intentional) |
| ProtocolRoles | VAULT_FACTORY_ROLE | VaultFactory contract | unchanged | none | none (correct by design) |
| ProtocolTimelock | PROPOSER/EXECUTOR/CANCELLER | safe | safe (later: curator Safe proposer, ops executor split optional) | acceptable | optional refinement post-Phase 2 |
| ProtocolTimelock | DEFAULT_ADMIN_ROLE | timelock itself (deployer: none) | unchanged | none | none |

Emergency powers that MUST survive Phase 2: SENTINEL_ROLE stays direct and
immediate (pause, dispute, block flags, adapter disable) — it is risk-
reducing and cannot move funds; it must never be routed through the timelock.

## 2. Residual governance risks

| Sev | Risk |
|---|---|
| P0 | Deployer EOA still holds OWNER_ROLE + DEFAULT_ADMIN_ROLE: full instant control bypassing the timelock until stage B executes |
| P0 | No timelocked operation has ever been executed end-to-end (rehearsal missing): Phase 2 would hand control to an unproven path |
| P1 | All operational roles concentrated on the same deployer EOA (no key separation: curator=sentinel=committee=kycOperator=oracle) |
| P1 | Safe signer policy unverified from the repo (threshold/owners not documented here); confirm before relying on it as sole proposer |
| P2 | Single executor (safe) on the timelock; an unavailable Safe delays execution of already-matured operations |
| P2 | No fork tests pinning governance behavior against live Base Sepolia state |

## 3. Phase 2 dry-run runbook

### Prerequisites
- Safe `0x8Fd8...F870` operational: signers and threshold confirmed by owner.
- Dedicated addresses generated and custodied for: curator, sentinel,
  committee (Safe), kycOperator, oracle node, allocator (when bot exists).
- `GovernanceCheck` output reviewed and matching section 1.

### Step 0 — Read-only baseline (no authorization needed)
```bash
cd contracts
forge script script/GovernanceCheck.s.sol --rpc-url https://sepolia.base.org
```

### Step 1 — REHEARSAL (requires explicit authorization; prerequisite for everything else)
One harmless timelocked operation, end to end:
1. From the Safe UI, schedule on the timelock:
   target = ProtocolRoles, value 0,
   data = grantRole(KYC_OPERATOR_ROLE, <dedicated operator address>),
   predecessor = 0x0, salt = 0x0, delay = 3600.
2. Wait >= 1h. 3. Execute from the Safe. 4. Verify:
```bash
cast call <protocolRoles> "hasRole(bytes32,address)(bool)" \
  $(cast keccak "KYC_OPERATOR_ROLE") <operator> --rpc-url https://sepolia.base.org
```
Abort criteria: schedule reverts, operation not Ready after delay, execute
reverts, or any signer unable to act. Cancellation drill (optional but
recommended): schedule a second dummy op and cancel it from the Safe.

### Step 2 — Stage A: key separation (reversible; explicit authorization per batch)
For each operational role: grant to the dedicated address, verify, then
revoke from the deployer. While the deployer still holds OWNER_ROLE these
are plain transactions; after stage B they must flow through the timelock.
Every grant/revoke is independently verifiable with `GovernanceCheck`.
Rollback: while stage B has not executed, any grant can be reverted by the
deployer; that is why stage A comes first.

### Step 3 — Stage B: final handover (IRREVERSIBLE; separate explicit authorization)
Simulation first (no key, no broadcast):
```bash
cd contracts
PROTOCOL_ROLES=<roles> TIMELOCK_ADDRESS=<timelock> RENOUNCE_DEPLOYER=true \
  forge script script/GovernanceMigration.s.sol --rpc-url https://sepolia.base.org \
  --sender <deployer>
```
The script asserts the timelock already holds OWNER_ROLE and
DEFAULT_ADMIN_ROLE before renouncing. Only after the simulation is reviewed
may an authorized broadcast be considered. After execution, the deployer
must show `false` for OWNER_ROLE and DEFAULT_ADMIN_ROLE in
`GovernanceCheck`, and a post-handover rehearsal (one more timelocked op)
must succeed.

### Post-Phase 2 checks
- `GovernanceCheck`: deployer false everywhere except roles intentionally
  retained as a labelled test actor (ideally none).
- Emergency drill: sentinel pause path executes immediately.
- Update `deployments/84532-staging.json` role entries + regenerate the
  address book; update `docs/SECURITY_MODEL.md` section 2 and the gap matrix.

## 4. Fork rehearsal test package

Phase 2 is rehearsed in code on two levels (no broadcast is possible from
`forge test` by construction):

- `test/governance/GovernancePhase2Rehearsal.t.sol` — deterministic local
  model of the staging posture, always runs in CI: rehearsal op with delay
  enforcement, Stage A reversibility, Stage B irreversibility, post-handover
  timelock-only control, sentinel emergency path staying direct, and the
  guard that blocks renounce when the timelock lacks ownership.
- `test/fork/GovernancePhase2Fork.t.sol` — Step 1 rehearsal, Stage B
  renounce and post-handover control executed against the REAL Base Sepolia
  contracts inside a fork pinned at block 42,720,000 (after the phase 1
  broadcast); Stage A key separation is covered by the local rehearsal test
  only. Skipped automatically when `BASE_SEPOLIA_RPC_URL` is not set, so CI
  stays network-free.

```bash
# always-on local rehearsal (CI-safe)
forge test --match-contract GovernancePhase2RehearsalTest -vvv

# fork rehearsal against live staging state (read-only fork memory)
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org \
  forge test --match-path "test/fork/*" -vvv
```

The fork command requires an RPC provider that serves historical state for
the pinned block (archive access). If the provider has pruned that block,
the fork setup fails loudly at `createSelectFork`; nothing silently falls
back to latest state.

### Global abort criteria
Any unexpected holder in the baseline, failed rehearsal, Safe quorum doubt,
minDelay below 3600, or mismatch between address book and on-chain state:
stop, report, do not proceed.
