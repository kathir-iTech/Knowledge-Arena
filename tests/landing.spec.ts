import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:3456';

test.describe('Public Landing Page', () => {
  test('renders all sections and CTAs', async ({ page }) => {
    await page.goto(BASE_URL + '/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1:has-text("Learn. Battle.")')).toBeVisible({ timeout: 20000 });

    // Nav
    const nav = page.locator('nav[aria-label="Primary"]');
    await expect(nav.locator('a:has-text("Product")')).toBeVisible();
    await expect(nav.locator('a:has-text("Demo")')).toBeVisible();
    await expect(nav.locator('a:has-text("Team")')).toBeVisible();
    await expect(page.locator('a:has-text("Enter the Arena")').first()).toBeVisible();

    // Demo section with one-click role cards
    await expect(page.locator('h2:has-text("Try the live product in one click")')).toBeVisible();
    await expect(page.locator('button:has-text("Executive")')).toBeVisible();
    await expect(page.locator('button:has-text("Commander")')).toBeVisible();
    await expect(page.locator('button:has-text("Gladiator")')).toBeVisible();

    // Showcases
    await expect(page.locator('h2:has-text("One arena. Three battle stations.")')).toBeVisible();
    await expect(page.locator('h2:has-text("From lecture PDF to battle arena in minutes")')).toBeVisible();
    await expect(page.locator('h2:has-text("Watch every arena breathe")')).toBeVisible();
    await expect(page.locator('h2:has-text("Executive intelligence, not just dashboards")')).toBeVisible();

    // Features / Architecture / Team / CTA / Footer
    await expect(page.locator('h2:has-text("Everything a quiz platform should be")')).toBeVisible();
    await expect(page.locator('h2:has-text("Serverless, real-time, audited")')).toBeVisible();
    await expect(page.locator('h2:has-text("Built by people who love classrooms")')).toBeVisible();
    await expect(page.locator('h2:has-text("The bell rings in 5 minutes")')).toBeVisible();
    await expect(page.locator('footer:has-text("HackVerse")')).toBeVisible();

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

  test('one-click demo signs in as Executive', async ({ page }) => {
    await page.goto(BASE_URL + '/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const execButton = page.locator('button:has-text("Executive")').first();
    await execButton.scrollIntoViewIfNeeded();
    await execButton.click();
    // The click can race React hydration — retry once if still on the landing page.
    await page.waitForTimeout(2500);
    if (page.url().includes('/executive')) return;
    if (!page.url().includes('/login')) {
      await execButton.click();
    }
    await page.waitForURL(/\/(executive|login)/, { timeout: 45000 });
    expect(page.url()).toContain('/executive');
  });

  test('one-click demo signs in as Gladiator', async ({ page }) => {
    await page.goto(BASE_URL + '/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const gladButton = page.locator('button:has-text("Gladiator")').first();
    await gladButton.scrollIntoViewIfNeeded();
    await gladButton.click();
    await page.waitForTimeout(2500);
    if (page.url().includes('/gladiator')) return;
    if (!page.url().includes('/login')) {
      await gladButton.click();
    }
    await page.waitForURL(/\/(gladiator|login)/, { timeout: 45000 });
    expect(page.url()).toContain('/gladiator');
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
