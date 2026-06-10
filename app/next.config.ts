import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
