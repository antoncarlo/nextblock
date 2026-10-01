/**
 * Presentational vault metadata — SINGLE SOURCE (vault table, vault card and
 * the vault detail page all read it through `resolveVaultDisplay`).
 *
 * Only real data reaches the screen. A vault carries a manager name, a strategy
 * statement, a risk grade and a target APY range if and only if its curator has
 * published them as offering terms (entered at /app/admin/offering-terms, a
 * role-gated, wallet-signed write). Until then the fields are simply absent and
 * the UI renders without them: nothing is invented to fill the space. The target
 * APY is the curator's stated target, not a measurement.
 */
import {
  formatApyRangeBps,
  RISK_GRADE_COLORS,
  type OfferingTerms,
} from '@/lib/offering/terms';

export interface VaultDisplayMeta {
  manager?: string;
  strategy?: string;
  riskLevel?: string;
  riskColor?: string;
  targetApy?: string;
}

/** Display meta plus whether the curator published it. */
export interface ResolvedVaultDisplay extends VaultDisplayMeta {
  /** 'curated' = curator-published offering terms (backend, role-gated write);
   *  'none' = the curator has published nothing, so every field is absent. */
  source: 'curated' | 'none';
}

/**
 * Curator-published offering terms (lib/offering/terms.ts) when they exist;
 * otherwise an object with no fields. `_name` is kept so callers do not change.
 */
export function resolveVaultDisplay(
  _name: string,
  curated: OfferingTerms | undefined,
): ResolvedVaultDisplay {
  if (!curated) return { source: 'none' };
  const grade = curated.riskGrade;
  return {
    manager: curated.managerName,
    strategy: curated.strategyStatement,
    riskLevel: grade.charAt(0) + grade.slice(1).toLowerCase(),
    riskColor: RISK_GRADE_COLORS[grade],
    targetApy: formatApyRangeBps(curated.targetApyMinBps, curated.targetApyMaxBps),
    source: 'curated',
  };
}
