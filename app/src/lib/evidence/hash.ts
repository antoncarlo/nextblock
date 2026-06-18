/**
 * Evidence integrity hashing. The on-chain `evidenceHash` is keccak256 of the
 * committed document; uploaded bytes are hashed the same way and compared, so a
 * stored document can be proven to match what was committed on-chain.
 * Pure (viem only), framework-free — safe for the strip-types smoke loader.
 */

import { keccak256, type Hex } from 'viem';

/** keccak256 of raw file bytes, as a 0x-prefixed lowercase hex string. */
export function keccak256Hex(bytes: Uint8Array): Hex {
  return keccak256(bytes);
}

/** Compare two hashes 0x/case-insensitively (the on-chain hash may be checksummed). */
export function hashesMatch(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
