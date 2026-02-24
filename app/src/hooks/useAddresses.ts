'use client';

import { useChainId } from 'wagmi';
import { CHAIN_ADDRESSES, ZERO_ADDRESSES } from '@/config/contracts';

/**
 * Returns contract addresses for the currently connected chain.
 */
export function useAddresses() {
  const chainId = useChainId();
  return CHAIN_ADDRESSES[chainId] ?? ZERO_ADDRESSES;
}
