"use client";
import { useAccount } from "wagmi";
import { useAdminAddress } from "@/hooks/useAdminAddress";
import { useVaultAddresses } from "@/hooks/useVaultData";
import { VaultTable } from "@/components/vault/VaultTable";
import { VerificationBadge } from "@/components/shared/VerificationBadge";
import { VerificationType } from "@/config/constants";
import { getWalletRole, useActiveRole } from "@/components/shared/WalletRoleIndicator";
import { getWalletName } from "@/config/knownWallets";
import Link from "next/link";

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function VaultTableSkeleton() {
  return (
    <div className="card-institutional overflow-hidden">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            {["Vault", "TVL", "Syndicate Manager", "Exposure", "Policies", "Target APY"].map((h) => (
              <th key={h} style={{ padding: "12px 24px", fontFamily: "'Inter', sans-serif", fontSize: "11px", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9A9A9A", textAlign: "left" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }).map((_, i) => (
            <tr key={i} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
              <td style={{ padding: "16px 24px" }}>
                <div style={{ height: "14px", width: "112px", borderRadius: "4px", background: "#E5E7EB" }} />
                <div style={{ height: "11px", width: "80px", borderRadius: "4px", background: "#F3F4F6", marginTop: "6px" }} />
              </td>
              {[64, 96, 40, 24, 56].map((w, j) => (
                <td key={j} style={{ padding: "16px 24px" }}>
                  <div style={{ height: "14px", width: `${w}px`, borderRadius: "4px", background: "#E5E7EB" }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Vault List condivisa ─────────────────────────────────────────────────────
function VaultList() {
  const { data: vaultAddresses, isLoading, error } = useVaultAddresses();
  if (isLoading) return <VaultTableSkeleton />;
  if (error) return (
    <div className="card-institutional" style={{ padding: "40px", textAlign: "center", borderColor: "rgba(220,38,38,0.2)", background: "rgba(254,242,242,0.5)" }}>
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 500, color: "#991B1B" }}>Failed to load vaults</p>
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", color: "#B91C1C", marginTop: "4px" }}>Make sure contracts are deployed and addresses are configured.</p>
    </div>
  );
  if (!vaultAddresses || vaultAddresses.length === 0) return (
    <div className="card-institutional" style={{ padding: "64px 40px", textAlign: "center" }}>
      <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "18px", fontWeight: 400, color: "#0F1218", marginBottom: "8px" }}>No vaults found</h3>
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "13px", color: "#9A9A9A" }}>Deploy contracts and run the setup script to create vaults.</p>
    </div>
  );
  return <VaultTable vaultAddresses={vaultAddresses} />;
}

// ─── Hero condiviso ───────────────────────────────────────────────────────────
function Hero({ label, title, subtitle, stats, ctas }: {
  label: string; title: string; subtitle: string;
  stats: { label: string; value: string }[];
  ctas: { label: string; href: string; primary?: boolean }[];
}) {
  return (
    <div className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, #0F1218 0%, #1B3A6B 100%)", padding: "64px 32px 72px" }}>
      <div className="absolute inset-0" style={{ backgroundImage: "url('/ships-illustration.jpg')", backgroundSize: "cover", backgroundPosition: "center 40%", opacity: 0.12 }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(15,18,24,0.95) 0%, rgba(27,58,107,0.7) 100%)" }} />
      <div className="relative z-10 mx-auto" style={{ maxWidth: "1200px" }}>
        <p className="section-label" style={{ color: "rgba(255,255,255,0.45)", marginBottom: "12px" }}>{label}</p>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 400, color: "#FFFFFF", lineHeight: 1.15, marginBottom: "16px" }}>{title}</h1>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "15px", color: "rgba(255,255,255,0.6)", maxWidth: "520px", lineHeight: 1.6, marginBottom: "36px" }}>{subtitle}</p>
        {stats.length > 0 && (
          <div className="flex flex-wrap gap-10" style={{ marginBottom: ctas.length > 0 ? "36px" : "0" }}>
            {stats.map(s => (
              <div key={s.label}>
                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "30px", fontWeight: 400, color: "#FFFFFF", lineHeight: 1, marginBottom: "4px" }}>{s.value}</div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "11px", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
        {ctas.length > 0 && (
          <div className="flex flex-wrap gap-4">
            {ctas.map(cta => (
              <Link key={cta.label} href={cta.href} style={{ display: "inline-block", padding: "12px 28px", background: cta.primary ? "#C9A84C" : "rgba(255,255,255,0.12)", color: "#FFFFFF", borderRadius: "50px", fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 600, textDecoration: "none", border: cta.primary ? "none" : "1px solid rgba(255,255,255,0.2)" }}>
                {cta.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Quick Actions ────────────────────────────────────────────────────────────
const ACTION_ICONS: Record<string, React.ReactNode> = {
  "Create Vault": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/>
    </svg>
  ),
  "Deploy Vault": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/>
    </svg>
  ),
  "Register Policy": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="1.5">
      <path d="M9 12h6M9 16h6M7 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2M9 4a2 2 0 012-2h2a2 2 0 012 2v0a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
    </svg>
  ),
  "Deposit Premium": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/>
    </svg>
  ),
  "View Analytics": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="1.5">
      <path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-6"/>
    </svg>
  ),
  "My Dashboard": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  "All Syndicates": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="1.5">
      <circle cx="9" cy="7" r="4"/>
      <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/>
      <path d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.87"/>
    </svg>
  ),
  "Strategy Builder": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="1.5">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
    </svg>
  ),
};

function QuickActions({ actions }: { actions: { icon: string; title: string; desc: string; href: string }[] }) {
  return (
    <div style={{ backgroundColor: "#F2F1EE", borderBottom: "1px solid rgba(0,0,0,0.06)", padding: "32px" }}>
      <div className="mx-auto grid grid-cols-1 md:grid-cols-4 gap-4" style={{ maxWidth: "1200px" }}>
        {actions.map(a => (
          <Link
            key={a.title}
            href={a.href}
            className="card-institutional"
            style={{ display: "block", padding: "24px", textDecoration: "none" }}
          >
            <div style={{
              width: "36px", height: "36px", borderRadius: "8px",
              background: "rgba(27,58,107,0.07)",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: "14px",
            }}>
              {ACTION_ICONS[a.title] ?? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="9"/>
                </svg>
              )}
            </div>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "15px", fontWeight: 400, color: "#0F1218", marginBottom: "6px" }}>
              {a.title}
            </div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", color: "#6B7280", lineHeight: 1.5 }}>
              {a.desc}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Vista Investor / Non connesso ───────────────────────────────────────────
function InvestorView() {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#FAFAF8" }}>
      <Hero
        label="Insurance Tokenization Protocol"
        title="Curated Insurance Vaults"
        subtitle="Deposit capital into syndicate-managed vaults backed by tokenized insurance policies. Earn premiums as yield — uncorrelated to equities, bonds, and crypto."
        stats={[{ label: "Target APY Range", value: "5–18%" }, { label: "Verification Types", value: "3" }, { label: "Active Syndicates", value: "8" }]}
        ctas={[]}
      />
      {/* How It Works */}
      <div style={{ backgroundColor: "#F2F1EE", borderBottom: "1px solid rgba(0,0,0,0.06)", padding: "40px 32px" }}>
        <div className="mx-auto grid grid-cols-1 md:grid-cols-3 gap-6" style={{ maxWidth: "1200px" }}>
          {[
            { step: "01", title: "Tokenized Policies", body: "Insurance policies are tokenized on-chain with transparent terms, coverage amounts, and three verification paths." },
            { step: "02", title: "Curated Vaults", body: "Independent vault managers build diversified portfolios of tokenized policies, each with distinct risk/return profiles." },
            { step: "03", title: "Earn Premiums", body: "Your deposit provides underwriting capacity. Premiums accrue as yield. Withdraw anytime from the liquidity buffer." },
          ].map(item => (
            <div key={item.step} className="card-institutional" style={{ padding: "24px 28px" }}>
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "32px", fontWeight: 400, color: "#1B3A6B", opacity: 0.25, lineHeight: 1, marginBottom: "12px" }}>{item.step}</div>
              <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "17px", fontWeight: 400, color: "#0F1218", marginBottom: "8px" }}>{item.title}</h3>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "13px", color: "#4A4A4A", lineHeight: 1.6 }}>{item.body}</p>
            </div>
          ))}
        </div>
      </div>
      {/* Vault Table */}
      <div className="mx-auto" style={{ maxWidth: "1200px", padding: "40px 32px 64px" }}>
        <div className="flex flex-wrap items-end justify-between gap-4" style={{ marginBottom: "24px" }}>
          <div>
            <p className="section-label" style={{ marginBottom: "4px" }}>Active Vaults</p>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px", fontWeight: 400, color: "#0F1218" }}>Select a vault to deposit</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <VerificationBadge type={VerificationType.ON_CHAIN} />
            <VerificationBadge type={VerificationType.ORACLE_DEPENDENT} />
            <VerificationBadge type={VerificationType.OFF_CHAIN} />
          </div>
        </div>
        <VaultList />
      </div>
      {/* CTA Apply */}
      <div style={{ backgroundColor: "#F2F1EE", borderTop: "1px solid rgba(0,0,0,0.06)", padding: "48px 32px", textAlign: "center" }}>
        <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px", color: "#1B3A6B", marginBottom: "8px" }}>Are you an insurer or asset manager?</p>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", color: "#6B7280", marginBottom: "24px" }}>Apply to become a Syndicate Manager or list your insurance portfolio on NextBlock.</p>
        <Link href="/app/apply" style={{ display: "inline-block", padding: "12px 32px", background: "#1B3A6B", color: "#FFFFFF", borderRadius: "50px", fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 600, textDecoration: "none" }}>
          Apply Now →
        </Link>
      </div>
    </div>
  );
}

// ─── Vista Insurance Company ──────────────────────────────────────────────────
function InsuranceCompanyView() {
  const { address } = useAccount();
  const userName = getWalletName(address) ?? 'Insurance Company';
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#FAFAF8" }}>
      <Hero
        label="Insurance Company Portal"
        title={`Welcome back, ${userName}`}
        subtitle="Tokenize your insurance portfolio, create vaults, register policies and manage your capital on-chain."
        stats={[]}
        ctas={[
          { label: "Create New Vault", href: "/app/create-vault", primary: true },
          { label: "My Company", href: "/app/my-company" },
        ]}
      />
      <QuickActions actions={[
        { icon: "", title: "Create Vault", desc: "Deploy a new ERC-4626 insurance vault", href: "/app/create-vault" },
        { icon: "", title: "Register Policy", desc: "Tokenize a new insurance policy", href: "/app/my-company" },
        { icon: "", title: "Deposit Premium", desc: "Fund your policies with USDC premiums", href: "/app/my-company" },
        { icon: "", title: "View Analytics", desc: "Monitor your portfolio performance", href: "/app/my-company" },
      ]} />
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "48px 32px" }}>
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "24px", fontWeight: 400, color: "#1B3A6B", marginBottom: "8px" }}>My Vaults</h2>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", color: "#6B7280", marginBottom: "32px" }}>Insurance vaults you manage on NextBlock</p>
        <VaultList />
      </div>
    </div>
  );
}

// ─── Vista Syndicate Manager ──────────────────────────────────────────────────
function SyndicateManagerView() {
  const { address } = useAccount();
  const userName = getWalletName(address) ?? 'Syndicate Manager';
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#FAFAF8" }}>
      <Hero
        label="Syndicate Manager Portal"
        title={`Welcome back, ${userName}`}
        subtitle="Deploy and manage insurance vaults, define risk strategies, attract USDC liquidity and earn management fees."
        stats={[]}
        ctas={[
          { label: "Deploy New Vault", href: "/app/create-vault", primary: true },
          { label: "My Dashboard", href: "/app/syndicates/dashboard" },
        ]}
      />
      <QuickActions actions={[
        { icon: "", title: "Deploy Vault", desc: "Create a new insurance vault strategy", href: "/app/create-vault" },
        { icon: "", title: "My Dashboard", desc: "Monitor your syndicates and performance", href: "/app/syndicates/dashboard" },
        { icon: "", title: "All Syndicates", desc: "Browse all approved syndicate managers", href: "/app/syndicates" },
        { icon: "", title: "Strategy Builder", desc: "Configure vault parameters and risk profile", href: "/app/syndicates/dashboard" },
      ]} />
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "48px 32px" }}>
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "24px", fontWeight: 400, color: "#1B3A6B", marginBottom: "8px" }}>All Insurance Vaults</h2>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", color: "#6B7280", marginBottom: "32px" }}>All vaults deployed on the NextBlock protocol</p>
        <VaultList />
      </div>
    </div>
  );
}

/// ─── Router principale ────────────────────────────────────────────────────────
export default function AppPage() {
  const { address, isConnected } = useAccount();
  const adminAddress = useAdminAddress();
  const { activeRole } = useActiveRole();
  const baseRole = getWalletRole(address, adminAddress);
  // Il ruolo effettivo è l'override manuale (se impostato) oppure il ruolo base
  const role = activeRole ?? baseRole;
  if (!isConnected || role === "investor") return <InvestorView />;
  if (role === "insurance") return <InsuranceCompanyView />;
  if (role === "syndicate" || role === "admin") return <SyndicateManagerView />;
  return <InvestorView />;
}
