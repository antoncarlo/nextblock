/**
 * Protocol NAV: the vault's own accounting, attested on chain. SERVER-ONLY pure module.
 *
 * NavOracle needs an attestation per vault before the lens, the lending oracle and the
 * transparency page can show a published NAV. The AI provider (Braino.ai / WAVENURE) is the
 * intended source of an analytical NAV, but it is a vendor integration that is not live. This
 * module builds the same publishNav arguments from data that is already on chain:
 *
 *     nav = InsuranceVault.totalAssets()
 *         = balance - unearnedPremiums - pendingClaims - accruedFees   (floored at zero)
 *
 * That is the figure the vault already uses to price shares at deposit and redemption, so
 * attesting it introduces no new price. It is a book value. It does not price the underlying
 * reinsurance risk, which is what the AI NAV adds. Every report says so, and the sourceHash
 * anchors the exact inputs (spec section 5 evidence protocol): keccak256 of the canonical JSON.
 *
 * Pure: no network, no chain, no clock. The keeper reads the vault at one block and passes
 * that block's number and timestamp in, so the same inputs always give the same hash.
 */

import { keccak256, toBytes } from 'viem';
import { canonicalJson, sourceHash, type CanonicalValue, type PublishNavArgs } from './oracle-node.ts';

export const PROTOCOL_NAV_FORMULA_VERSION = 'nextblock-protocol-nav/1';

/**
 * The arithmetic is exact, so confidence in it is full. This is NOT a claim about the value of
 * the underlying risk, which this NAV does not estimate (see the report's basis field).
 */
export const PROTOCOL_NAV_CONFIDENCE_BPS = 10_000;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export interface VaultNavInputs {
  vault: string;
  chainId: number;
  /** Block the inputs were read at. */
  blockNumber: bigint;
  /** Timestamp of that block, in unix seconds. */
  blockTimestamp: number;
  /** InsuranceVault.totalAssets(), USDC 6dp. */
  totalAssets: bigint;
  totalShares: bigint;
  /** USDC held by the vault. */
  balance: bigint;
  unearnedPremiums: bigint;
  pendingClaims: bigint;
  accumulatedFees: bigint;
}

export type ProtocolNavResult =
  | { ok: true; args: PublishNavArgs; report: Record<string, CanonicalValue> }
  | { ok: false; reason: 'invalid_vault' | 'empty' | 'inconsistent'; detail: string };

/**
 * Build the publishNav arguments for a vault, or say why none should be sent.
 *
 *  - invalid_vault: the address is malformed.
 *  - empty: totalAssets is zero, there is nothing to attest (the node-side pre-flight also
 *    rejects a zero NAV, and an empty vault has no price to protect).
 *  - inconsistent: totalAssets exceeds balance less unearned premiums and pending claims. The
 *    vault's formula can only subtract fees from that figure, so this means the inputs were
 *    read at different blocks or the vault is not the contract we expect. Nothing is published.
 */
export function buildProtocolNav(i: VaultNavInputs): ProtocolNavResult {
  if (!ADDRESS_RE.test(i.vault ?? '')) {
    return { ok: false, reason: 'invalid_vault', detail: 'vault must be a 0x…40-hex address' };
  }
  if (i.totalAssets === 0n) {
    return { ok: false, reason: 'empty', detail: 'totalAssets is zero, nothing to attest' };
  }

  const liabilities = i.unearnedPremiums + i.pendingClaims;
  const netBalance = i.balance > liabilities ? i.balance - liabilities : 0n;
  if (i.totalAssets > netBalance) {
    return {
      ok: false,
      reason: 'inconsistent',
      detail: `totalAssets ${i.totalAssets} exceeds balance less liabilities ${netBalance}`,
    };
  }

  const report: Record<string, CanonicalValue> = {
    provider: 'nextblock-protocol-formula',
    formulaVersion: PROTOCOL_NAV_FORMULA_VERSION,
    formula: 'totalAssets = balance - unearnedPremiums - pendingClaims - accruedFees, floored at zero',
    basis:
      'Book value under the vault own ERC-4626 accounting. It is not an actuarial valuation and does not price the underlying reinsurance risk.',
    chainId: i.chainId,
    vault: i.vault.toLowerCase(),
    blockNumber: i.blockNumber.toString(),
    blockTimestamp: i.blockTimestamp,
    currency: 'USDC',
    decimals: 6,
    nav: i.totalAssets.toString(),
    totalAssets: i.totalAssets.toString(),
    totalShares: i.totalShares.toString(),
    balance: i.balance.toString(),
    unearnedPremiums: i.unearnedPremiums.toString(),
    pendingClaims: i.pendingClaims.toString(),
    accumulatedFees: i.accumulatedFees.toString(),
  };

  return {
    ok: true,
    report,
    args: {
      vault: i.vault as `0x${string}`,
      nav: i.totalAssets,
      confidenceBps: PROTOCOL_NAV_CONFIDENCE_BPS,
      sourceHash: sourceHash(report),
    },
  };
}

/** The canonical bytes behind a protocol NAV hash, for the evidence log the keeper prints. */
export function protocolNavEvidence(report: Record<string, CanonicalValue>): { json: string; hash: `0x${string}` } {
  const json = canonicalJson(report);
  return { json, hash: keccak256(toBytes(json)) };
}
