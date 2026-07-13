import { test, expect } from '@playwright/test';

/**
 * Email sign-in / registration gateway — the public halves of the flow.
 * (The magic-link click itself needs a real inbox; covered manually. These
 * tests pin the pages a user actually lands on, so the path can never
 * silently regress to a dead end again.)
 */

test('auth page renders the sign-in/registration form', async ({ page }) => {
  await page.goto('/auth');
  await expect(page.getByRole('heading', { name: 'Sign in or register' })).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /send sign-in link/i })).toBeVisible();
  // Honest boundary stated on the page: email carries no on-chain authority.
  await expect(page.getByText(/authorized wallet/i)).toBeVisible();
});

test('auth callback shows the verifying state, then the retry path on a dead link', async ({ page }) => {
  await page.goto('/auth/callback');
  await expect(page.getByText('Signing you in…')).toBeVisible();
  // No token in the URL → after the timeout the explicit retry path appears.
  await expect(page.getByRole('link', { name: /request a new link/i })).toBeVisible({ timeout: 15_000 });
});

test('header shows a single Sign in entry on desktop', async ({ page }) => {
  await page.goto('/app');
  const signIn = page.getByRole('link', { name: /sign in or register/i });
  await expect(signIn).toBeVisible();
  // Standard-site pattern: exactly one entry point, no inline credential
  // fields in the header (credentials live on /auth).
  await expect(signIn).toHaveCount(1);
  await expect(page.locator('header input[type="email"]')).toHaveCount(0);
  await expect(page.locator('header input[type="password"]')).toHaveCount(0);
});

test('header shows the same single Sign in entry on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app');
  await expect(page.getByRole('link', { name: /sign in or register/i })).toBeVisible();
});

test('Sign in leads to the auth gateway', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('link', { name: /sign in or register/i }).click();
  await expect(page).toHaveURL(/\/auth/);
  await expect(page.getByRole('heading', { name: 'Sign in or register' })).toBeVisible();
});
