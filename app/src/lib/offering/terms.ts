/**
 * Vault offering terms — pure domain logic (validation, normalisation,
 * formatting). Framework-free and smoke-tested; no HTTP/DB in this module.
 *
 * Offering terms are the curator-supplied commercial metadata of a vault
 * (manager identity, strategy statement, risk grade, illustrative target
 * APY range). They REPLACE the static demo map in config/vaultDisplay.ts:
 * when a row exists for a vault the UI shows it with a Backend data-source
 * badge; when none exists the UI falls back to the illustrative defaults.
 * Writing terms is gated on-chain (UNDERWRITING_CURATOR_ROLE / OWNER_ROLE —
 * see lib/offering/auth.ts); this module only decides what a valid row is.
 */

export const RISK_GRADES = ['LOWER', 'MODERATE', 'HIGHER', 'HIGH'] as const;
export type RiskGrade = (typeof RISK_GRADES)[number];

/** Colour used by the vault table risk chip, per grade. */
export const RISK_GRADE_COLORS: Record<RiskGrade, string> = {
  LOWER: '#047857',
  MODERATE: '#B45309',
  HIGHER: '#C2410C',
  HIGH: '#B91C1C',
};

export interface OfferingTerms {
  /** Lowercased 0x-address of the vault. */
  vaultAddress: string;
  managerName: string;
  strategyStatement: string;
  riskGrade: RiskGrade;
  /** Illustrative target APY range in bps (e.g. 800–1200 = 8–12%). */
  targetApyMinBps: number;
  targetApyMaxBps: number;
  /** Wallet that signed the last update (server-verified). */
  updatedBy: string;
  updatedAt: string;
}

export interface OfferingTermsInput {
  vaultAddress: string;
  managerName: string;
  strategyStatement: string;
  riskGrade: string;
  targetApyMinBps: number;
  targetApyMaxBps: number;
}

export type ValidationResult = { ok: true; value: OfferingTermsInput } | { ok: false; errors: string[] };

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
export const MAX_MANAGER_NAME = 80;
export const MAX_STRATEGY = 280;
/** Hard cap: an illustrative target above 50% APY is not institutional copy. */
export const MAX_TARGET_BPS = 5000;

/** Validates and normalises curator input. Collects ALL problems. */
export function validateOfferingTerms(input: OfferingTermsInput): ValidationResult {
  const errors: string[] = [];

  const vaultAddress = (input.vaultAddress ?? '').trim().toLowerCase();
  if (!ADDRESS_RE.test(vaultAddress)) errors.push('vaultAddress must be a 0x…40-hex address');

  const managerName = (input.managerName ?? '').trim();
  if (managerName.length === 0) errors.push('managerName is required');
  if (managerName.length > MAX_MANAGER_NAME) errors.push(`managerName exceeds ${MAX_MANAGER_NAME} chars`);

  const strategyStatement = (input.strategyStatement ?? '').trim();
  if (strategyStatement.length === 0) errors.push('strategyStatement is required');
  if (strategyStatement.length > MAX_STRATEGY) errors.push(`strategyStatement exceeds ${MAX_STRATEGY} chars`);

  const riskGrade = (input.riskGrade ?? '').trim().toUpperCase();
  if (!(RISK_GRADES as readonly string[]).includes(riskGrade)) {
    errors.push(`riskGrade must be one of ${RISK_GRADES.join('/')}`);
  }

  const min = input.targetApyMinBps;
  const max = input.targetApyMaxBps;
  if (!Number.isInteger(min) || min < 0) errors.push('targetApyMinBps must be a non-negative integer');
  if (!Number.isInteger(max) || max <= 0) errors.push('targetApyMaxBps must be a positive integer');
  if (Number.isInteger(min) && Number.isInteger(max) && min > max) {
    errors.push('targetApyMinBps must not exceed targetApyMaxBps');
  }
  if (Number.isInteger(max) && max > MAX_TARGET_BPS) {
    errors.push(`targetApyMaxBps exceeds the ${MAX_TARGET_BPS} bps cap`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      vaultAddress,
      managerName,
      strategyStatement,
      riskGrade,
      targetApyMinBps: min,
      targetApyMaxBps: max,
    },
  };
}

/** "800–1200 bps" → "8–12%"; integer percents drop decimals (850 → 8.5%). */
export function formatApyRangeBps(minBps: number, maxBps: number): string {
  const fmt = (bps: number) => {
    const pct = bps / 100;
    return Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
  };
  return `${fmt(minBps)}–${fmt(maxBps)}%`;
}

/** DB row (snake_case) → domain object. Returns null on malformed rows. */
export function parseTermsRow(row: Record<string, unknown>): OfferingTerms | null {
  const vaultAddress = typeof row.vault_address === 'string' ? row.vault_address.toLowerCase() : null;
  const managerName = typeof row.manager_name === 'string' ? row.manager_name : null;
  const strategyStatement = typeof row.strategy_statement === 'string' ? row.strategy_statement : null;
  const riskGrade = typeof row.risk_grade === 'string' ? row.risk_grade.toUpperCase() : null;
  const minBps = typeof row.target_apy_min_bps === 'number' ? row.target_apy_min_bps : null;
  const maxBps = typeof row.target_apy_max_bps === 'number' ? row.target_apy_max_bps : null;
  if (
    vaultAddress == null ||
    managerName == null ||
    strategyStatement == null ||
    riskGrade == null ||
    !(RISK_GRADES as readonly string[]).includes(riskGrade) ||
    minBps == null ||
    maxBps == null
  ) {
    return null;
  }
  return {
    vaultAddress,
    managerName,
    strategyStatement,
    riskGrade: riskGrade as RiskGrade,
    targetApyMinBps: minBps,
    targetApyMaxBps: maxBps,
    updatedBy: typeof row.updated_by === 'string' ? row.updated_by : '',
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : '',
  };
}

/** Index a list by lowercased vault address for O(1) UI lookups. */
export function indexTermsByVault(list: OfferingTerms[]): Map<string, OfferingTerms> {
  const map = new Map<string, OfferingTerms>();
  for (const t of list) map.set(t.vaultAddress.toLowerCase(), t);
  return map;
}
