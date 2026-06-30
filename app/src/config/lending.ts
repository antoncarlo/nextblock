// Hand-maintained ABIs + config for the permissioned LendingMarket UI.
//
// This is intentionally SEPARATE from the auto-generated `config/contracts.ts`
// (which is codegen'd from Foundry artifacts + the deployments address book).
// The on-chain LendingMarket is deployed via `script/DeployLendingMarket.s.sol`;
// until a market address is provided through `NEXT_PUBLIC_LENDING_MARKET_ADDRESS`
// the UI renders an explicit "not yet deployed" state.

export const LENDING_CHAIN_ID = 84_532 as const;

const ZERO = '0x0000000000000000000000000000000000000000';

/** Optional market address from env; `undefined` when not yet deployed/configured. */
export function getLendingMarketAddress(): `0x${string}` | undefined {
  const raw = process.env.NEXT_PUBLIC_LENDING_MARKET_ADDRESS;
  if (!raw || !/^0x[0-9a-fA-F]{40}$/.test(raw) || raw.toLowerCase() === ZERO) {
    return undefined;
  }
  return raw as `0x${string}`;
}

export const LENDING_MARKET_ABI = [
  // --- views ---
  { type: 'function', name: 'lltvBps', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'liqLtvBps', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalSupplyAssets', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalBorrowAssets', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalCollateral', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'collateralToken', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  {
    type: 'function',
    name: 'supplyShares',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'collateralOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'borrowAssetsOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'isHealthy',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  // --- writes ---
  {
    type: 'function',
    name: 'supply',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'assets', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'assets', type: 'uint256' }, { name: 'to', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'depositCollateral',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdrawCollateral',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'shares', type: 'uint256' }, { name: 'to', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'borrow',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'assets', type: 'uint256' }, { name: 'to', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'repay',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'assets', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export const LENDING_MARKET_FACTORY_ABI = [
  { type: 'function', name: 'getMarkets', stateMutability: 'view', inputs: [], outputs: [{ type: 'address[]' }] },
  { type: 'function', name: 'getMarketCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'isMarket',
    stateMutability: 'view',
    inputs: [{ name: 'market', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
] as const;
