import { test, expect } from '@playwright/test';

test('simple page load', async ({ page }) => {
  await page.goto('/', { timeout: 30000 });
  await page.waitForTimeout(5000);
  const h1 = page.locator('h1');
  await expect(h1).toBeVisible({ timeout: 15000 });
});

test('kicked page', async ({ page }) => {
  await page.goto('/kicked', { timeout: 30000 });
  await page.waitForTimeout(5000);
  const h1 = page.locator('h1');
  await expect(h1).toBeVisible({ timeout: 15000 });
});

test('cheating detected', async ({ page }) => {
  await page.goto('/cheating-detected', { timeout: 30000 });
  await page.waitForTimeout(5000);
  const h1 = page.locator('h1');
  await expect(h1).toBeVisible({ timeout: 15000 });
});

test('force password change', async ({ page }) => {
  await page.goto('/force-password-change', { timeout: 30000 });
  await page.waitForTimeout(5000);
  const h1 = page.locator('h1');
  await expect(h1).toBeVisible({ timeout: 15000 });
});
