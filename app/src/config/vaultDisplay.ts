/**
 * Presentational vault metadata — SINGLE SOURCE (vault table, vault card and
 * the vault detail page all read it through `resolveVaultDisplay`).
 *
 * ⚠️ NONE of this is on-chain data. Manager names are illustrative staging
 * personas, and `targetApy` is an illustrative TARGET range — it is NOT
 * computed from premiums, NAV, or any historical performance. Do not present
 * these figures as measured yield.
 *
 * Every vault carries the SAME range, 8–14%, because that is the protocol-level
 * range in the offering documents. It used to be eight different hand-written
 * ranges (5–8% through 14–18%), which implied per-vault underwriting analysis
 * that does not exist and put two of them outside what the documents state. One
 * figure that matches the documents beats eight that do not.
 *
 * Distinct per-vault ranges are legitimate — but they must arrive as published
 * offering terms, entered by the curator at /app/admin/offering-terms and read
 * through `resolveVaultDisplay`, which overrides everything here the moment real
 * terms exist. Do not hand-edit a vault-specific range back into this file.
 */
import {
  formatApyRangeBps,
  RISK_GRADE_COLORS,
  type OfferingTerms,
} from '@/lib/offering/terms';

export interface VaultDisplayMeta {
  manager: string;
  strategy: string;
  riskLevel: string;
  riskColor: string;
  targetApy: string;
}

const VAULT_DISPLAY: Record<string, VaultDisplayMeta> = {
  "Balanced Core": {
    manager: "NextBlock Core Team",
    strategy: "Full-spectrum diversification across all verification types",
    riskLevel: "Moderate",
    riskColor: "#B45309",
    targetApy: "8-14%",
  },
  "Digital Asset Shield": {
    manager: "AlphaRe Capital",
    strategy: "Automated on-chain claims only, pure crypto risk exposure",
    riskLevel: "Higher",
    riskColor: "#C2410C",
    targetApy: "8-14%",
  },
  "Parametric Shield": {
    manager: "StormGuard Capital",
    strategy: "Oracle-verified parametric insurance only",
    riskLevel: "Moderate",
    riskColor: "#B45309",
    targetApy: "8-14%",
  },
  "Conservative Yield": {
    manager: "Klapton Re Partners",
    strategy: "Low-volatility off-chain reinsurance portfolio",
    riskLevel: "Lower",
    riskColor: "#047857",
    targetApy: "8-14%",
  },
  "Catastrophe & Specialty": {
    manager: "Alpine Re",
    strategy: "Catastrophe-focused with specialty lines diversification",
    riskLevel: "High",
    riskColor: "#B91C1C",
    targetApy: "8-14%",
  },
  "Traditional Lines": {
    manager: "BondSecure Capital",
    strategy: "Established commercial and liability reinsurance",
    riskLevel: "Lower",
    riskColor: "#047857",
    targetApy: "8-14%",
  },
  "Technology & Specialty": {
    manager: "CyberGuard Partners",
    strategy: "Digital asset and technology risk with property diversification",
    riskLevel: "Moderate",
    riskColor: "#B45309",
    targetApy: "8-14%",
  },
  "Multi-Line Diversified": {
    manager: "Meridian Risk Mgmt",
    strategy: "Maximum diversification across all categories",
    riskLevel: "Moderate",
    riskColor: "#B45309",
    targetApy: "8-14%",
  },
};

const FALLBACK: VaultDisplayMeta = {
  manager: "Vault Manager",
  strategy: "Custom strategy",
  riskLevel: "Moderate",
  riskColor: "#B45309",
  targetApy: "8-14%",
};

/** Longest-key-first lookup by vault name substring. */
export function getVaultDisplay(name: string): VaultDisplayMeta {
  for (const [key, value] of Object.entries(VAULT_DISPLAY)) {
    if (name.includes(key)) return value;
  }
  return FALLBACK;
}

/** Display meta plus WHERE it came from — the UI must label the difference. */
export interface ResolvedVaultDisplay extends VaultDisplayMeta {
  /** 'curated' = curator-supplied offering terms (backend, role-gated write);
   *  'illustrative' = the static demo defaults above. */
  source: 'curated' | 'illustrative';
}

/**
 * Overlays curator-supplied offering terms (lib/offering/terms.ts) on the
 * illustrative defaults. Curated terms always win; the fallback keeps the
 * table renderable for vaults whose curator has not published terms yet.
 */
export function resolveVaultDisplay(
  name: string,
  curated: OfferingTerms | undefined,
): ResolvedVaultDisplay {
  if (curated) {
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
  return { ...getVaultDisplay(name), source: 'illustrative' };
}
