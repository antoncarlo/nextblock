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
