import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:3456';

test.describe('Public Landing Page', () => {
  test('renders all sections and CTAs', async ({ page }) => {
    await page.goto(BASE_URL + '/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1:has-text("Learn. Battle.")')).toBeVisible({ timeout: 20000 });

    // Plain-language intro for first-time teachers/students
    await expect(page.locator('text=Teachers turn lesson material into quizzes').first()).toBeVisible();

    // Nav (product sections only — no demo/team/architecture links)
    const nav = page.locator('nav[aria-label="Primary"]');
    await expect(nav.locator('a:has-text("Product")')).toBeVisible();
    await expect(nav.locator('a:has-text("AI Forge")')).toBeVisible();
    await expect(nav.locator('a:has-text("Live Battles")')).toBeVisible();
    await expect(nav.locator('a:has-text("Analytics")')).toBeVisible();
    await expect(nav.locator('a:has-text("Demo")')).toHaveCount(0);
    await expect(nav.locator('a:has-text("Team")')).toHaveCount(0);
    await expect(page.locator('a:has-text("Enter the Arena")').first()).toBeVisible();
    await expect(page.locator('a:has-text("See how it works")').first()).toBeVisible();

    // No demo-mode section or one-click role sign-in on the public page
    await expect(page.locator('text=DEMO MODE')).toHaveCount(0);
    await expect(page.locator('text=Try the live product in one click')).toHaveCount(0);

    // Showcases
    await expect(page.locator('h2:has-text("One arena. Three battle stations.")')).toBeVisible();
    await expect(page.locator('h2:has-text("From lecture PDF to battle arena in minutes")')).toBeVisible();
    await expect(page.locator('h2:has-text("Watch every arena breathe")')).toBeVisible();
    await expect(page.locator('h2:has-text("Executive intelligence, not just dashboards")')).toBeVisible();

    // Features / CTA / Footer
    await expect(page.locator('h2:has-text("Everything a battle-ready arena needs")')).toBeVisible();
    await expect(page.locator('h2:has-text("The bell rings in 5 minutes")')).toBeVisible();
    await expect(page.locator('footer:has-text("HackVerse")')).toHaveCount(0);
    await expect(page.locator('footer:has-text("© 2026 Quorena")')).toBeVisible();

    // No console errors
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));
    await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
    expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('no horizontal overflow on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE_URL + '/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1:has-text("Learn. Battle.")')).toBeVisible({ timeout: 20000 });
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
