// SIH-26242 Part 5 — offline behaviour, mobile layout, and an accessibility
// (axe-core) sweep of the RPL surface.
//
// Requires: Firebase emulators + dev server on :3456 (see rpl-testkit).
// Run: npx playwright test tests/rpl-offline-mobile-axe.spec.ts --reporter=list
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import {
  BASE,
  signInViaUi,
  clearRateLimits,
  ensureRoleUser,
} from './support/rpl-testkit';

const AXE_PATH = path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js');

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: number;
  targets: string[];
}

/** Inject locally-installed axe-core and return its violations. */
async function axeViolations(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    // @ts-expect-error axe is injected at runtime by addScriptTag
    const results = await window.axe.run(document, { resultTypes: ['violations'] });
    return results.violations.map(
      (v: {
        id: string;
        impact: string | null;
        help: string;
        nodes: Array<{ target: string[] }>;
      }) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length,
        targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
      }),
    );
  });
}

/** Fail only on axe 'serious'/'critical' violations (the release gate). */
async function expectNoSeriousAxe(page: Page): Promise<void> {
  const violations = await axeViolations(page);
  const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  if (blocking.length > 0) {
    console.log('AXE blocking violations:', JSON.stringify(blocking, null, 2));
  }
  expect(blocking, `axe serious/critical violations: ${JSON.stringify(blocking)}`).toEqual([]);
}

const OFFLINE_BANNER = 'You are offline. Some features may be unavailable.';
const OFFLINE_DECLARE =
  "You're offline — your declaration will be saved and submitted when you reconnect.";

test.describe('Part 5 — offline / mobile / axe (RPL surface)', () => {
  test.use({ bypassCSP: true });
  test.setTimeout(900_000);

  test.beforeEach(async () => {
    await clearRateLimits();
  });

  test('offline: banner appears on /rpl and the declare page shows its offline notice', async ({
    page,
  }) => {
    const email = 'part5-candidate@rplcompass.test';
    await ensureRoleUser(email, 'candidate', 'Part 5 Candidate');
    await signInViaUi(page, email);

    await page.goto(BASE + '/rpl', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('What is RPL?')).toBeVisible({ timeout: 60000 });

    // Go offline: the global OfflineDetector must announce it.
    await page.context().setOffline(true);
    await expect(page.getByText(OFFLINE_BANNER).first()).toBeVisible({ timeout: 20000 });

    // Back online: the recovery banner is shown briefly.
    await page.context().setOffline(false);
    await expect(page.getByText('Back online.').first()).toBeVisible({ timeout: 20000 });

    // The declaration wizard owns its own offline notice + queued submit.
    await page.goto(BASE + '/rpl/declare', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#trade')).toBeVisible({ timeout: 60000 });
    await page.context().setOffline(true);
    await expect(page.getByText(OFFLINE_DECLARE).first()).toBeVisible({ timeout: 20000 });
  });

  test('mobile 390x844: /rpl and /rpl/declare have no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const email = 'part5-mobile@rplcompass.test';
    await ensureRoleUser(email, 'candidate', 'Part 5 Mobile');
    await signInViaUi(page, email);

    for (const [url, heading] of [
      [BASE + '/rpl', 'What is RPL?'],
      [BASE + '/rpl/declare', /Personal & trade context/i],
    ] as const) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText(heading).first()).toBeVisible({ timeout: 60000 });
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return { scrollW: doc.scrollWidth, clientW: doc.clientWidth };
      });
      expect(
        overflow.scrollW,
        `horizontal overflow on ${url}: ${JSON.stringify(overflow)}`,
      ).toBeLessThanOrEqual(overflow.clientW + 1);
    }
  });

  test('axe: /login has no serious/critical accessibility violations', async ({ page }) => {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('button[type="submit"]').first()).toBeVisible({ timeout: 60000 });
    await expectNoSeriousAxe(page);
  });

  test('axe: /rpl (candidate home) has no serious/critical accessibility violations', async ({
    page,
  }) => {
    const email = 'part5-axe@rplcompass.test';
    await ensureRoleUser(email, 'candidate', 'Part 5 Axe');
    await signInViaUi(page, email);
    await page.goto(BASE + '/rpl', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('What is RPL?')).toBeVisible({ timeout: 60000 });
    await expectNoSeriousAxe(page);
  });
});
