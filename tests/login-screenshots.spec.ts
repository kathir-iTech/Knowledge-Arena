// Screenshot capture for the RPL Compass /login page (both tabs + error state)
// at desktop (1280) and mobile (390) widths. Output goes to ./screenshots-sih/
// which is deliberately left UNTRACKED (never committed).
// Run: npx playwright test tests/login-screenshots.spec.ts
import { test, expect, type Page } from '@playwright/test';

async function gotoLogin(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('button[type="submit"]')).toBeVisible({ timeout: 30000 });
}

for (const [name, width, height] of [
  ['desktop', 1280, 800],
  ['mobile', 390, 844],
] as const) {
  test.describe(`/login screenshots @ ${name}`, () => {
    test.use({ viewport: { width, height } });

    test('sign-in tab', async ({ page }) => {
      await gotoLogin(page);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `screenshots-sih/login-signin-${name}.png`, fullPage: true });
    });

    test('create-account tab with a strength hint', async ({ page }) => {
      await gotoLogin(page);
      await page.getByRole('tab', { name: 'Create account' }).click();
      await page.locator('input[name="name"]').fill('Suresh Kumar');
      await page.locator('input[name="email"]').fill('suresh.kumar@example.com');
      await page.locator('input[autocomplete="new-password"]').first().fill('Str0ng!Passw0rd#2026');
      await page.locator('input[autocomplete="new-password"]').nth(1).fill('Str0ng!Passw0rd#2026');
      await expect(page.getByText(/^Strong password/)).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(400);
      await page.screenshot({
        path: `screenshots-sih/login-signup-${name}.png`,
        fullPage: true,
      });
    });

    test('error state (empty submit -> validation messages)', async ({ page }) => {
      await gotoLogin(page);
      await page.locator('button[type="submit"]').click();
      await expect(page.getByText('Email is required.')).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(400);
      await page.screenshot({
        path: `screenshots-sih/login-error-${name}.png`,
        fullPage: true,
      });
    });
  });
}