import { keccak256, stringToHex, parseUnits } from 'viem';

/**
 * Pure portfolio submission form logic (no React, no wagmi): enum mirror,
 * validation and the on-chain SubmissionParams derivation. Shared by the
 * PortfolioPanel UI and the node strip-types smoke script, so it must stay
 * dependency-light (viem only).
 *
 * Mirrors PortfolioRegistry.submitPortfolio validation: coverage>0,
 * cededPremium>0, expiry>inception, documentHash != 0, name non-empty.
 */

/**
 * StructureType as a const object (not a TS `enum`) so this module stays
 * erasable-syntax-only and runs under the Node `--experimental-strip-types`
 * smoke loader, while still being usable as `StructureType.QUOTA_SHARE`.
 */
export const StructureType = {
  QUOTA_SHARE: 0,
  XOL: 1,
  SURPLUS: 2,
  PARAMETRIC: 3,
  OTHER: 4,
} as const;
export type StructureType = (typeof StructureType)[keyof typeof StructureType];

export const STRUCTURE_LABEL: Record<StructureType, string> = {
  [StructureType.QUOTA_SHARE]: 'Quota share',
  [StructureType.XOL]: 'Excess of loss',
  [StructureType.SURPLUS]: 'Surplus share',
  [StructureType.PARAMETRIC]: 'Parametric',
  [StructureType.OTHER]: 'Other / bespoke',
};

/** Raw form values as typed by the cedant. */
export interface PortfolioFormInput {
  name: string;
  lineOfBusiness: string;
  jurisdiction: string;
  structureType: StructureType;
  coverageLimit: string; // USDC, human units
  cededPremium: string; // USDC, human units
  inceptionDate: string; // yyyy-mm-dd
  expiryDate: string; // yyyy-mm-dd
  metadataURI: string; // optional
  evidenceReference: string; // hashed -> documentHash (required: contract needs non-zero)
}

/** Validated on-chain SubmissionParams (bigint/hex), ready for the contract. */
export interface PortfolioSubmissionParams {
  name: string;
  metadataURI: string;
  documentHash: `0x${string}`;
  lineOfBusiness: string;
  jurisdiction: string;
  structureType: StructureType;
  coverageLimit: bigint;
  cededPremium: bigint;
  inceptionTime: bigint;
  expiryTime: bigint;
}

export type ValidationResult =
  | { ok: true; params: PortfolioSubmissionParams }
  | { ok: false; errors: string[] };

/** keccak256 of an evidence/metadata reference -> non-zero bytes32 documentHash. */
export function deriveDocumentHash(reference: string): `0x${string}` {
  return keccak256(stringToHex(reference));
}

/** yyyy-mm-dd (UTC midnight) -> unix seconds; NaN-safe (returns 0 on bad input). */
export function toUnixSeconds(dateStr: string): bigint {
  const ms = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(ms)) return 0n;
  return BigInt(Math.floor(ms / 1000));
}

/** USDC (6dp) parse; throws on malformed input (caller validates first). */
export function parseUsdc(value: string): bigint {
  return parseUnits(value, 6);
}

const USDC_RE = /^\d+(\.\d{1,6})?$/;

/**
 * Validate the cedant form and derive on-chain params. Mirrors the contract's
 * revert conditions plus the task's required non-empty fields.
 */
export function validatePortfolioForm(input: PortfolioFormInput): ValidationResult {
  const errors: string[] = [];

  if (input.name.trim().length === 0) errors.push('Name is required.');
  if (input.lineOfBusiness.trim().length === 0) errors.push('Line of business is required.');
  if (input.jurisdiction.trim().length === 0) errors.push('Jurisdiction is required.');
  if (!(input.structureType in STRUCTURE_LABEL)) errors.push('Structure type is invalid.');
  if (input.evidenceReference.trim().length === 0) {
    errors.push('Evidence reference is required (hashed to the document hash).');
  }

  if (!USDC_RE.test(input.coverageLimit) || Number(input.coverageLimit) <= 0) {
    errors.push('Coverage limit must be a positive USDC amount (max 6 decimals).');
  }
  if (!USDC_RE.test(input.cededPremium) || Number(input.cededPremium) <= 0) {
    errors.push('Ceded premium must be a positive USDC amount (max 6 decimals).');
  }

  const inception = toUnixSeconds(input.inceptionDate);
  const expiry = toUnixSeconds(input.expiryDate);
  if (inception === 0n) errors.push('Inception date is required.');
  if (expiry === 0n) errors.push('Expiry date is required.');
  if (inception !== 0n && expiry !== 0n && expiry <= inception) {
    errors.push('Expiry must be after inception.');
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    params: {
      name: input.name.trim(),
      metadataURI: input.metadataURI.trim(),
      documentHash: deriveDocumentHash(input.evidenceReference.trim()),
      lineOfBusiness: input.lineOfBusiness.trim(),
      jurisdiction: input.jurisdiction.trim(),
      structureType: input.structureType,
      coverageLimit: parseUsdc(input.coverageLimit),
      cededPremium: parseUsdc(input.cededPremium),
      inceptionTime: inception,
      expiryTime: expiry,
    },
  };
}

/** expectedLossBps validation for the curator approval action. */
export function isValidLossBps(bps: number): boolean {
  return Number.isInteger(bps) && bps >= 0 && bps <= 10_000;
}
