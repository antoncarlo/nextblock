/**
 * Pilot onboarding hub status smoke checks.
 *
 * Runs with the Node 22 TypeScript strip-types loader so no test framework or
 * new dependency is required:
 *
 *   node --experimental-strip-types app/scripts/pilot-onboarding-smoke.ts
 *
 * Scope: pure status computation, chain check, testnet asset requirements,
 * role-track derivation and deterministic next-action mapping. No network, no
 * wagmi, no key material.
 */

import {
  PILOT_CHAIN_ID,
  MIN_ETH_WEI,
  MIN_USDC_6,
  isCorrectChain,
  meetsEthRequirement,
  meetsUsdcRequirement,
  kybStatusLabel,
  hasAnyRole,
  deriveActiveTracks,
  nextAction,
  computeChecklist,
  NO_ROLES,
  ROLE_TRACKS,
  type RoleFlags,
  type PilotInput,
} from '../src/lib/pilot/status.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

const ROLES = (over: Partial<RoleFlags>): RoleFlags => ({ ...NO_ROLES, ...over });

const base: PilotInput = {
  walletConnected: true,
  chainId: PILOT_CHAIN_ID,
  ethWei: MIN_ETH_WEI,
  usdc6: MIN_USDC_6,
  kyb: 'approved',
  roles: ROLES({ isCedant: true }),
  rolesResolved: true,
};

// --- chain check ---
check('correct chain', isCorrectChain(84532));
check('wrong chain (mainnet)', !isCorrectChain(8453));
check('undefined chain', !isCorrectChain(undefined));

// --- asset requirements ---
check('eth exactly min', meetsEthRequirement(MIN_ETH_WEI));
check('eth below min', !meetsEthRequirement(MIN_ETH_WEI - 1n));
check('eth undefined (loading)', !meetsEthRequirement(undefined));
check('usdc exactly min', meetsUsdcRequirement(MIN_USDC_6));
check('usdc below min', !meetsUsdcRequirement(0n));
check('usdc undefined (loading)', !meetsUsdcRequirement(undefined));

// --- kyb labels ---
check('kyb approved label', kybStatusLabel('approved') === 'Approved');
check('kyb under_review label', kybStatusLabel('under_review') === 'Under review');
check('kyb none label', kybStatusLabel('none') === 'Not submitted');

// --- role tracks ---
check('no role -> only viewer', deriveActiveTracks(NO_ROLES).length === 1);
check('viewer always present', deriveActiveTracks(NO_ROLES)[0].key === 'VIEWER');
check('cedant -> cedant track + viewer', deriveActiveTracks(ROLES({ isCedant: true })).some(t => t.key === 'CEDANT'));
check('curator -> curator + asset_manager tracks', deriveActiveTracks(ROLES({ isCurator: true })).filter(t => t.key === 'CURATOR' || t.key === 'ASSET_MANAGER').length === 2);
check('owner -> operator track', deriveActiveTracks(ROLES({ isOwner: true })).some(t => t.key === 'OPERATOR'));
check('hasAnyRole false for none', !hasAnyRole(NO_ROLES));
check('hasAnyRole true for sentinel', hasAnyRole(ROLES({ isSentinel: true })));
check('ROLE_TRACKS covers 6 role tracks', ROLE_TRACKS.length === 6);

// --- next action priority ---
check('disconnected -> blocked connect', nextAction({ ...base, walletConnected: false }).severity === 'blocked');
check('wrong chain -> blocked switch', nextAction({ ...base, chainId: 8453 }).message.includes('Base Sepolia'));
check('eth loading -> info', nextAction({ ...base, ethWei: undefined }).severity === 'info');
check('no eth -> blocked faucet w/ url', (() => { const a = nextAction({ ...base, ethWei: 0n }); return a.severity === 'blocked' && !!a.ctaUrl; })());
check('kyb none -> action apply', (() => { const a = nextAction({ ...base, kyb: 'none' }); return a.severity === 'action' && a.ctaRoute === '/app/apply'; })());
check('kyb under_review -> info', nextAction({ ...base, kyb: 'under_review' }).severity === 'info');
check('kyb rejected -> blocked', nextAction({ ...base, kyb: 'rejected' }).severity === 'blocked');
check('kyb unavailable -> info', nextAction({ ...base, kyb: 'unavailable' }).severity === 'info');
check('approved + roles not resolved -> info', nextAction({ ...base, roles: NO_ROLES, rolesResolved: false }).severity === 'info');
check('approved + no role -> action grant', (() => { const a = nextAction({ ...base, roles: NO_ROLES, rolesResolved: true }); return a.severity === 'action' && a.message.includes('grant'); })());
check('cedant role + no usdc -> action mint', (() => { const a = nextAction({ ...base, usdc6: 0n }); return a.severity === 'action' && a.ctaLabel === 'Mint test USDC'; })());
check('sentinel role no usdc -> ready (no usdc nudge)', (() => { const a = nextAction({ ...base, roles: ROLES({ isSentinel: true }), usdc6: 0n }); return a.severity === 'ready'; })());
check('fully ready -> ready w/ route', (() => { const a = nextAction(base); return a.severity === 'ready' && !!a.ctaRoute; })());

// --- checklist ---
const cl = computeChecklist(base);
check('checklist has 6 items', cl.length === 6);
check('checklist wallet ok', cl.find(i => i.key === 'wallet')?.state === 'ok');
check('checklist role ok for cedant', cl.find(i => i.key === 'role')?.state === 'ok');
check('checklist disconnected -> chain na', computeChecklist({ ...base, walletConnected: false }).find(i => i.key === 'chain')?.state === 'na');
check('checklist eth loading state', computeChecklist({ ...base, ethWei: undefined }).find(i => i.key === 'eth')?.state === 'loading');
check('checklist kyb pending for submitted', computeChecklist({ ...base, kyb: 'submitted' }).find(i => i.key === 'kyb')?.state === 'pending');

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll pilot onboarding smoke checks passed');
