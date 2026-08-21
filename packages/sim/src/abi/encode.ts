import { encodeFunctionData, parseAbi, keccak256, toHex, type Abi, type Address } from 'viem';

import type { PlannedAction } from '../agents/types.ts';
import type { Addresses } from '../agents/roster.ts';

/**
 * Turns a planned action into calldata the chain will accept.
 *
 * The roster describes what an agent means to do — deploy capital, file a
 * claim, publish a NAV — with the arguments that matter to the policy. Those
 * are not the same as the arguments the ABI wants: a claim carries a type and
 * an evidence hash the policy never mentions, a portfolio submission is a
 * ten-field struct, and several functions the roster names by intent are
 * spelled differently on chain.
 *
 * This file is where the two are reconciled, and reconciling them is the point
 * rather than a chore. Writing it surfaced every place the roster and the
 * contracts disagreed — `distributePremium` is `receivePremium`, `submitClaim`
 * takes five arguments and the policy supplied three, `createVault` takes six
 * and the policy supplied one. Each of those would have been a run full of
 * findings about the harness. They are corrected here, once, against the real
 * signatures.
 */

/** ABIs limited to what the agents call. Parsed from the deployed signatures. */
const VAULT = parseAbi([
  'function deposit(uint256 assets, address receiver) returns (uint256)',
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256)',
  'function withdraw(uint256 assets, address receiver, address owner) returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function claimFees(address recipient)',
]);

const ALLOCATOR = parseAbi([
  'function proposeAllocation(address vault, uint256 portfolioId, uint256 amount) returns (uint256)',
  'function proposeDeallocation(address vault, uint256 portfolioId, uint256 amount) returns (uint256)',
]);

const CLAIMS = parseAbi([
  'function submitClaim(address vault, uint256 portfolioId, uint256 amount, uint8 claimType, bytes32 evidenceHash) returns (uint256)',
  'function approveClaim(uint256 claimId, uint256 approvedAmount)',
  'function rejectClaim(uint256 claimId, string reason)',
  'function freezeClaim(uint256 claimId)',
  'function disputeClaim(uint256 claimId, string reason)',
  'function executeClaim(uint256 claimId)',
]);

const PORTFOLIOS = parseAbi([
  'function submitPortfolio((string,string,bytes32,string,string,uint8,uint256,uint256,uint64,uint64) p) returns (uint256)',
  'function startReview(uint256 portfolioId)',
  'function approvePortfolio(uint256 portfolioId, uint16 expectedLossBps)',
  'function rejectPortfolio(uint256 portfolioId, string reason)',
  'function activatePortfolio(uint256 portfolioId)',
  'function pausePortfolio(uint256 portfolioId)',
  'function markExpired(uint256 portfolioId)',
]);

const COMPLIANCE = parseAbi([
  'function setWhitelist(address user, bool allowed)',
  'function setKycExpiry(address user, uint64 expiry)',
  'function setInvestorLimit(address user, uint256 limit)',
]);

const ORACLE = parseAbi([
  'function publishNav(address vault, uint256 nav, uint16 confidenceBps, bytes32 sourceHash)',
  'function pauseFeed(address vault)',
]);

const DISTRIBUTOR = parseAbi([
  'function receivePremium(uint256 portfolioId, uint256 grossAmount)',
]);

const FACTORY = parseAbi([
  'function createVault(string name, string symbol, string vaultName, address vaultManager_, uint256 bufferRatioBps_, uint256 managementFeeBps_) returns (address)',
]);

const TIMELOCK = parseAbi([
  'function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)',
  'function execute(address target, uint256 value, bytes payload, bytes32 predecessor, bytes32 salt) payable',
]);

/**
 * What the encoder needs beyond the action itself.
 *
 * The self address is who signs, and for deposit and redeem it is also the
 * receiver — a fund subscribes for itself, not on behalf of a third party. The
 * LP target is the account a KYC action operates on, distinct from the operator
 * taking the action. The salt makes evidence hashes and vault names unique
 * across a run, so two claims never collide on the same identifier.
 */
export interface EncodeContext {
  self: Address;
  lpTarget: Address;
  timestamp: bigint;
  salt: bigint;
}

const YEAR = 365n * 24n * 60n * 60n;

function unique(ctx: EncodeContext, label: string): `0x${string}` {
  return keccak256(toHex(`${label}:${ctx.salt}:${ctx.self}`));
}

/**
 * Builds `{ abi, address, calldata }` for one action.
 *
 * Throws if a function has no encoding, which is deliberate: an action the
 * encoder does not understand must stop the run rather than be sent as an empty
 * call and recorded as a mysterious revert. A gap here is a gap in the harness,
 * and the harness should fail loudly at its own gaps.
 */
export function encodeAction(
  action: PlannedAction,
  addr: Addresses,
  ctx: EncodeContext,
): { address: Address; abi: Abi; data: `0x${string}` } {
  const { functionName, args } = action;
  const n = (i: number) => args[i] as never;

  switch (functionName) {
    // --- vault ---
    case 'deposit':
      return call(addr.vault, VAULT, 'deposit', [n(0), ctx.self]);
    case 'redeem':
      return call(addr.vault, VAULT, 'redeem', [n(0), ctx.self, ctx.self]);
    case 'withdraw':
      return call(addr.vault, VAULT, 'withdraw', [n(0), ctx.self, ctx.self]);
    case 'transfer':
      return call(addr.vault, VAULT, 'transfer', [n(0), n(1)]);
    case 'claimFees':
      return call(addr.vault, VAULT, 'claimFees', [ctx.self]);

    // --- allocator ---
    case 'proposeAllocation':
      return call(addr.allocator, ALLOCATOR, 'proposeAllocation', [n(0), n(1), n(2)]);
    case 'proposeDeallocation':
      return call(addr.allocator, ALLOCATOR, 'proposeDeallocation', [n(0), n(1), n(2)]);

    // --- claims ---
    // The policy carries vault, portfolio and amount; the type and the evidence
    // hash are supplied here. Type 0 is the institutional non-parametric path.
    case 'submitClaim':
      return call(addr.claims, CLAIMS, 'submitClaim', [n(0), n(1), n(2), 0, unique(ctx, 'evidence')]);
    case 'approveClaim':
      return call(addr.claims, CLAIMS, 'approveClaim', [n(0), n(1)]);
    case 'rejectClaim':
      return call(addr.claims, CLAIMS, 'rejectClaim', [n(0), stringArg(n(1))]);
    case 'freezeClaim':
      return call(addr.claims, CLAIMS, 'freezeClaim', [n(0)]);
    case 'disputeClaim':
      return call(addr.claims, CLAIMS, 'disputeClaim', [n(0), stringArg(n(1))]);
    case 'executeClaim':
      return call(addr.claims, CLAIMS, 'executeClaim', [n(0)]);

    // --- portfolios ---
    case 'submitPortfolio':
      // The ten-field struct the policy abbreviates to "a cedant offers a book".
      // Coverage and premium are sized to leave room under the caps; the tenor
      // is a year, the spread of shorter ones being the on-chain agents' job.
      return call(addr.portfolios, PORTFOLIOS, 'submitPortfolio', [
        [
          `Ceded Book ${ctx.salt}`,
          'ipfs://QmCeded',
          unique(ctx, 'doc'),
          'Mixed',
          'EU',
          0, // QUOTA_SHARE
          1_000_000_000_000n, // 1,000,000 USDC coverage
          50_000_000_000n, // 50,000 USDC premium
          ctx.timestamp,
          ctx.timestamp + YEAR,
        ],
      ]);
    case 'startReview':
      return call(addr.portfolios, PORTFOLIOS, 'startReview', [n(0)]);
    case 'approvePortfolio':
      return call(addr.portfolios, PORTFOLIOS, 'approvePortfolio', [n(0), n(1)]);
    case 'rejectPortfolio':
      return call(addr.portfolios, PORTFOLIOS, 'rejectPortfolio', [n(0), stringArg(n(1))]);
    case 'activatePortfolio':
      return call(addr.portfolios, PORTFOLIOS, 'activatePortfolio', [n(0)]);
    case 'pausePortfolio':
      return call(addr.portfolios, PORTFOLIOS, 'pausePortfolio', [n(0)]);
    case 'markExpired':
      return call(addr.portfolios, PORTFOLIOS, 'markExpired', [n(0)]);

    // --- compliance. The target is the LP, not the operator signing. ---
    case 'setWhitelist':
      return call(addr.compliance, COMPLIANCE, 'setWhitelist', [ctx.lpTarget, false]);
    case 'setKycExpiry':
      // One second into the past: an expiry, by the smallest margin that counts.
      return call(addr.compliance, COMPLIANCE, 'setKycExpiry', [ctx.lpTarget, ctx.timestamp - 1n]);
    case 'setInvestorLimit':
      return call(addr.compliance, COMPLIANCE, 'setInvestorLimit', [ctx.lpTarget, n(0)]);

    // --- oracle. The policy gives vault, value, confidence; the source is here. ---
    case 'publishNav':
      return call(addr.navOracle, ORACLE, 'publishNav', [n(0), n(1), n(2), unique(ctx, 'nav')]);
    case 'pauseFeed':
      return call(addr.navOracle, ORACLE, 'pauseFeed', [n(0)]);

    // --- premium. The policy said distributePremium; the contract says receive. ---
    case 'distributePremium':
      return call(addr.distributor, DISTRIBUTOR, 'receivePremium', [n(0), n(1)]);

    // --- factory. Six arguments, of which the policy supplied one. ---
    case 'createVault':
      return call(addr.factory, FACTORY, 'createVault', [
        `Sim Vault ${ctx.salt}`,
        `nbSIM${ctx.salt}`,
        `Sim Vault ${ctx.salt}`,
        ctx.self, // the curator is its own manager
        BigInt(n(0)),
        0n,
      ]);

    // --- governance ---
    case 'schedule':
      return call(addr.timelock, TIMELOCK, 'schedule', [
        addr.vault,
        0n,
        '0x',
        `0x${'0'.repeat(64)}`,
        unique(ctx, 'gov'),
        3600n,
      ]);
    case 'execute':
      return call(addr.timelock, TIMELOCK, 'execute', [
        addr.vault,
        0n,
        '0x',
        `0x${'0'.repeat(64)}`,
        unique(ctx, 'gov'),
      ]);

    default:
      throw new Error(
        `encodeAction: no encoding for "${functionName}". The harness must fail at its own gaps, ` +
          `not send an empty call and record the revert as a finding about the protocol.`,
      );
  }
}

function call(
  address: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[],
): { address: Address; abi: Abi; data: `0x${string}` } {
  return { address, abi, data: encodeFunctionData({ abi, functionName, args } as never) };
}

/** A string argument, defaulting when the policy passed a non-string. */
function stringArg(v: unknown): string {
  return typeof v === 'string' ? v : 'reason';
}

/** Every function name the encoder understands, for the coverage test. */
export const ENCODABLE = new Set([
  'deposit', 'redeem', 'withdraw', 'transfer', 'claimFees',
  'proposeAllocation', 'proposeDeallocation',
  'submitClaim', 'approveClaim', 'rejectClaim', 'freezeClaim', 'disputeClaim', 'executeClaim',
  'submitPortfolio', 'startReview', 'approvePortfolio', 'rejectPortfolio', 'activatePortfolio', 'pausePortfolio', 'markExpired',
  'setWhitelist', 'setKycExpiry', 'setInvestorLimit',
  'publishNav', 'pauseFeed',
  'distributePremium',
  'createVault',
  'schedule', 'execute',
]);
