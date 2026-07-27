import type { NextConfig } from "next";

// Content-Security-Policy notes:
// - connect-src additionally allows *.walletconnect.org (relay/pulse moved to
//   the .org domains in WalletConnect v2 infrastructure); without it the
//   wallet modal cannot open sessions in production.
// - connect-src allows api.goldsky.com: every indexed read (LP exit history,
//   epoch settlements, NAV series) goes to the subgraph from the browser. It
//   was missing, so those queries were blocked by the policy and surfaced as
//   "Failed to fetch" — the endpoint was healthy the whole time and answered
//   curl normally. If the subgraph ever moves off Goldsky, this line moves too,
//   or the same silent failure returns.
// - Legacy demo chains (Ethereum Sepolia, Arc) use RPC endpoints that are NOT
//   allow-listed on purpose: their reads fail closed and the UI already
//   renders them as unavailable/demo-legacy.
// - frame-ancestors 'none' + X-Frame-Options DENY: the app is never embedded.
const connectSources = [
  "'self'",
  "https://*.supabase.co",
  "wss://*.supabase.co",
  "https://*.walletconnect.com",
  "wss://*.walletconnect.com",
  "https://*.walletconnect.org",
  "wss://*.walletconnect.org",
  "https://*.alchemy.com",
  "https://mainnet.base.org",
  "https://sepolia.base.org",
  "https://api.goldsky.com",
];

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  `connect-src ${connectSources.join(" ")}`,
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  experimental: {
    // Incremental Turbopack filesystem cache for production builds.
    turbopackFileSystemCacheForBuild: true,
    // CI_FAST_BUILD=1 skips minification ONLY in time-boxed CI/sandbox
    // verification builds (compile-correctness check). Local/production
    // builds keep full minification (default).
    ...(process.env.CI_FAST_BUILD === "1" ? { turbopackMinify: false, turbopackSourceMaps: false } : {}),
  },
};

export default nextConfig;
