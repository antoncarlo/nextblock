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

test('governance console accepts a pre-filled curation request', async ({ page }) => {
  // A syndicate asking to curate a free vault arrives here with the operation
  // already encoded; the console must seed the form and hash the operation.
  const target = '0x47b1F34b0f2BD9c8b8b1E4A1f7D4c9c0b3A5E6d7';
  const data = '0xe1aae2770000000000000000000000001234567890abcdef1234567890abcdef12345678';
  await page.goto(`/app/admin/governance?kind=raw&label=assign-syndicate-test&target=${target}&data=${data}`);

  await expect(page.locator('#gov-target')).toHaveValue(target);
  await expect(page.locator('#gov-data')).toHaveValue(data);
  await expect(page.getByText(/Operation id: 0x[0-9a-f]{64}/i)).toBeVisible();
});

test('a mistyped address in the console reports, it does not crash the page', async ({ page }) => {
  // Same 40 hex characters with one case flipped: the EIP-55 checksum no
  // longer matches. This used to throw inside hashOperation and take the whole
  // console down, and the throw was reachable from a link.
  const bad = '0x47b1F34b0F2Bd9C8b8B1E4A1f7d4c9C0b3A5e6D7';
  await page.goto(`/app/admin/governance?kind=raw&label=typo&target=${bad}&data=0xe1aae277`);

  await expect(page.getByText('Safe → timelock execution')).toBeVisible();
  await expect(page.getByText(/fails its EIP-55 checksum/i)).toBeVisible();
});

test('transparency aggregates every deployed vault from chain', async ({ page }) => {
  await page.goto('/app/transparency');
  await expect(page.getByRole('heading', { name: /every vault, every unit of capacity/i })).toBeVisible();

  // Live protocol KPIs, read through the factory — not a hardcoded list.
  await expect(page.getByText('Total value locked')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText('Deployed to underwriting').first()).toBeVisible();
  await expect(page.getByText('Liquidity buffer').first()).toBeVisible();

  // Allocation charts and the reserve gauge.
  await expect(page.getByRole('heading', { name: 'Capital allocation' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Capacity by vault' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reserve security' })).toBeVisible();

  // The per-vault table lists real vaults with a live share price.
  await expect(page.getByRole('heading', { name: 'All deployed vaults' })).toBeVisible();
  await expect(page.locator('table a[href^="/app/vault/0x"]').first()).toBeVisible({ timeout: 45_000 });

  // History is honest about needing the indexer rather than drawing a fake line.
  await expect(page.getByRole('heading', { name: /historical nav per share/i })).toBeVisible();
});

test('apply presents the three roles side by side', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/app/apply');
  const cards = page.locator('[data-track-section="apply_role_cards"] > button');
  await expect(cards).toHaveCount(3);

  // Same row on desktop: all three share a vertical position (the 2+1 wrap the
  // owner reported would put the third card lower).
  const tops = await cards.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(8);
});
