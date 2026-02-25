"use client";
import Link from "next/link";
import { useVaultInfo } from "@/hooks/useVaultData";
import {
  useVaultPolicyIds,
  useGlobalPoliciesData,
} from "@/hooks/useVaultPolicies";
import { useEnsName } from "@/hooks/useEns";
import { VerificationDot } from "@/components/shared/VerificationBadge";
import {
  formatUSDCCompact,
  shortenAddress,
} from "@/lib/formatting";

const VAULT_DISPLAY: Record<
  string,
  {
    manager: string;
    strategy: string;
    riskLevel: string;
    riskColor: string;
    targetApy: string;
  }
> = {
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

function getVaultDisplay(name: string) {
  for (const [key, value] of Object.entries(VAULT_DISPLAY)) {
    if (name.includes(key)) return value;
  }
  return {
    manager: "Vault Manager",
    strategy: "Custom strategy",
    riskLevel: "Moderate",
    riskColor: "#B45309",
    targetApy: "8-14%",
  };
}

interface VaultRowProps {
  vaultAddress: `0x${string}`;
}

export function VaultRow({ vaultAddress }: VaultRowProps) {
  const { data: vaultInfo, isLoading, error } = useVaultInfo(vaultAddress);
  const { data: policyIds } = useVaultPolicyIds(vaultAddress);
  const { data: globalPolicies } = useGlobalPoliciesData(policyIds);

  const managerAddr = vaultInfo
    ? ((vaultInfo as unknown as [string, `0x${string}`])[1])
    : undefined;
  const { ensName } = useEnsName(managerAddr);

  if (isLoading) {
    return <VaultRowSkeleton />;
  }

  if (error || !vaultInfo) {
    return (
      <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
        <td style={{ padding: "16px 24px" }} colSpan={6}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "13px", color: "#B91C1C" }}>
            Failed to load vault {shortenAddress(vaultAddress)}
          </span>
        </td>
      </tr>
    );
  }

  const [name, , assets, , , , , , , policyCount] = vaultInfo as unknown as [
    string, `0x${string}`, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
  ];

  const display = getVaultDisplay(name);
  const managerDisplay = ensName || display.manager;

  const verificationTypes: Set<number> = new Set();
  if (globalPolicies) {
    for (const gp of globalPolicies) {
      if (gp.status === "success" && gp.result) {
        const policy = gp.result as unknown as { verificationType: number };
        verificationTypes.add(policy.verificationType);
      }
    }
  }

  return (
    <tr
      style={{
        borderBottom: "1px solid rgba(0,0,0,0.04)",
        transition: "background 0.15s",
        cursor: "pointer",
      }}
      className="group hover:bg-[#F2F1EE]"
    >
      {/* Vault name + strategy */}
      <td style={{ padding: "18px 24px" }}>
        <Link href={`/app/vault/${vaultAddress}`} style={{ textDecoration: "none", display: "block" }}>
          <div
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "15px",
              fontWeight: 400,
              color: "#0F1218",
              marginBottom: "3px",
              transition: "color 0.15s",
            }}
            className="group-hover:text-[#1B3A6B]"
          >
            {name}
          </div>
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: "12px",
              color: "#9A9A9A",
              lineHeight: 1.4,
            }}
          >
            {display.strategy}
          </div>
        </Link>
      </td>

      {/* TVL */}
      <td style={{ padding: "18px 24px" }}>
        <Link href={`/app/vault/${vaultAddress}`} style={{ textDecoration: "none", display: "block" }}>
          <span
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "15px",
              fontWeight: 400,
              color: "#0F1218",
            }}
          >
            {formatUSDCCompact(assets)}
          </span>
        </Link>
      </td>

      {/* Curator */}
      <td style={{ padding: "18px 24px" }}>
        <Link href={`/app/vault/${vaultAddress}`} style={{ textDecoration: "none", display: "block" }}>
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: "13px",
              color: "#4A4A4A",
            }}
          >
            {ensName || shortenAddress(managerAddr!)}
          </span>
        </Link>
      </td>

      {/* Exposure dots */}
      <td style={{ padding: "18px 24px" }}>
        <Link href={`/app/vault/${vaultAddress}`} style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "6px" }}>
          {Array.from(verificationTypes).sort().map((vt) => (
            <VerificationDot key={vt} type={vt} />
          ))}
          {verificationTypes.size === 0 && (
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", color: "#D1D5DB" }}>—</span>
          )}
        </Link>
      </td>

      {/* Policies */}
      <td style={{ padding: "18px 24px", textAlign: "center" }}>
        <Link href={`/app/vault/${vaultAddress}`} style={{ textDecoration: "none", display: "block" }}>
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: "14px",
              fontWeight: 500,
              color: "#4A4A4A",
            }}
          >
            {Number(policyCount)}
          </span>
        </Link>
      </td>

      {/* Target APY */}
      <td style={{ padding: "18px 24px", textAlign: "right" }}>
        <Link href={`/app/vault/${vaultAddress}`} style={{ textDecoration: "none", display: "block" }}>
          <span
            className="badge-institutional"
            style={{
              display: "inline-block",
              padding: "4px 10px",
              borderRadius: "50px",
              fontFamily: "'Inter', sans-serif",
              fontSize: "12px",
              fontWeight: 500,
            }}
          >
            {display.targetApy}
          </span>
        </Link>
      </td>
    </tr>
  );
}

function VaultRowSkeleton() {
  return (
    <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
      <td style={{ padding: "18px 24px" }}>
        <div style={{ height: "15px", width: "120px", borderRadius: "4px", background: "#E5E7EB", marginBottom: "6px" }} />
        <div style={{ height: "11px", width: "180px", borderRadius: "4px", background: "#F3F4F6" }} />
      </td>
      {[64, 96, 40, 24, 56].map((w, j) => (
        <td key={j} style={{ padding: "18px 24px" }}>
          <div style={{ height: "14px", width: `${w}px`, borderRadius: "4px", background: "#E5E7EB" }} />
        </td>
      ))}
    </tr>
  );
}
