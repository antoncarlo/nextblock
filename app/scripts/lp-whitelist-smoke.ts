/**
 * LP whitelist (ComplianceRegistry.setWhitelist) admin smoke checks.
 *
 * Runs with the Node 22 TypeScript strip-types loader so no test framework or
 * new dependency is required:
 *
 *   node --experimental-strip-types app/scripts/lp-whitelist-smoke.ts
 *
 * Scope: address validation, setWhitelist calldata encode/decode + selector,
 * Safe payload shape, and the pure whitelist-readiness evaluation across
 * authorized / unauthorized / already-whitelisted / wrong-chain cases. No
 * network, no wagmi, no key material.
 */

import { decodeFunctionData, toFunctionSelector } from 'viem';
import {
  isValidAddress,
  buildSetWhitelistCalldata,
  buildSafeSetWhitelistPayload,
  evaluateWhitelist,
} from '../src/lib/compliance/whitelist.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

const LP = '0x2B1DaFD7f25B109cBbBaC3F01a674A89Af788f55';
const COMPLIANCE = '0x6A77634c65D0Fe5d9b925C73d6e09d7ADC365eB9';

// --- address validation ---
check('valid address', isValidAddress(LP));
check('lowercase valid', isValidAddress(LP.toLowerCase()));
check('too short invalid', !isValidAddress('0x1234'));
check('no prefix invalid', !isValidAddress(LP.slice(2)));
check('empty invalid', !isValidAddress(''));
check('null invalid', !isValidAddress(null));

// --- calldata encode/decode + selector ---
const SET_WHITELIST_ABI = [
  {
    type: 'function',
    name: 'setWhitelist',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'allowed', type: 'bool' },
    ],
    outputs: [],
  },
] as const;

const expectedSelector = toFunctionSelector('setWhitelist(address,bool)');
const calldataTrue = buildSetWhitelistCalldata(LP as `0x${string}`, true);
check('calldata is hex', /^0x[0-9a-f]+$/i.test(calldataTrue));
check('calldata selector matches setWhitelist(address,bool)', calldataTrue.slice(0, 10) === expectedSelector);

const decoded = decodeFunctionData({ abi: SET_WHITELIST_ABI, data: calldataTrue });
check('decoded fn is setWhitelist', decoded.functionName === 'setWhitelist');
check('decoded user arg', ((decoded.args?.[0] as string) ?? '').toLowerCase() === LP.toLowerCase());
check('decoded allowed=true', decoded.args?.[1] === true);

const decodedFalse = decodeFunctionData({ abi: SET_WHITELIST_ABI, data: buildSetWhitelistCalldata(LP as `0x${string}`, false) });
check('decoded allowed=false', decodedFalse.args?.[1] === false);

// --- Safe payload ---
const safe = buildSafeSetWhitelistPayload(COMPLIANCE, LP as `0x${string}`, true);
check('safe to = complianceRegistry', safe.to === COMPLIANCE);
check('safe value 0', safe.value === '0');
check('safe operation CALL', safe.operation === 0);
check('safe data matches calldata', safe.data === calldataTrue);

// --- pure readiness ---
const base = {
  targetAddress: LP,
  currentWhitelisted: false,
  allowed: true,
  isAuthorizedOperator: true,
  isCorrectChain: true,
};
check('authorized + ready', evaluateWhitelist(base) === 'ready');
check('unauthorized -> insufficient-permission', evaluateWhitelist({ ...base, isAuthorizedOperator: false }) === 'insufficient-permission');
check('already whitelisted (true==true) -> already', evaluateWhitelist({ ...base, currentWhitelisted: true, allowed: true }) === 'already');
check('already removed (false==false) -> already', evaluateWhitelist({ ...base, currentWhitelisted: false, allowed: false }) === 'already');
check('wrong chain -> wrong-chain', evaluateWhitelist({ ...base, isCorrectChain: false }) === 'wrong-chain');
check('invalid address -> invalid-address', evaluateWhitelist({ ...base, targetAddress: '0x123' }) === 'invalid-address');
check('priority: invalid before wrong-chain', evaluateWhitelist({ ...base, targetAddress: '0xbad', isCorrectChain: false }) === 'invalid-address');
check('priority: wrong-chain before permission', evaluateWhitelist({ ...base, isCorrectChain: false, isAuthorizedOperator: false }) === 'wrong-chain');
check('remove path ready (true->false)', evaluateWhitelist({ ...base, currentWhitelisted: true, allowed: false }) === 'ready');

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll LP whitelist smoke checks passed');
