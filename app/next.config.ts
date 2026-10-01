import type { NextConfig } from "next";

// Content-Security-Policy notes:
// - connect-src additionally allows *.walletconnect.org (relay/pulse moved to
//   the .org domains in WalletConnect v2 infrastructure); without it the
//   wallet modal cannot open sessions in production.
// - connect-src allows api.web3modal.org: RainbowKit v2 fetches the AppKit
//   config from there before the wallet modal can render its wallet list. It was
//   blocked, which is the same failure mode as the .org relay domains above and
//   shows up as a modal that opens empty or not at all.
// - connect-src allows api.goldsky.com: every indexed read (LP exit history,
//   epoch settlements, NAV series) goes to the subgraph from the browser. It
//   was missing, so those queries were blocked by the policy and surfaced as
//   "Failed to fetch" — the endpoint was healthy the whole time and answered
//   curl normally. If the subgraph ever moves off Goldsky, this line moves too,
//   or the same silent failure returns.
// - Legacy demo chains (Ethereum Sepolia, Arc) use RPC endpoints that are NOT
//   allow-listed on purpose: their reads fail closed and the UI already
//   renders them as unavailable/demo-legacy.
// - style-src allows fonts.googleapis.com and font-src allows fonts.gstatic.com:
//   globals.css opens with an @import of Playfair Display and Inter from Google
//   Fonts. Those hosts were never allow-listed, so the browser blocked the
//   stylesheet on every page load and the whole site silently rendered in
//   fallback typefaces. There was no font-src at all, which meant it inherited
//   default-src 'self' and would have blocked the font files even once the
//   stylesheet was allowed. Self-hosting these two families (as /docs already
//   does) would let both lines go away again.
// - frame-ancestors 'none' + X-Frame-Options DENY: the app is never embedded.
const connectSources = [
  "'self'",
  "https://*.supabase.co",
  "wss://*.supabase.co",
  "https://*.walletconnect.com",
  "wss://*.walletconnect.com",
  "https://*.walletconnect.org",
  "wss://*.walletconnect.org",
  "https://api.web3modal.org",
  "https://*.alchemy.com",
  "https://mainnet.base.org",
  "https://sepolia.base.org",
  "https://api.goldsky.com",
];

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
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
  // Public protocol documentation: a static build served from
  // public/docs (index.html + self-hosted fonts, so the CSP above needs no
  // external font or style host). /docs maps to its index page.
  async rewrites() {
    return [{ source: "/docs", destination: "/docs/index.html" }];
  },
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
