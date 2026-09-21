import { test, expect } from '@playwright/test';

const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:3456';

test.describe('Dashboard Flow — Executive login', () => {
  test('visits /login, signs in as exec, redirects to /executive', async ({ page }) => {
    // Uses demo pre-fill so email/password are seeded, then asserts submit works.
    await page.goto(`${BASE_URL}/login?demo=executive`);
    await page.waitForLoadState('networkidle');

    const email = page.locator('input[name="email"]');
    await expect(email).toHaveValue('exec@test.local', { timeout: 20000 });

    const password = page.locator('input[type="password"]');
    await expect(password).toHaveValue('Test123456!');

    // Explicitly fill to mirror a real user flow (guards against prefill regressions).
    await email.fill('exec@test.local');
    await password.fill('Test123456!');

    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/executive/, { timeout: 30000 });
    expect(page.url()).toContain('/executive');
  });
});
