"use client";
import { useVaultAddresses } from "@/hooks/useVaultData";
import { VaultTable } from "@/components/vault/VaultTable";
import { VerificationBadge } from "@/components/shared/VerificationBadge";
import { VerificationType } from "@/config/constants";

export default function VaultDiscoveryPage() {
  const { data: vaultAddresses, isLoading, error } = useVaultAddresses();

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#FAFAF8" }}>
      {/* Hero banner con immagine veneziana */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0F1218 0%, #1B3A6B 100%)",
          padding: "64px 32px 72px",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url('/ships-illustration.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center 40%",
            opacity: 0.12,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, rgba(15,18,24,0.95) 0%, rgba(27,58,107,0.7) 100%)",
          }}
        />
        <div className="relative z-10 mx-auto" style={{ maxWidth: "1200px" }}>
          <p
            className="section-label"
            style={{ color: "rgba(255,255,255,0.45)", marginBottom: "12px" }}
          >
            Insurance Tokenization Protocol
          </p>
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "clamp(28px, 4vw, 44px)",
              fontWeight: 400,
              color: "#FFFFFF",
              lineHeight: 1.15,
              marginBottom: "16px",
              letterSpacing: "-0.01em",
            }}
          >
            Curated Insurance Vaults
          </h1>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: "15px",
              color: "rgba(255,255,255,0.6)",
              maxWidth: "520px",
              lineHeight: 1.6,
              marginBottom: "36px",
            }}
          >
            Deposit capital into curator-managed vaults backed by tokenized
            insurance policies. Earn premiums as yield — uncorrelated to
            equities, bonds, and crypto.
          </p>
          <div className="flex flex-wrap gap-10">
            {[
              { label: "Target APY Range", value: "5–18%" },
              { label: "Verification Types", value: "3" },
              { label: "Active Curators", value: "8" },
            ].map((stat) => (
              <div key={stat.label}>
                <div
                  style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: "30px",
                    fontWeight: 400,
                    color: "#FFFFFF",
                    lineHeight: 1,
                    marginBottom: "4px",
                  }}
                >
                  {stat.value}
                </div>
                <div
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: "11px",
                    fontWeight: 500,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.4)",
                  }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div
        style={{
          backgroundColor: "#F2F1EE",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
          padding: "40px 32px",
        }}
      >
        <div
          className="mx-auto grid grid-cols-1 md:grid-cols-3 gap-6"
          style={{ maxWidth: "1200px" }}
        >
          {[
            {
              step: "01",
              title: "Tokenized Policies",
              body: "Insurance policies are tokenized on-chain with transparent terms, coverage amounts, and three verification paths.",
            },
            {
              step: "02",
              title: "Curated Vaults",
              body: "Independent vault managers build diversified portfolios of tokenized policies, each with distinct risk/return profiles.",
            },
            {
              step: "03",
              title: "Earn Premiums",
              body: "Your deposit provides underwriting capacity. Premiums accrue as yield. Withdraw anytime from the liquidity buffer.",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="card-institutional"
              style={{ padding: "24px 28px" }}
            >
              <div
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "32px",
                  fontWeight: 400,
                  color: "#1B3A6B",
                  opacity: 0.25,
                  lineHeight: 1,
                  marginBottom: "12px",
                }}
              >
                {item.step}
              </div>
              <h3
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "17px",
                  fontWeight: 400,
                  color: "#0F1218",
                  marginBottom: "8px",
                }}
              >
                {item.title}
              </h3>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "13px",
                  color: "#4A4A4A",
                  lineHeight: 1.6,
                }}
              >
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Vault table section */}
      <div
        className="mx-auto"
        style={{ maxWidth: "1200px", padding: "40px 32px 64px" }}
      >
        <div
          className="flex flex-wrap items-end justify-between gap-4"
          style={{ marginBottom: "24px" }}
        >
          <div>
            <p className="section-label" style={{ marginBottom: "4px" }}>
              Active Vaults
            </p>
            <h2
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "22px",
                fontWeight: 400,
                color: "#0F1218",
              }}
            >
              Select a vault to deposit
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <VerificationBadge type={VerificationType.ON_CHAIN} />
            <VerificationBadge type={VerificationType.ORACLE_DEPENDENT} />
            <VerificationBadge type={VerificationType.OFF_CHAIN} />
          </div>
        </div>

        {isLoading ? (
          <VaultTableSkeleton />
        ) : error ? (
          <div
            className="card-institutional"
            style={{
              padding: "40px",
              textAlign: "center",
              borderColor: "rgba(220,38,38,0.2)",
              background: "rgba(254,242,242,0.5)",
            }}
          >
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 500, color: "#991B1B" }}>
              Failed to load vaults
            </p>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", color: "#B91C1C", marginTop: "4px" }}>
              Make sure contracts are deployed and addresses are configured.
            </p>
          </div>
        ) : !vaultAddresses || vaultAddresses.length === 0 ? (
          <div className="card-institutional" style={{ padding: "64px 40px", textAlign: "center" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#F2F1EE", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9A9A9A" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "18px", fontWeight: 400, color: "#0F1218", marginBottom: "8px" }}>
              No vaults found
            </h3>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "13px", color: "#9A9A9A" }}>
              Deploy contracts and run the setup script to create vaults.
            </p>
          </div>
        ) : (
          <VaultTable vaultAddresses={vaultAddresses} />
        )}
      </div>
    </div>
  );
}

function VaultTableSkeleton() {
  return (
    <div className="card-institutional overflow-hidden">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            {["Vault", "TVL", "Curator", "Exposure", "Policies", "Target APY"].map((h) => (
              <th key={h} style={{ padding: "12px 24px", fontFamily: "'Inter', sans-serif", fontSize: "11px", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9A9A9A", textAlign: "left" }}>
                {h}
              </th>
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
