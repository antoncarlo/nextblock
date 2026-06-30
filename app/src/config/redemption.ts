// Hand-maintained ABI + config for the periodic-window RedemptionQueue UI.
//
// SEPARATE from the auto-generated `config/contracts.ts`: the queue is deployed
// via `script/DeployRedemptionQueue.s.sol` as a parallel generation bound to its
// own vault. Until an address is provided through
// `NEXT_PUBLIC_REDEMPTION_QUEUE_ADDRESS` the UI renders a "not yet deployed"
// state. The bound vault is read FROM the queue (`vault()`), never assumed.

export const REDEMPTION_CHAIN_ID = 84_532 as const;

const ZERO = '0x0000000000000000000000000000000000000000';

/** Optional queue address from env; `undefined` when not yet deployed/configured. */
export function getRedemptionQueueAddress(): `0x${string}` | undefined {
  const raw = process.env.NEXT_PUBLIC_REDEMPTION_QUEUE_ADDRESS;
  if (!raw || !/^0x[0-9a-fA-F]{40}$/.test(raw) || raw.toLowerCase() === ZERO) {
    return undefined;
  }
  return raw as `0x${string}`;
}

export const REDEMPTION_QUEUE_ABI = [
  // --- views ---
  { type: 'function', name: 'vault', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'asset', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'epochDuration', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] },
  { type: 'function', name: 'currentEpochId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'currentEpochMaturesAt', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] },
  { type: 'function', name: 'escrowedShares', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'epochs',
    stateMutability: 'view',
    inputs: [{ name: 'epochId', type: 'uint256' }],
    outputs: [
      { name: 'totalSharesRequested', type: 'uint256' },
      { name: 'settledShares', type: 'uint256' },
      { name: 'settledAssets', type: 'uint256' },
      { name: 'settledAt', type: 'uint64' },
      { name: 'settled', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'sharesRequested',
    stateMutability: 'view',
    inputs: [{ name: 'epochId', type: 'uint256' }, { name: 'lp', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claimed',
    stateMutability: 'view',
    inputs: [{ name: 'epochId', type: 'uint256' }, { name: 'lp', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'previewClaim',
    stateMutability: 'view',
    inputs: [{ name: 'epochId', type: 'uint256' }, { name: 'lp', type: 'address' }],
    outputs: [{ name: 'assetsPaid', type: 'uint256' }, { name: 'sharesReturned', type: 'uint256' }],
  },
  // --- writes ---
  {
    type: 'function',
    name: 'requestRedemption',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ name: 'epochId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'epochId', type: 'uint256' }],
    outputs: [{ name: 'assetsPaid', type: 'uint256' }, { name: 'sharesReturned', type: 'uint256' }],
  },
] as const;
