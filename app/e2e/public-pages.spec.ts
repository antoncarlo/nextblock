import { test, expect } from '@playwright/test';

/**
 * Public institutional pages — the surface a prospect sees before any wallet.
 */

test('landing renders the institutional hero and Launch App', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /launch app/i }).first()).toBeVisible();
});

test('privacy policy is live and discloses analytics', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByText(/nb_sid|analytics/i).first()).toBeVisible();
});

test('terms are live', async ({ page }) => {
  await page.goto('/terms');
  await expect(page.getByRole('heading').first()).toBeVisible();
});

test('the CSP allows the indexer the app actually reads', async ({ page }) => {
  // Every indexed read — LP exit history, epoch settlements, NAV series — is a
  // browser fetch to the subgraph. Goldsky was missing from connect-src, so the
  // policy blocked them all and the UI reported "Failed to fetch" while the
  // endpoint was healthy and answered curl normally. A missing origin here is
  // invisible until a user opens the page, so it is asserted.
  const response = await page.goto('/');
  const csp = response?.headers()['content-security-policy'] ?? '';
  const connectSrc = csp.split(';').find((d) => d.trim().startsWith('connect-src')) ?? '';
  expect(connectSrc, 'connect-src must allow the subgraph host').toContain('https://api.goldsky.com');
});

test('the landing states no yield range', async ({ page }) => {
  // A range on a public page becomes a second source of truth that can
  // contradict the offering documents the moment either one moves — and the
  // page is what reaches people first. Per-vault targets belong on the vault,
  // labelled illustrative, next to the terms that qualify them.
  await page.goto('/');
  const body = await page.locator('body').innerText();
  const ranges = body.match(/\d{1,2}\s*[-–—]\s*\d{1,2}\s*%/g) ?? [];
  expect(ranges, `landing must not quote a yield range, found: ${ranges.join(', ')}`).toHaveLength(0);
});

test('the footer carries the current handle, year and on-site risk link', async ({ page }) => {
  await page.goto('/');
  // The old handle was reclaimable by a third party; the risk link used to
  // resolve to a document stamped "DRAFT — not legal advice".
  // Case matters: the handle is NextBlockRWA, not Nextblockrwa.
  await expect(page.locator('a[href*="x.com"]')).toHaveAttribute('href', 'https://x.com/NextBlockRWA');
  await expect(page.locator('a[href="/terms#risk"]')).toBeVisible();
  await expect(page.locator('a[href*="github"]')).toHaveCount(0);
  await expect(page.getByText(`© ${new Date().getFullYear()} NextBlock`)).toBeVisible();
});
