/**
 * Governance timelock-builder smoke checks (pure, no network).
 *
 *   node --experimental-strip-types app/scripts/governance-timelock-smoke.ts
 *
 * Scope: OZ hashOperation parity against a `cast abi-encode | cast keccak`
 * vector, schedule/execute calldata roundtrips (viem decode), role-operation
 * builders, deterministic salts, Safe batch shape.
 */

import { decodeFunctionData, parseAbi } from 'viem';
import {
  buildGrantRoleOperation,
  buildRevokeRoleOperation,
  buildRawOperation,
  buildOperationBatches,
  hashOperation,
  encodeSchedule,
  encodeExecute,
  roleId,
  saltFromLabel,
  ZERO_BYTES32,
  type TimelockOperation,
} from '../src/lib/governance/timelock.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

const ROLES = '0xEE93166a2cf213243eF330a664682290b195c976' as const;
const TIMELOCK = '0x6e2927627d83A90EDC9cDA3c626B49875f9449CF' as const;
const ACCOUNT = '0xfF6f0d49dD2187351264C4d3bbd5537bE8Ad81d2' as const;

// ─── hashOperation parity with cast ──────────────────────────────────────────
// Vector produced with:
//   cast abi-encode "f(address,uint256,bytes,bytes32,bytes32)" \
//     0xEE93166a2cf213243eF330a664682290b195c976 0 \
//     0x2f2ff15d…(grantRole(bytes32(0), 0xff6f…81d2)) 0x00…00 0x11…11 | cast keccak
const CAST_VECTOR = '0xaef351831b90a0e58a898d3735bc1dafe19f19e8490c5ab465f563efd2e74ecf';
const vectorOp: TimelockOperation = {
  label: 'cast-vector',
  target: ROLES,
  value: 0n,
  data: '0x2f2ff15d000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ff6f0d49dd2187351264c4d3bbd5537be8ad81d2',
  predecessor: ZERO_BYTES32,
  salt: `0x${'11'.repeat(32)}`,
};
check('hashOperation parity with cast', hashOperation(vectorOp) === CAST_VECTOR);

// ─── Role builders ───────────────────────────────────────────────────────────
const grant = buildGrantRoleOperation(ROLES, 'UNDERWRITING_CURATOR_ROLE', ACCOUNT);
check('grantRole selector', grant.data.startsWith('0x2f2ff15d'));
check('grantRole embeds role id', grant.data.includes(roleId('UNDERWRITING_CURATOR_ROLE').slice(2)));
check('grantRole embeds account', grant.data.toLowerCase().includes(ACCOUNT.toLowerCase().slice(2)));
check('grant salt deterministic', grant.salt === saltFromLabel(`grantRole:UNDERWRITING_CURATOR_ROLE:${ACCOUNT.toLowerCase()}`));

const revoke = buildRevokeRoleOperation(ROLES, 'SENTINEL_ROLE', ACCOUNT);
check('revokeRole selector', revoke.data.startsWith('0xd547741f'));
check('grant and revoke ids differ', hashOperation(grant) !== hashOperation(revoke));

// ─── schedule/execute calldata roundtrip ─────────────────────────────────────
const TL_ABI = parseAbi([
  'function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)',
  'function execute(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt) payable',
]);

const sched = decodeFunctionData({ abi: TL_ABI, data: encodeSchedule(grant, 86_400n) });
check('schedule fn name', sched.functionName === 'schedule');
check('schedule target', (sched.args[0] as string).toLowerCase() === ROLES.toLowerCase());
check('schedule inner data', sched.args[2] === grant.data);
check('schedule delay', sched.args[5] === 86_400n);

const exec = decodeFunctionData({ abi: TL_ABI, data: encodeExecute(grant) });
check('execute fn name', exec.functionName === 'execute');
check('execute salt matches', exec.args[4] === grant.salt);

// ─── Raw operation ───────────────────────────────────────────────────────────
const raw = buildRawOperation('pause-feed', TIMELOCK, '0xdeadbeef');
check('raw op keeps calldata', raw.data === '0xdeadbeef' && raw.value === 0n);

// ─── Safe batches ────────────────────────────────────────────────────────────
const batches = buildOperationBatches(grant, TIMELOCK, 84532, 86_400n, 1_781_800_000_000);
check('batch id is operation hash', batches.id === hashOperation(grant));
check('schedule batch targets timelock', batches.schedule.transactions[0].to === TIMELOCK);
check('schedule batch chain id', batches.schedule.chainId === '84532');
check('execute batch single tx', batches.execute.transactions.length === 1);
check('batch data differs between steps', batches.schedule.transactions[0].data !== batches.execute.transactions[0].data);
check('batch json serializable', JSON.parse(JSON.stringify(batches.schedule)).version === '1.0');

// ─── Verdict ─────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.error(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log('\nALL PASS');
