// RPL Compass login rebuild — UI-state contract (no emulator/session needed).
// Verifies the rebuilt LoginForm: tab structure, Google button, forgot-password
// flow, signup fields, and the selector contract the other specs rely on
// (input[name="email"], input[type="password"], button[type="submit"] unique
// on the default Sign in tab).
// Run with: npx playwright test tests/login-ui.spec.ts (dev server on :3456).
import { test, expect, type Page } from '@playwright/test';

async function gotoLogin(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  // The card renders client-side; wait for the default tab's submit button.
  await expect(page.locator('button[type="submit"]')).toBeVisible({ timeout: 30000 });
}

test.describe('RPL Compass — login UI contract', () => {
  test('Sign in tab is the default and the selector contract holds', async ({ page }) => {
    await gotoLogin(page);

    // Exactly ONE email/password/submit — the Create account panel is not
    // rendered until its tab is selected (keeps landing/rpl specs green).
    await expect(page.locator('input[name="email"]')).toHaveCount(1);
    await expect(page.locator('input[type="password"]')).toHaveCount(1);
    await expect(page.locator('button[type="submit"]')).toHaveCount(1);
    await expect(page.locator('input[name="email"]')).toHaveAttribute('placeholder', 'you@example.com');

    // Tabs present with correct labels; Sign in is active.
    await expect(page.getByRole('tab', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Create account' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Sign in' })).toHaveAttribute('aria-selected', 'true');

    // Google button + role note copy.
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
    await expect(page.getByText(/new accounts start as candidates/i)).toBeVisible();
  });

  test('Create account tab reveals signup fields and hides the sign-in form', async ({ page }) => {
    await gotoLogin(page);

    await page.getByRole('tab', { name: 'Create account' }).click();

    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="confirmPassword"]')).toBeVisible();
    await expect(page.locator('input[autocomplete="new-password"]')).toHaveCount(2);
    await expect(page.locator('button[type="submit"]')).toHaveText(/create account/i);

    // Password strength hint appears while typing.
    await page.locator('input[autocomplete="new-password"]').first().fill('abc');
    await expect(page.getByText(/^Weak password/)).toBeVisible();
    await page.locator('input[autocomplete="new-password"]').first().fill('Str0ng!Passw0rd#2026');
    await expect(page.getByText(/^Strong password/)).toBeVisible();

    // Switching back restores the sign-in contract (unique email input again).
    await page.getByRole('tab', { name: 'Sign in' }).click();
    await expect(page.locator('input[name="name"]')).toHaveCount(0);
    await expect(page.locator('input[name="email"]')).toHaveCount(1);
    await expect(page.locator('button[type="submit"]')).toHaveText(/sign in/i);
  });

  test('Forgot password shows a non-enumerating confirmation', async ({ page }) => {
    await gotoLogin(page);

    // Without an email: inline guidance, no network call needed.
    // (Scope past Next's route announcer, which also uses role="alert".)
    await page.getByRole('button', { name: /forgot password/i }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: /enter your email above first/i }),
    ).toBeVisible();

    await page.locator('input[name="email"]').fill('someone@example.com');
    await page.getByRole('button', { name: /forgot password/i }).click();

    // Non-enumerating copy must not confirm whether the account exists.
    await expect(
      page.getByRole('status').filter({ hasText: /if an account exists for that email/i }),
    ).toBeVisible({ timeout: 20000 });
  });

  test('demo prefill still populates the sign-in form', async ({ page }) => {
    await page.goto('/login?demo=executive', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('input[name="email"]')).toHaveValue('exec@test.local', {
      timeout: 30000,
    });
    await expect(page.locator('input[type="password"]')).toHaveValue('Test123456!');
  });

  test('empty sign-in shows validation messages and focuses the first error', async ({ page }) => {
    await gotoLogin(page);
    await page.locator('button[type="submit"]').click();

    await expect(page.getByText('Email is required.')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Password is required.')).toBeVisible();

    // Focus lands on the first invalid field (keyboard/screen-reader flow).
    await expect(page.locator('input[name="email"]')).toBeFocused();
  });

  test('create account validation errors and mismatched passwords', async ({ page }) => {
    await gotoLogin(page);
    await page.getByRole('tab', { name: 'Create account' }).click();

    await page.locator('button[type="submit"]').click();
    await expect(page.getByText('Name is required.')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[name="name"]')).toBeFocused();

    await page.locator('input[name="name"]').fill('Candidate One');
    await page.locator('input[name="email"]').fill('cand-one@example.com');
    const pw = page.locator('input[autocomplete="new-password"]');
    await pw.nth(0).fill('Short1!');
    await pw.nth(1).fill('Different1!');
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText('Passwords do not match.')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[name="confirmPassword"]')).toBeFocused();
  });

  test('mobile 360px: the auth card fits without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await gotoLogin(page);

    await expect(page.getByRole('tab', { name: 'Create account' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll at 360px').toBeLessThanOrEqual(0);

    await page.getByRole('tab', { name: 'Create account' }).click();
    await expect(page.locator('input[name="name"]')).toBeVisible();
    const overflowSignup = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflowSignup, 'no horizontal scroll on signup tab at 360px').toBeLessThanOrEqual(0);
  });
});
