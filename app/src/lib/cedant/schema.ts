import { z } from 'zod';
import { kybApplicationPayloadSchema } from '@/lib/kyb/schema';

/**
 * Cedant-specific underwriting metadata that the Curator needs to size the
 * dedicated vault. Persisted in `cedant_profiles` (1:1 with kyb_applications
 * when applicantType='cedant'). Free-form arrays are constrained by the form
 * UI but kept open in the DB so unusual sub-lines (e.g. parametric+cyber
 * hybrid) don't get rejected at the schema layer.
 */

export const POLICY_TYPES = [
  'catastrophe',
  'property',
  'motor',
  'marine',
  'aviation',
  'cyber',
  'life',
  'health',
  'parametric',
  'other',
] as const;

export type PolicyType = (typeof POLICY_TYPES)[number];

/** Order-of-magnitude band; no false precision pre-due-diligence. */
export const PREMIUM_BANDS = ['<1M', '1M-10M', '10M-50M', '50M-200M', '>200M'] as const;
export type PremiumBand = (typeof PREMIUM_BANDS)[number];

export const cedantProfileSchema = z.object({
  policyTypes: z.array(z.enum(POLICY_TYPES)).min(1).max(10),
  /** ISO-3166 alpha-2 codes; 1 to 50 entries. Free-form keeps room for non-ISO. */
  geoScope: z
    .array(
      z
        .string()
        .trim()
        .min(2)
        .max(6)
        .transform((s) => s.toUpperCase()),
    )
    .min(1)
    .max(50),
  annualPremiumBand: z.enum(PREMIUM_BANDS),
  /** Self-declared, in USDC (decimals 6); Curator sets the real cap separately. */
  expectedCededCapacityUsdc: z
    .number()
    .int()
    .positive()
    .max(1_000_000_000n as unknown as number) // 1B USDC cap to catch typos at submit
    .optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

export type CedantProfileInput = z.infer<typeof cedantProfileSchema>;

/**
 * Intake payload: the public KYB payload merged with the cedant-specific
 * profile. applicantType is forced to 'cedant' at the route layer regardless
 * of what the client sends; this keeps the intake endpoint single-purpose.
 */
export const cedantIntakeSchema = z.object({
  kyb: kybApplicationPayloadSchema,
  profile: cedantProfileSchema,
});

export type CedantIntakePayload = z.infer<typeof cedantIntakeSchema>;
