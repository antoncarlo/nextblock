"use client";
import Link from "next/link";
import { useVaultInfoSafe } from "@/hooks/useVaultData";
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
// Display metadata: curator-supplied offering terms when published (backend,
// role-gated write), otherwise the illustrative defaults — labeled apart.
import { resolveVaultDisplay } from "@/config/vaultDisplay";
import type { OfferingTerms } from "@/lib/offering/terms";

interface VaultRowProps {
  vaultAddress: `0x${string}`;
  offeringTerms?: OfferingTerms;
}

export function VaultRow({ vaultAddress, offeringTerms }: VaultRowProps) {
  const { data: vaultInfo, isLoading, error } = useVaultInfoSafe(vaultAddress);
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
    // Phase 9: the on-chain read failed. NO substitute data is rendered —
    // the row is explicitly marked Unavailable (silent fallbacks are banned).
    return (
      <tr
        style={{
          borderBottom: "1px solid rgba(0,0,0,0.04)",
          transition: "background 0.15s",
          cursor: "pointer",
          opacity: 0.7,
        }}
        className="group hover:bg-[#F2F1EE]"
      >
        <td style={{ padding: "18px 24px" }}>
          <Link href={`/app/vault/${vaultAddress}`} style={{ textDecoration: "none", display: "block" }}>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "15px", fontWeight: 400, color: "#7F1D1D", marginBottom: "3px" }}>
              {shortenAddress(vaultAddress)}
            </div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", color: "#7F1D1D", lineHeight: 1.4 }}>
              Unavailable — on-chain read failed; no substitute data shown
            </div>
          </Link>
        </td>
        <td style={{ padding: "18px 24px" }}>
          <Link href={`/app/vault/${vaultAddress}`} style={{ textDecoration: "none", display: "block" }}>
            <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "15px", fontWeight: 400, color: "#9A9A9A" }}>—</span>
          </Link>
        </td>
        <td style={{ padding: "18px 24px" }}>
          <Link href={`/app/vault/${vaultAddress}`} style={{ textDecoration: "none", display: "block" }}>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "13px", color: "#9A9A9A" }}>{shortenAddress(vaultAddress)}</span>
          </Link>
        </td>
        <td style={{ padding: "18px 24px" }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", color: "#D1D5DB" }}>—</span>
        </td>
        <td style={{ padding: "18px 24px", textAlign: "center" }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 500, color: "#9A9A9A" }}>—</span>
        </td>
        <td style={{ padding: "18px 24px", textAlign: "right" }}>
          <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: "50px", fontFamily: "'Inter', sans-serif", fontSize: "11px", fontWeight: 600, background: "rgba(127,29,29,0.08)", color: "#7F1D1D", border: "1px solid rgba(127,29,29,0.25)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Unavailable
          </span>
        </td>
      </tr>
    );
  }

  const [name, , assets, , , , , , , policyCount] = vaultInfo as unknown as [
    string, `0x${string}`, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
  ];

  const display = resolveVaultDisplay(name, offeringTerms);

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

      {/* Syndicate Manager */}
      <td style={{ padding: "18px 24px" }}>
        <Link href={`/app/vault/${vaultAddress}`} style={{ textDecoration: "none", display: "block" }}>
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: "13px",
              color: "#4A4A4A",
            }}
            title={display.source === "curated" ? `On-chain manager: ${managerAddr}` : undefined}
          >
            {ensName || (display.source === "curated" ? display.manager : shortenAddress(managerAddr!))}
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
          {display.source === "curated" && (
            <span
              title="Curator-published offering terms"
              style={{ display: "block", marginTop: "3px", fontFamily: "'Inter', sans-serif", fontSize: "9px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0E7490" }}
            >
              Curated
            </span>
          )}
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
