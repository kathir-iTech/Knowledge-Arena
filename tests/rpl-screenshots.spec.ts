// SIH-26242 Part 3 — design screenshots for the landing + RPL pages at
// desktop (1280) and mobile (390) widths. Output: ./screenshots-sih/
// Run: npx playwright test tests/rpl-screenshots.spec.ts
import { test, expect } from '@playwright/test';
import {
  BASE,
  signInViaUi,
  signUpViaUi,
  clearRateLimits,
  ensureRoleUser,
  uniqueEmail,
} from './support/rpl-testkit';

const SHOTS = 'screenshots-sih';

for (const [name, width, height] of [
  ['desktop', 1280, 800],
  ['mobile', 390, 844],
] as const) {
  test.describe(`Part 3 screenshots @ ${name}`, () => {
    test.use({ viewport: { width, height } });

    test.beforeEach(async () => {
      test.setTimeout(180_000);
      await clearRateLimits();
    });

    test('landing page', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await expect(
        page.getByRole('heading', { name: /Standardise how assessors/i }),
      ).toBeVisible({ timeout: 90_000 });
      // Scroll-reveal sections only intersect (and finish their 0.7s fade)
      // after scrolling. Walk the page so the fullPage capture shows content,
      // not mid-transition blanks.
      await page.evaluate(async () => {
        const h = document.body.scrollHeight;
        for (let y = 0; y <= h; y += 600) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 120));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${SHOTS}/landing-${name}.png`, fullPage: true });
    });

    test('rpl home (signed-in candidate landing)', async ({ page }) => {
      // /rpl is a guest-protected route: signed-out visitors are sent to
      // /login?next=/rpl (layout.tsx). Capture it as a signed-in candidate.
      const email = uniqueEmail('shot-home');
      await ensureRoleUser(email, 'candidate', 'Home Pilot');
      await signInViaUi(page, email);
      await expect(page).toHaveURL(`${BASE}/rpl`);
      await expect(page.getByText('What is RPL?')).toBeVisible({ timeout: 90_000 });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${SHOTS}/rpl-home-${name}.png`, fullPage: true });
    });

    test('candidate declaration wizard', async ({ page }) => {
      const email = uniqueEmail('shot-cand');
      await signUpViaUi(page, { name: 'Ananya Sharma', email, expectPath: '/rpl' });
      await page.goto(`${BASE}/rpl/declare`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: /Personal & trade context/i })).toBeVisible({
        timeout: 60_000,
      });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${SHOTS}/declare-${name}.png`, fullPage: true });
    });

    test('assessor queue', async ({ page }) => {
      const email = uniqueEmail('shot-ass');
      await ensureRoleUser(email, 'assessor', 'Assessor Asha');
      await signInViaUi(page, email);
      await expect(page).toHaveURL(`${BASE}/rpl/assessor`, { timeout: 60_000 });
      await expect(page.getByRole('heading', { name: 'Assessor Home' })).toBeVisible({
        timeout: 60_000,
      });
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${SHOTS}/assessor-${name}.png`, fullPage: true });
    });

    test('admin overview', async ({ page }) => {
      const email = uniqueEmail('shot-adm');
      await ensureRoleUser(email, 'admin', 'Admin Arun');
      await signInViaUi(page, email);
      await expect(page).toHaveURL(`${BASE}/rpl/admin`, { timeout: 60_000 });
      // Wait for LOADED content (demo-data button), not the branded skeleton
      // wall — otherwise the capture shows loaders instead of the dashboard.
      await expect(
        page
          .getByRole('button', { name: 'Load demo data' })
          .or(page.getByText('Admin overview unavailable')),
      ).toBeVisible({ timeout: 150_000 });
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${SHOTS}/admin-${name}.png`, fullPage: true });
    });
  });
}