// SIH-26242 Part 8 — presenter demo guide (/rpl/admin/demo-guide).
//
// Verifies the ready checklist, the walkthrough steps (including the
// Suresh Kumar / ELE-Q1301 low-agreement story), that admin-only controls
// render, that a non-admin is redirected away, and that Load → Reset round-
// trips through the existing admin demo endpoint.
//
// Requires: Firebase emulators + dev server on :3456 (see rpl-testkit).
// Run: npx playwright test tests/rpl-demo-guide.spec.ts --reporter=list
import { test, expect } from '@playwright/test';
import { BASE, signInViaUi, clearRateLimits, ensureRoleUser } from './support/rpl-testkit';

test.describe('Part 8 — presenter demo guide', () => {
  test.setTimeout(900_000);

  test.beforeEach(async () => {
    await clearRateLimits();
  });

  test('admin sees the ready steps, walkthrough and controls', async ({ page }) => {
    const email = 'part8-guide-admin@rplcompass.test';
    await ensureRoleUser(email, 'admin', 'Part 8 Guide Admin');
    await signInViaUi(page, email);

    await page.goto(BASE + '/rpl/admin/demo-guide', { waitUntil: 'domcontentloaded' });

    // Page identity.
    await expect(page.getByTestId('demo-guide-page')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'Presenter demo guide' })).toBeVisible();

    // Ready checklist: all five steps.
    await expect(page.getByTestId('demo-guide-ready')).toBeVisible();
    for (let i = 1; i <= 5; i += 1) {
      await expect(page.getByTestId(`demo-guide-ready-${i}`)).toBeVisible();
    }

    // Walkthrough: all six steps render (text only — we do not click through).
    await expect(page.getByTestId('demo-guide-walkthrough')).toBeVisible();
    for (let i = 1; i <= 6; i += 1) {
      await expect(page.getByTestId(`demo-guide-step-${i}`)).toBeVisible();
    }

    // The low-agreement story is the second step; Suresh Kumar is the third.
    await expect(page.getByTestId('demo-guide-step-2')).toContainText('0.3846');
    await expect(page.getByTestId('demo-guide-step-3')).toContainText('Suresh Kumar');
    // Every step carries a live readiness indicator computed from real data.
    for (let i = 1; i <= 6; i += 1) {
      await expect(page.getByTestId(`demo-guide-step-${i}-ready`)).toBeVisible();
    }
    await expect(page.getByTestId('demo-guide-recheck')).toBeVisible();

    // Admin-only controls.
    await expect(page.getByTestId('demo-guide-controls')).toBeVisible();
    await expect(page.getByTestId('demo-guide-load')).toBeVisible();
    await expect(page.getByTestId('demo-guide-reset')).toBeVisible();
  });

  test('a non-admin (assessor) is redirected away from the guide', async ({ page }) => {
    const email = 'part8-guide-assessor@rplcompass.test';
    await ensureRoleUser(email, 'assessor', 'Part 8 Guide Assessor');
    await signInViaUi(page, email);

    await page.goto(BASE + '/rpl/admin/demo-guide', { waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => !url.pathname.startsWith('/rpl/admin/demo-guide'), {
      timeout: 60_000,
    });
    await expect(page.getByTestId('demo-guide-page')).toHaveCount(0);
  });

  test('after Load demo data, every walkthrough step shows Ready', async ({ page }) => {
    const email = 'part8-guide-admin@rplcompass.test';
    await ensureRoleUser(email, 'admin', 'Part 8 Guide Admin');
    await signInViaUi(page, email);

    await page.goto(BASE + '/rpl/admin/demo-guide', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('demo-guide-page')).toBeVisible({ timeout: 60_000 });

    // Load the synthetic dataset, then re-check readiness against live data.
    await page.getByTestId('demo-guide-load').click();
    await expect(page.getByTestId('demo-guide-load-result')).toBeVisible({ timeout: 120_000 });
    await page.getByTestId('demo-guide-recheck').click();

    // Every step must report Ready with its live detail — computed from real
    // API data, not static text.
    for (let i = 1; i <= 6; i += 1) {
      const badge = page.getByTestId(`demo-guide-step-${i}-ready`);
      await expect(badge).toContainText('Ready', { timeout: 60_000 });
    }

    // Step 2 (consistency) names the recomputed κ and the fired κ<0.4 alert.
    const step2 = page.getByTestId('demo-guide-step-2-ready');
    await expect(step2).toContainText('0.3846');
    await expect(step2).toContainText('alert fires');

    // Steps 3 and 5 deep-link to Suresh Kumar's real worker record (resolved
    // live from his reference code, never a hard-coded uid).
    const sureshLink = page.getByTestId('demo-guide-step-3').getByRole('link', { name: 'Open' });
    await expect(sureshLink).toHaveAttribute('href', /\/rpl\/profile\/.+/);
    const certLink = page.getByTestId('demo-guide-step-5').getByRole('link', { name: 'Open' });
    await expect(certLink).toHaveAttribute('href', /\/rpl\/certify\/.+/);

    // Step 4 (assessor queue) and step 6 (offline note) report their live basis.
    await expect(page.getByTestId('demo-guide-step-4-ready')).toContainText('queue');
    await expect(page.getByTestId('demo-guide-step-6-ready')).toContainText('Declare route serves');
  });

  test('Load demo data then Reset demo round-trips through the endpoint', async ({ page }) => {
    const email = 'part8-guide-admin@rplcompass.test';
    await ensureRoleUser(email, 'admin', 'Part 8 Guide Admin');
    await signInViaUi(page, email);

    await page.goto(BASE + '/rpl/admin/demo-guide', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('demo-guide-page')).toBeVisible({ timeout: 60_000 });

    // Load.
    await page.getByTestId('demo-guide-load').click();
    const loadResult = page.getByTestId('demo-guide-load-result');
    await expect(loadResult).toBeVisible({ timeout: 120_000 });
    await expect(loadResult).toContainText('Loaded');
    await expect(loadResult).toContainText('kappa');

    // Reset (behind a confirm dialog).
    await page.getByTestId('demo-guide-reset').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reset demo' }).click();
    const resetResult = page.getByTestId('demo-guide-reset-result');
    await expect(resetResult).toBeVisible({ timeout: 120_000 });
    await expect(resetResult).toContainText('Removed');
  });
});
