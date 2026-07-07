import { test, expect } from '@playwright/test';

/**
 * Investor read path — REAL on-chain data through the public RPC, no wallet.
 *
 * The vault table reads Base Sepolia client-side: rows appearing means the
 * chain read path (wagmi → RPC → VaultFactory/Lens) works end-to-end in a
 * production build. The compliance footnote and honest empty/error states
 * are part of the contract these tests enforce.
 */

test('vault list renders real vaults from Base Sepolia', async ({ page }) => {
  await page.goto('/app');

  // The hero + compliance-labeled stat render immediately.
  await expect(page.getByText('Curated Insurance Vaults')).toBeVisible();
  await expect(page.getByText('Illustrative APY Range')).toBeVisible();

  // Real chain read: at least one vault row links to its detail page.
  const vaultLinks = page.locator('tbody a[href^="/app/vault/0x"]');
  await expect(vaultLinks.first()).toBeVisible({ timeout: 45_000 });

  // The silent-fallback ban: the explicit failure card must NOT be shown
  // alongside rendered rows.
  await expect(page.getByText('Failed to load vaults')).toHaveCount(0);

  // Compliance footnote under the table (PR #75).
  await expect(page.getByText(/illustrative underwriting targets/i)).toBeVisible();
});

test('vault detail shows labeled metadata and the deposit sidebar gate', async ({ page }) => {
  await page.goto('/app');
  const firstVault = page.locator('tbody a[href^="/app/vault/0x"]').first();
  await expect(firstVault).toBeVisible({ timeout: 45_000 });
  await firstVault.click();

  await expect(page).toHaveURL(/\/app\/vault\/0x/);
  // Illustrative-APY relabel (PR #75) — never plain "Target APY".
  await expect(page.getByText('Illustrative Target APY').first()).toBeVisible({ timeout: 45_000 });
  // Disconnected visitors get the connect gate, not a broken form.
  await expect(page.getByText(/connect your wallet/i).first()).toBeVisible();
});

test('redeem page states the NAV-bearing, queue-based exit honestly', async ({ page }) => {
  await page.goto('/app/redeem');
  await expect(page.getByRole('heading', { name: 'Redeem', exact: true })).toBeVisible();
  await expect(page.getByText(/NAV-bearing, not a stablecoin/i)).toBeVisible();
});

test('claims control room renders', async ({ page }) => {
  await page.goto('/app/claims');
  await expect(page.getByRole('heading').first()).toBeVisible();
});

test('governance console renders with zero-authority note', async ({ page }) => {
  await page.goto('/app/admin/governance');
  await expect(page.getByText('Safe → timelock execution')).toBeVisible();
  await expect(page.getByText(/only timelock proposers can schedule/i)).toBeVisible();
});
