"use client";
import { use, useState } from "react";
import Link from "next/link";
import { useAccount, useChainId } from "wagmi";
import {
  useVaultInfo,
  useUserShares,
  useMaxWithdraw,
  usePendingClaims,
} from "@/hooks/useVaultData";
import { useVaultPolicies } from "@/hooks/useVaultPolicies";
import { useCurrentTime } from "@/hooks/usePolicyRegistry";
import { PolicyRow } from "@/components/vault/PolicyRow";
import { AllocationBar } from "@/components/vault/AllocationBar";
import { BufferVisualization } from "@/components/vault/BufferVisualization";
import { YieldTicker } from "@/components/vault/YieldTicker";
import { DepositSidebar } from "@/components/deposit/DepositSidebar";
import { VerificationBadge } from "@/components/shared/VerificationBadge";
import { useEnsName } from "@/hooks/useEns";
import {
  formatUSDC,
  formatFeeBps,
  formatBufferRatio,
  shortenAddress,
  getSharePriceNumber,
} from "@/lib/formatting";

const VAULT_DISPLAY: Record<
  string,
  {
    manager: string;
    strategy: string;
    riskLevel: string;
    targetApy: string;
  }
> = {
  "Balanced Core": { manager: "NextBlock Core Team", strategy: "Full-spectrum insurance diversification, steady yield", riskLevel: "Moderate", targetApy: "8-12%" },
  "Digital Asset Shield": { manager: "AlphaRe Capital", strategy: "Automated on-chain claims only, pure crypto risk exposure", riskLevel: "Higher", targetApy: "10-14%" },
  "Parametric Shield": { manager: "StormGuard Capital", strategy: "Oracle-verified parametric insurance only", riskLevel: "Moderate", targetApy: "9-13%" },
  "Conservative Yield": { manager: "Klapton Re Partners", strategy: "Low-volatility off-chain reinsurance portfolio", riskLevel: "Lower", targetApy: "5-8%" },
  "Catastrophe & Specialty": { manager: "Alpine Re", strategy: "Catastrophe-focused with specialty lines diversification", riskLevel: "High", targetApy: "14-18%" },
  "Traditional Lines": { manager: "BondSecure Capital", strategy: "Established commercial and liability reinsurance", riskLevel: "Lower", targetApy: "6-9%" },
  "Technology & Specialty": { manager: "CyberGuard Partners", strategy: "Digital asset and technology risk with property diversification", riskLevel: "Moderate", targetApy: "8-11%" },
  "Multi-Line Diversified": { manager: "Meridian Risk Mgmt", strategy: "Maximum diversification across all categories", riskLevel: "Moderate", targetApy: "9-13%" },
};

function getVaultDisplay(name: string) {
  for (const [key, value] of Object.entries(VAULT_DISPLAY)) {
    if (name.includes(key)) return value;
  }
  return { manager: "Vault Manager", strategy: "Custom strategy", riskLevel: "Moderate", targetApy: "8-14%" };
}

const EXPLORER_URLS: Record<number, string> = {
  84532: "https://sepolia.basescan.org",
  8453: "https://basescan.org",
  11155111: "https://sepolia.etherscan.io",
  5042002: "https://testnet.arcscan.app",
};

function getExplorerUrl(chainId: number, address: string): string | null {
  const base = EXPLORER_URLS[chainId];
  if (!base) return null;
  return `${base}/address/${address}`;
}

type Tab = "overview" | "risk";

export default function VaultDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const resolvedParams = use(params);
  const vaultAddress = resolvedParams.address as `0x${string}`;
  const { address: userAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const [tab, setTab] = useState<Tab>("overview");

  const { data: vaultInfo, isLoading: vaultLoading } = useVaultInfo(vaultAddress);
  const { policies, isLoading: policiesLoading } = useVaultPolicies(vaultAddress);
  const { data: currentTime } = useCurrentTime();
  const { data: userShares } = useUserShares(vaultAddress, userAddress);
  const { data: maxWithdraw } = useMaxWithdraw(vaultAddress, userAddress);
  const { data: pendingClaimsData } = usePendingClaims(vaultAddress);

  const managerAddr = vaultInfo ? ((vaultInfo as unknown as [string, `0x${string}`])[1]) : undefined;
  const { ensName: managerEns } = useEnsName(managerAddr);

  if (vaultLoading) return <VaultDetailSkeleton />;

  if (!vaultInfo) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#FAFAF8", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px", fontWeight: 400, color: "#0F1218", marginBottom: "8px" }}>Vault not found</h1>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", color: "#9A9A9A", marginBottom: "16px" }}>Could not load vault at {shortenAddress(vaultAddress)}</p>
          <Link href="/app" style={{ fontFamily: "'Inter', sans-serif", fontSize: "13px", fontWeight: 500, color: "#1B3A6B", textDecoration: "none" }}>← Back to vaults</Link>
        </div>
      </div>
    );
  }

  const [name, manager, assets, shares, , bufferBps, feeBps, availableBuffer, deployedCapital, policyCount] =
    vaultInfo as unknown as [string, `0x${string}`, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];

  const display = getVaultDisplay(name);
  const sharePrice = getSharePriceNumber(assets, shares);
  const hasPosition = userShares !== undefined && userShares > 0n;
  const userValue = hasPosition && userShares ? (Number(userShares) * sharePrice) / 1e18 : 0;
  const pendingClaims = pendingClaimsData ?? 0n;
  const freeCapital = assets > deployedCapital + pendingClaims ? assets - deployedCapital - pendingClaims : 0n;
  const effectiveMaxWithdraw = maxWithdraw !== undefined ? (freeCapital < maxWithdraw ? freeCapital : maxWithdraw) : undefined;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#FAFAF8" }}>
      {/* Hero banner */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0F1218 0%, #1B3A6B 100%)",
          padding: "40px 32px 48px",
        }}
      >
        <div className="absolute inset-0" style={{ backgroundImage: "url('/assets/our-vision-venice.png')", backgroundSize: "cover", backgroundPosition: "center", opacity: 0.08 }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(15,18,24,0.95) 0%, rgba(27,58,107,0.65) 100%)" }} />
        <div className="relative z-10 mx-auto" style={{ maxWidth: "1200px" }}>
          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "24px" }}>
            <Link href="/app" style={{ fontFamily: "'Inter', sans-serif", fontSize: "13px", color: "rgba(255,255,255,0.5)", textDecoration: "none", transition: "color 0.15s" }}
              className="hover:text-white">
              Vaults
            </Link>
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "13px" }}>/</span>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "13px", color: "rgba(255,255,255,0.85)" }}>{name}</span>
          </div>

          {/* Vault name + strategy */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "clamp(24px, 3.5vw, 36px)", fontWeight: 400, color: "#FFFFFF", lineHeight: 1.15, marginBottom: "8px" }}>
                {name}
                {getExplorerUrl(chainId, vaultAddress) && (
                  <a href={getExplorerUrl(chainId, vaultAddress)!} target="_blank" rel="noopener noreferrer"
                    style={{ marginLeft: "10px", verticalAlign: "middle", opacity: 0.4, transition: "opacity 0.15s" }}
                    className="hover:opacity-70">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: "inline" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </h1>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", color: "rgba(255,255,255,0.55)", fontStyle: "italic" }}>
                &ldquo;{display.strategy}&rdquo;
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "11px", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: "4px" }}>Target APY</p>
              <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "32px", fontWeight: 400, color: "#FFFFFF", lineHeight: 1 }}>{display.targetApy}</p>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "32px", marginTop: "28px", paddingTop: "24px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            {[
              { label: "TVL", value: formatUSDC(assets) },
              { label: "Share Price", value: `$${sharePrice.toFixed(4)}` },
              { label: "Mgmt Fee", value: formatFeeBps(feeBps) },
              { label: "Buffer Ratio", value: formatBufferRatio(bufferBps) },
              { label: "Policies", value: String(Number(policyCount)) },
            ].map((stat) => (
              <div key={stat.label}>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "11px", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: "3px" }}>{stat.label}</p>
                <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "18px", fontWeight: 400, color: "#FFFFFF" }}>{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ backgroundColor: "#F2F1EE", borderBottom: "1px solid rgba(0,0,0,0.06)", padding: "0 32px" }}>
        <div className="mx-auto" style={{ maxWidth: "1200px", display: "flex", gap: "0" }}>
          {(["overview", "risk"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "14px 20px",
                fontFamily: "'Inter', sans-serif",
                fontSize: "13px",
                fontWeight: 500,
                letterSpacing: "0.02em",
                color: tab === t ? "#1B3A6B" : "#9A9A9A",
                background: "transparent",
                border: "none",
                borderBottom: tab === t ? "2px solid #1B3A6B" : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.15s",
                textTransform: "capitalize",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto" style={{ maxWidth: "1200px", padding: "32px 32px 64px" }}>
        {tab === "overview" ? (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left column (2/3) */}
            <div className="space-y-6 lg:col-span-2">
              {/* Curator info */}
              <div className="card-institutional" style={{ padding: "24px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                  <div>
                    <p className="section-label" style={{ marginBottom: "4px" }}>Vault Curator</p>
                    <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "18px", fontWeight: 400, color: "#0F1218" }}>
                      {managerEns || display.manager}
                    </p>
                    {managerEns && (
                      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", color: "#9A9A9A", marginTop: "2px" }}>
                        {shortenAddress(manager)}
                      </p>
                    )}
                  </div>
                  <span className="badge-institutional" style={{ padding: "6px 14px", borderRadius: "50px", fontFamily: "'Inter', sans-serif", fontSize: "12px", fontWeight: 500 }}>
                    {display.riskLevel} Risk
                  </span>
                </div>
              </div>

              {/* NAV Ticker */}
              <YieldTicker totalAssets={assets} totalSupply={shares} />

              {/* User position */}
              {isConnected && hasPosition && userShares && (
                <div className="card-institutional" style={{ padding: "24px 28px", borderColor: "rgba(27,58,107,0.15)", background: "rgba(27,58,107,0.03)" }}>
                  <p className="section-label" style={{ marginBottom: "12px", color: "#1B3A6B" }}>Your Position</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
                    {[
                      { label: "Shares", value: (Number(userShares) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 6 }) },
                      { label: "Value", value: `$${userValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
                      { label: "Max Withdraw", value: effectiveMaxWithdraw !== undefined ? formatUSDC(effectiveMaxWithdraw) : "—" },
                    ].map((item) => (
                      <div key={item.label}>
                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "11px", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1B3A6B", opacity: 0.6, marginBottom: "4px" }}>{item.label}</p>
                        <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "18px", fontWeight: 400, color: "#1B3A6B" }}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Allocation bar */}
              {policies.length > 0 && (
                <div className="card-institutional" style={{ padding: "24px 28px" }}>
                  <AllocationBar policies={policies} />
                </div>
              )}

              {/* Buffer visualization */}
              <div className="card-institutional" style={{ padding: "24px 28px" }}>
                <BufferVisualization
                  totalAssets={assets}
                  deployedCapital={deployedCapital}
                  pendingClaims={pendingClaims}
                  bufferBps={bufferBps}
                />
              </div>

              {/* Policy table */}
              <div className="card-institutional" style={{ padding: "24px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                  <div>
                    <p className="section-label" style={{ marginBottom: "2px" }}>Active Policies</p>
                    <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "17px", fontWeight: 400, color: "#0F1218" }}>
                      {Number(policyCount)} {Number(policyCount) === 1 ? "Policy" : "Policies"}
                    </h3>
                  </div>
                </div>
                {policiesLoading ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {[1, 2, 3].map((i) => (
                      <div key={i} style={{ height: "80px", borderRadius: "8px", background: "#F2F1EE", animation: "pulse 2s infinite" }} />
                    ))}
                  </div>
                ) : policies.length === 0 ? (
                  <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "13px", color: "#9A9A9A", textAlign: "center", padding: "32px 0" }}>
                    No policies in this vault.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {policies.map((policy) => (
                      <PolicyRow key={Number(policy.policyId)} policy={policy} currentTime={currentTime ?? 0n} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right column: sidebar (1/3) */}
            <div className="lg:sticky lg:top-24 lg:self-start">
              <DepositSidebar
                vaultAddress={vaultAddress}
                totalAssets={assets}
                totalSupply={shares}
                policyCount={Number(policyCount)}
                maxWithdrawOverride={effectiveMaxWithdraw}
              />
            </div>
          </div>
        ) : (
          /* Risk tab */
          <div className="card-institutional" style={{ padding: "32px", maxWidth: "720px" }}>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px", fontWeight: 400, color: "#0F1218", marginBottom: "24px" }}>Risk Disclosures</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {[
                { title: "Vault Curator", body: `${managerEns || display.manager} (${shortenAddress(manager)})` },
                { title: "Verification Taxonomy", body: "This vault uses three types of claim verification: On-chain (trustless, permissionless via oracle price feeds), Oracle-dependent (automated via third-party data feeds), and Off-chain (insurer-assessed, manual verification). Each type carries different trust assumptions and settlement guarantees." },
                { title: "Buffer Ratio", body: `${formatBufferRatio(bufferBps)} of vault assets are held as liquid buffer for immediate withdrawals. The remaining capital is deployed as underwriting capacity. During high-claim events, withdrawal capacity may be temporarily reduced.` },
                { title: "Smart Contract Risk", body: "This vault is deployed on a testnet for demonstration purposes. Smart contracts have not been audited. In production, all contracts will undergo multiple security audits and bug bounty programs. Never deposit funds you cannot afford to lose." },
              ].map((item) => (
                <div key={item.title} style={{ paddingBottom: "24px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                  <h3 style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9A9A9A", marginBottom: "8px" }}>{item.title}</h3>
                  <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", color: "#4A4A4A", lineHeight: 1.7 }}>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VaultDetailSkeleton() {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#FAFAF8" }}>
      <div style={{ background: "linear-gradient(135deg, #0F1218 0%, #1B3A6B 100%)", padding: "40px 32px 48px" }}>
        <div className="mx-auto" style={{ maxWidth: "1200px" }}>
          <div style={{ height: "12px", width: "120px", borderRadius: "4px", background: "rgba(255,255,255,0.1)", marginBottom: "24px" }} />
          <div style={{ height: "36px", width: "280px", borderRadius: "4px", background: "rgba(255,255,255,0.1)", marginBottom: "12px" }} />
          <div style={{ height: "14px", width: "360px", borderRadius: "4px", background: "rgba(255,255,255,0.07)" }} />
        </div>
      </div>
      <div className="mx-auto" style={{ maxWidth: "1200px", padding: "32px" }}>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {[80, 60, 120, 200].map((h, i) => (
              <div key={i} style={{ height: `${h}px`, borderRadius: "12px", background: "#E5E7EB", animation: "pulse 2s infinite" }} />
            ))}
          </div>
          <div style={{ height: "320px", borderRadius: "12px", background: "#E5E7EB", animation: "pulse 2s infinite" }} />
        </div>
      </div>
    </div>
  );
}
