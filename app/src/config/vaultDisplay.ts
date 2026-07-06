/**
 * Presentational vault metadata — SINGLE SOURCE (used by the vault table and
 * the vault detail page).
 *
 * ⚠️ NONE of this is on-chain data. Manager names are illustrative staging
 * personas, and `targetApy` is an illustrative TARGET range set by hand for
 * the Base Sepolia pilot — it is NOT computed from premiums, NAV, or any
 * historical performance. Do not present these figures as measured yield.
 *
 * Production path: offering terms (manager identity, strategy statement,
 * target return, risk grade) must come from curator-supplied metadata at
 * vault creation (see PROJECT_STATUS §4 open scope), not from this file.
 */
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
    targetApy: "8-12%",
  },
  "Digital Asset Shield": {
    manager: "AlphaRe Capital",
    strategy: "Automated on-chain claims only, pure crypto risk exposure",
    riskLevel: "Higher",
    riskColor: "#C2410C",
    targetApy: "10-14%",
  },
  "Parametric Shield": {
    manager: "StormGuard Capital",
    strategy: "Oracle-verified parametric insurance only",
    riskLevel: "Moderate",
    riskColor: "#B45309",
    targetApy: "9-13%",
  },
  "Conservative Yield": {
    manager: "Klapton Re Partners",
    strategy: "Low-volatility off-chain reinsurance portfolio",
    riskLevel: "Lower",
    riskColor: "#047857",
    targetApy: "5-8%",
  },
  "Catastrophe & Specialty": {
    manager: "Alpine Re",
    strategy: "Catastrophe-focused with specialty lines diversification",
    riskLevel: "High",
    riskColor: "#B91C1C",
    targetApy: "14-18%",
  },
  "Traditional Lines": {
    manager: "BondSecure Capital",
    strategy: "Established commercial and liability reinsurance",
    riskLevel: "Lower",
    riskColor: "#047857",
    targetApy: "6-9%",
  },
  "Technology & Specialty": {
    manager: "CyberGuard Partners",
    strategy: "Digital asset and technology risk with property diversification",
    riskLevel: "Moderate",
    riskColor: "#B45309",
    targetApy: "8-11%",
  },
  "Multi-Line Diversified": {
    manager: "Meridian Risk Mgmt",
    strategy: "Maximum diversification across all categories",
    riskLevel: "Moderate",
    riskColor: "#B45309",
    targetApy: "9-13%",
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
