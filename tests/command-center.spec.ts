import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:3456';

test.describe('Live Battle Command Center', () => {
  test('executive sees live battles, presence, leaderboard, predictions and heatmap in real time', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push('PAGEERROR: ' + err.message));

    // Sign in as executive (emulator)
    await page.goto(BASE_URL + '/login', { waitUntil: 'domcontentloaded' });
    await page.locator('input[name="email"]').fill('exec@test.local');
    await page.locator('input[type="password"]').fill('Test123456!');
    await page.locator('button[type="submit"]').click();

    // Wait for the executive portal to load
    await expect(page.locator('text=Knowledge Arena')).toBeVisible({ timeout: 15000 });
    await page.waitForURL(/\/executive|login|$/, { timeout: 15000 });
    await page.waitForTimeout(2500);

    // Navigate to the Command Center
    await page.goto(BASE_URL + '/executive/command-center', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=Battle Command Center')).toBeVisible({ timeout: 60000 });

    // Both seeded battles appear (live + waiting) — via the battle list cards
    await expect(page.locator('button:has-text("Midnight Clash")').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('button:has-text("Waiting Arena")').first()).toBeVisible({ timeout: 15000 });

    // Header stats
    const stats = await page.locator('text=Live Battles').count();
    expect(stats).toBeGreaterThanOrEqual(1);

    // Default selection is the live battle → detail panels
    await expect(page.locator('text=Live Leaderboard').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Winner Prediction').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Answer Heatmap').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Participant Activity').first()).toBeVisible({ timeout: 10000 });

    // Leaderboard rows (Ruby is the leader with score 1240)
    await expect(page.locator('text=Ruby').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('h2:has-text("Midnight Clash")')).toBeVisible();

    // Switch to the waiting battle detail via card selection
    const waitingCard = page.locator('button:has-text("Waiting Arena")').first();
    await waitingCard.click();
    await expect(page.locator('h2:has-text("Waiting Arena")')).toBeVisible({ timeout: 10000 });

    // No serious console errors
    const serious = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('ERR_CERT'));
    expect(serious, consoleErrors.join('\n')).toHaveLength(0);
  });
});