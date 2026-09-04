import { test, expect } from '@playwright/test';

const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:3456';

// Public/renderable-without-auth pages (shared layout + landing + special states).
const PUBLIC_PAGES = [
  '/',
  '/login',
  '/kicked',
  '/cheating-detected',
  '/force-password-change',
];

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 667 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];

test.describe('Tier 4 — responsive layout sweep (public surface)', () => {
  for (const vp of VIEWPORTS) {
    for (const path of PUBLIC_PAGES) {
      test(`no horizontal overflow: ${path} @ ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(1500);

        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          const body = document.body;
          return {
            htmlScrollW: doc.scrollWidth,
            htmlClientW: doc.clientWidth,
            bodyScrollW: body ? body.scrollWidth : 0,
          };
        });

        const hasHOverflow = overflow.htmlScrollW > overflow.htmlClientW + 1;
        // Assert no horizontal overflow
        expect(hasHOverflow, JSON.stringify(overflow)).toBe(false);

        // Assert the page actually rendered content (shell present)
        const bodyText = await page.evaluate(() => document.body ? document.body.innerText.length : 0);
        expect(bodyText).toBeGreaterThan(0);
      });
    }
  }
});
