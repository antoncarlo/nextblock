import { defineConfig, devices } from '@playwright/test';

/**
 * E2E suite — READ-ONLY flows against the production build.
 *
 * The app reads Base Sepolia through the public RPC client-side, so the
 * vault table renders REAL on-chain data with no wallet: these tests verify
 * the institutional read path end-to-end (landing → vault list → detail →
 * redeem/claims/legal) exactly as an unauthenticated visitor experiences it.
 * Wallet-signing flows (deposit/withdraw, curator actions) are out of scope
 * here — they require funded keys and are covered by the contract suite and
 * the pilot manual checklist.
 *
 * Run locally:  npm run build && npm run test:e2e   (from app/)
 * CI:           the `e2e` job in .github/workflows/ci.yml
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 30_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run start -- --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
