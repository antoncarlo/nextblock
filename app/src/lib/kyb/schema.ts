import { z } from 'zod';

/**
 * KYB/KYC application domain schema (institutional onboarding pipeline).
 *
 * This module is pure and dependency-light on purpose: it is consumed by the
 * API route handlers (server), by the apply/review UI (client) and by the
 * smoke checks (node --experimental-strip-types), so it must not import any
 * server-only or browser-only code.
 *
 * The database is the INSTRUCTIONAL record only: approval here never touches
 * the on-chain ComplianceRegistry. The whitelist write remains a separate,
 * explicitly authorized act of the KYC Operator (Safe flow).
 */

export const KYB_STATUSES = [
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'needs_info',
] as const;

export type KybStatus = (typeof KYB_STATUSES)[number];

export const KYB_APPLICANT_TYPES = ['cedant', 'curator'] as const;
export type KybApplicantType = (typeof KYB_APPLICANT_TYPES)[number];

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Base Sepolia is the only MVP staging chain. */
export const KYB_CHAIN_ID = 84532;

export const kybApplicationPayloadSchema = z.object({
  applicantType: z.enum(KYB_APPLICANT_TYPES),
  walletAddress: z.string().regex(EVM_ADDRESS_RE, 'invalid EVM address'),
  companyName: z.string().trim().min(2).max(200),
  legalEntityType: z.string().trim().min(1).max(100),
  jurisdiction: z.string().trim().min(2).max(100),
  licenseNumber: z.string().trim().max(100).optional().or(z.literal('')),
  /** Self-declared figure (portfolio size or AUM). Free text, never rendered
   *  as a protocol metric. */
  declaredPortfolio: z.string().trim().max(200).optional().or(z.literal('')),
  contactName: z.string().trim().min(2).max(200),
  contactEmail: z.string().trim().email().max(320),
  website: z.string().trim().url().max(300).optional().or(z.literal('')),
  description: z.string().trim().max(4000).optional().or(z.literal('')),
  chainId: z.literal(KYB_CHAIN_ID),
});

export type KybApplicationPayload = z.infer<typeof kybApplicationPayloadSchema>;

/**
 * Review state machine. approved/rejected are terminal; needs_info loops back
 * to under_review when the applicant provides what was asked.
 */
const TRANSITIONS: Record<KybStatus, readonly KybStatus[]> = {
  submitted: ['under_review', 'rejected', 'needs_info'],
  under_review: ['approved', 'rejected', 'needs_info'],
  needs_info: ['under_review', 'rejected'],
  approved: [],
  rejected: [],
};

export function isValidTransition(from: KybStatus, to: KybStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export const kybReviewRequestSchema = z.object({
  toStatus: z.enum(KYB_STATUSES),
  note: z.string().trim().max(2000).optional().or(z.literal('')),
  auth: z.object({
    address: z.string().regex(EVM_ADDRESS_RE),
    /** Unix seconds the message was signed at. */
    timestamp: z.number().int().positive(),
    /** EIP-191 personal_sign signature of operatorAuthMessage(action, timestamp). */
    signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  }),
});

export type KybReviewRequest = z.infer<typeof kybReviewRequestSchema>;

/** Seconds an operator signature stays valid. Known limit: within this window
 *  the same signature could be replayed; acceptable for the staging
 *  instructional pipeline, to be replaced by nonce-based sessions before
 *  production. */
export const OPERATOR_AUTH_WINDOW_SECONDS = 300;

/** Canonical message signed by the operator wallet (EIP-191 personal_sign). */
export function operatorAuthMessage(action: string, timestamp: number): string {
  return `NextBlock KYB operator authentication\naction: ${action}\ntimestamp: ${timestamp}`;
}

/** Accepts timestamps up to `window` seconds old, with 60s of clock skew. */
export function isTimestampWithinWindow(
  signedAt: number,
  now: number,
  window: number = OPERATOR_AUTH_WINDOW_SECONDS,
): boolean {
  if (signedAt > now + 60) return false;
  return now - signedAt <= window;
}
