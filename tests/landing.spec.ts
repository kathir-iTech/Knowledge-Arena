import { test, expect } from '@playwright/test';

const BASE_URL = process.env.QA_BASE_URL || 'http://127.0.0.1:3456';

test.describe('Public Landing Page', () => {
  test('renders all sections and CTAs', async ({ page }) => {
    // Attach console/pageerror listeners BEFORE navigation so early errors are captured.
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));
    await page.goto(BASE_URL + '/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1:has-text("Turn any lesson into a live quiz.")')).toBeVisible({ timeout: 20000 });

    // Plain-language intro for first-time teachers/students
    await expect(page.locator('text=Quorena turns it into a quiz in minutes').first()).toBeVisible();

    // Nav (product sections only — no demo/team/architecture links)
    const nav = page.locator('nav[aria-label="Primary"]');
    await expect(nav.locator('a:has-text("How it works")')).toBeVisible();
    await expect(nav.locator('a:has-text("Quiz Creator")')).toBeVisible();
    await expect(nav.locator('a:has-text("Live Quizzes")')).toBeVisible();
    await expect(nav.locator('a:has-text("Insights")')).toBeVisible();
    await expect(nav.locator('a:has-text("Demo")')).toHaveCount(0);
    await expect(nav.locator('a:has-text("Team")')).toHaveCount(0);
    await expect(page.locator('a:has-text("Sign in")').first()).toBeVisible();
    await expect(page.locator('a:has-text("See how it works")').first()).toBeVisible();

    // No demo-mode section or one-click role sign-in on the public page
    await expect(page.locator('text=DEMO MODE')).toHaveCount(0);
    await expect(page.locator('text=Try the live product in one click')).toHaveCount(0);

    // Showcases
    await expect(page.locator('h2:has-text("A quiz for every role.")')).toBeVisible();
    await expect(page.locator('h2:has-text("From PDF to quiz in minutes")')).toBeVisible();
    await expect(page.locator('h2:has-text("Everyone plays at the same time")')).toBeVisible();
    await expect(page.locator('h2:has-text("See how your class is doing")')).toBeVisible();

    // Features / CTA / Footer
    await expect(page.locator('h2:has-text("Everything a great quiz needs")')).toBeVisible();
    await expect(page.locator('h2:has-text("Ready to run your first quiz?")')).toBeVisible();
    await expect(page.locator('footer:has-text("HackVerse")')).toHaveCount(0);
    await expect(page.locator('footer:has-text("© 2026 Quorena")')).toBeVisible();

    // No console errors (listeners were attached before navigation above)
    await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
    expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('no horizontal overflow on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE_URL + '/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1:has-text("Turn any lesson into a live quiz.")')).toBeVisible({ timeout: 20000 });
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflows).toBeLessThanOrEqual(1);
  });
});

test.describe('Login page', () => {
  test('prefills demo credentials and signs in', async ({ page }) => {
    await page.goto(BASE_URL + '/login?demo=executive');
    await page.waitForLoadState('networkidle');

    const email = page.locator('input[name="email"]');
    await expect(email).toHaveValue('exec@test.local', { timeout: 20000 });
    await expect(page.locator('input[type="password"]')).toHaveValue('Test123456!');

    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/executive/, { timeout: 30000 });
  });
});
