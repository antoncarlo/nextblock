/**
 * KYB -> on-chain role handoff smoke checks.
 *
 * Runs with the Node 22 TypeScript strip-types loader so no test framework or
 * new dependency is required:
 *
 *   node --experimental-strip-types app/scripts/role-handoff-smoke.ts
 *
 * Scope: pure role-id derivation, applicant-type default mapping, restricted
 * role exclusion, address validation, grantRole calldata encode/decode and the
 * pure grant-readiness evaluation. No network, no wagmi, no key material.
 */

import { keccak256, toBytes, decodeFunctionData } from 'viem';
import {
  ROLE_ID,
  DEFAULT_ADMIN_ROLE,
  GRANTABLE_ROLES,
  RESTRICTED_ROLE_IDS,
  isGrantableRoleId,
  grantableRoleByKey,
  defaultRoleKeyForApplicant,
  authorizationActionForApplicant,
  isValidAddress,
  buildGrantRoleCalldata,
  buildSafeGrantRolePayload,
  evaluateGrant,
} from '../src/lib/roles/handoff.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

// --- role ids mirror keccak256(toBytes('<NAME>')) (same derivation as useProtocolAccess.ROLE_IDS) ---
check('OWNER id', ROLE_ID.OWNER === keccak256(toBytes('OWNER_ROLE')));
check('UNDERWRITING_CURATOR id', ROLE_ID.UNDERWRITING_CURATOR === keccak256(toBytes('UNDERWRITING_CURATOR_ROLE')));
check('AUTHORIZED_CEDANT id', ROLE_ID.AUTHORIZED_CEDANT === keccak256(toBytes('AUTHORIZED_CEDANT_ROLE')));
check('ALLOCATOR id', ROLE_ID.ALLOCATOR === keccak256(toBytes('ALLOCATOR_ROLE')));
check('SENTINEL id', ROLE_ID.SENTINEL === keccak256(toBytes('SENTINEL_ROLE')));
check('CLAIMS_COMMITTEE id', ROLE_ID.CLAIMS_COMMITTEE === keccak256(toBytes('CLAIMS_COMMITTEE_ROLE')));
check('KYC_OPERATOR id', ROLE_ID.KYC_OPERATOR === keccak256(toBytes('KYC_OPERATOR_ROLE')));
check('ORACLE id', ROLE_ID.ORACLE === keccak256(toBytes('ORACLE_ROLE')));
check('PREMIUM_DEPOSITOR id', ROLE_ID.PREMIUM_DEPOSITOR === keccak256(toBytes('PREMIUM_DEPOSITOR_ROLE')));
check('VAULT_FACTORY id', ROLE_ID.VAULT_FACTORY === keccak256(toBytes('VAULT_FACTORY_ROLE')));
check('DEFAULT_ADMIN_ROLE is bytes32 zero', DEFAULT_ADMIN_ROLE === `0x${'0'.repeat(64)}`);

// --- default applicant-type mapping ---
check('cedant -> AUTHORIZED_CEDANT', defaultRoleKeyForApplicant('cedant') === 'AUTHORIZED_CEDANT');
check('curator -> UNDERWRITING_CURATOR', defaultRoleKeyForApplicant('curator') === 'UNDERWRITING_CURATOR');
check('unknown -> null', defaultRoleKeyForApplicant('committee') === null);
check('undefined -> null', defaultRoleKeyForApplicant(undefined) === null);
check('lp -> no role (whitelist, not role)', defaultRoleKeyForApplicant('lp') === null);
check('action cedant -> role AUTHORIZED_CEDANT', (() => { const a = authorizationActionForApplicant('cedant'); return a.kind === 'role' && a.roleKey === 'AUTHORIZED_CEDANT'; })());
check('action curator -> role UNDERWRITING_CURATOR', (() => { const a = authorizationActionForApplicant('curator'); return a.kind === 'role' && a.roleKey === 'UNDERWRITING_CURATOR'; })());
check('action lp -> whitelist', authorizationActionForApplicant('lp').kind === 'whitelist');
check('action unknown -> manual', authorizationActionForApplicant('committee').kind === 'manual');

// --- grantable set excludes restricted roles ---
check('8 grantable roles', GRANTABLE_ROLES.length === 8);
check('OWNER not grantable', !isGrantableRoleId(ROLE_ID.OWNER));
check('DEFAULT_ADMIN not grantable', !isGrantableRoleId(DEFAULT_ADMIN_ROLE));
check('VAULT_FACTORY not grantable', !isGrantableRoleId(ROLE_ID.VAULT_FACTORY));
check('AUTHORIZED_CEDANT grantable', isGrantableRoleId(ROLE_ID.AUTHORIZED_CEDANT));
check('grantable set has no restricted member', GRANTABLE_ROLES.every(r => !RESTRICTED_ROLE_IDS.some(x => x.toLowerCase() === r.id.toLowerCase())));
check('isGrantableRoleId rejects garbage', !isGrantableRoleId('0xdeadbeef'));
check('grantableRoleByKey resolves', grantableRoleByKey('SENTINEL')?.id === ROLE_ID.SENTINEL);
check('grantableRoleByKey unknown -> undefined', grantableRoleByKey('NOPE') === undefined);

// --- address validation ---
const GOOD = '0x1026D55aCA2F66041675647bf759C50fFD465B3c';
check('valid address', isValidAddress(GOOD));
check('lowercase valid', isValidAddress(GOOD.toLowerCase()));
check('too short invalid', !isValidAddress('0x1234'));
check('no prefix invalid', !isValidAddress('1026D55aCA2F66041675647bf759C50fFD465B3c'));
check('empty invalid', !isValidAddress(''));
check('null invalid', !isValidAddress(null));

// --- grantRole calldata encodes and decodes ---
const calldata = buildGrantRoleCalldata(ROLE_ID.AUTHORIZED_CEDANT, GOOD as `0x${string}`);
check('calldata is hex', /^0x[0-9a-f]+$/i.test(calldata));
check('calldata selector is grantRole 0x2f2ff15d', calldata.slice(0, 10) === '0x2f2ff15d');
const decoded = decodeFunctionData({
  abi: [
    {
      type: 'function',
      name: 'grantRole',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'role', type: 'bytes32' },
        { name: 'account', type: 'address' },
      ],
      outputs: [],
    },
  ] as const,
  data: calldata,
});
check('decoded fn is grantRole', decoded.functionName === 'grantRole');
check('decoded role arg', (decoded.args?.[0] as string) === ROLE_ID.AUTHORIZED_CEDANT);
check('decoded account arg', ((decoded.args?.[1] as string) ?? '').toLowerCase() === GOOD.toLowerCase());

// --- Safe payload shape ---
const PROTOCOL_ROLES = '0xEE93166a2cf213243eF330a664682290b195c976';
const safe = buildSafeGrantRolePayload(PROTOCOL_ROLES, ROLE_ID.SENTINEL, GOOD as `0x${string}`);
check('safe to = protocolRoles', safe.to === PROTOCOL_ROLES);
check('safe value 0', safe.value === '0');
check('safe operation CALL', safe.operation === 0);
check('safe data matches calldata', safe.data === buildGrantRoleCalldata(ROLE_ID.SENTINEL, GOOD as `0x${string}`));

// --- pure grant-readiness ---
check('readiness invalid-address', evaluateGrant({ account: '0x123', roleId: ROLE_ID.SENTINEL, alreadyHasRole: false }) === 'invalid-address');
check('readiness no-role (null)', evaluateGrant({ account: GOOD, roleId: null, alreadyHasRole: false }) === 'no-role');
check('readiness no-role (restricted)', evaluateGrant({ account: GOOD, roleId: ROLE_ID.OWNER, alreadyHasRole: false }) === 'no-role');
check('readiness already-granted', evaluateGrant({ account: GOOD, roleId: ROLE_ID.SENTINEL, alreadyHasRole: true }) === 'already-granted');
check('readiness ready', evaluateGrant({ account: GOOD, roleId: ROLE_ID.SENTINEL, alreadyHasRole: false }) === 'ready');

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll role handoff smoke checks passed');
