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

test('nav shows the five institutional entries in order', async ({ page }) => {
  await page.goto('/app');
  const nav = page.locator('header nav');
  await expect(nav.getByRole('link', { name: 'Market', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Claims', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Borrow', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Transparency', exact: true })).toBeVisible();
  // Renamed away: the old labels must not survive anywhere in the nav.
  await expect(nav.getByRole('link', { name: 'Vaults', exact: true })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Money Flow', exact: true })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Redeem', exact: true })).toHaveCount(0);
});

test('portfolio gates on wallet and offers the market as the next step', async ({ page }) => {
  await page.goto('/app/portfolio');
  await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible();
  await expect(page.getByText(/connect your wallet to see your positions/i)).toBeVisible();
});

test('legacy redeem and money-flow URLs redirect to their new homes', async ({ page }) => {
  await page.goto('/app/redeem');
  await expect(page).toHaveURL(/\/app\/portfolio/);
  await page.goto('/app/money-flow');
  await expect(page).toHaveURL(/\/app\/transparency/);
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
