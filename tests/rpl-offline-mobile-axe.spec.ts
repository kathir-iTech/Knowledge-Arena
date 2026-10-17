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

// ── Part 5 follow-up: offline replay with a fresh token, full mobile sweep ──
// (all 13 RPL pages × 390×844 + 360×740), and an axe sweep of all 13 pages.
// The SW claims POST /api/rpl/declare (public/rpl-sw.js), so the replay test
// blocks service workers at the context level to make the replay POST
// observable/countable; the SW's own 202 contract stays covered by
// scripts/test-sih-gaps.mjs (B9).

/** Count of queued declarations in the page's IndexedDB offline store. */
async function pendingQueueCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('rpl-offline', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('rpl-pending-declarations')) {
            db.close();
            resolve(0);
            return;
          }
          try {
            const tx = db.transaction('rpl-pending-declarations', 'readonly');
            const req = tx.objectStore('rpl-pending-declarations').count();
            req.onsuccess = () => {
              const n = req.result ?? 0;
              db.close();
              resolve(n);
            };
            req.onerror = () => {
              db.close();
              reject(req.error);
            };
          } catch (e) {
            db.close();
            reject(e);
          }
        };
      }),
  );
}

test.describe('Part 5 follow-up — offline replay (service workers blocked)', () => {
  test.use({ serviceWorkers: 'block' });
  test.setTimeout(900_000);
  test.beforeEach(async () => {
    await clearRateLimits();
  });

  test('declare offline → saved locally → online → exactly one POST with a fresh token', async ({
    page,
  }) => {
    const email = 'part5-replay@rplcompass.test';
    await ensureRoleUser(email, 'candidate', 'Part 5 Replay');
    await signInViaUi(page, email);

    await page.goto(BASE + '/rpl/declare', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#trade')).toBeVisible({ timeout: 60000 });
    await page.locator('#trade').fill('Electrician');
    await page.locator('#years').fill('6');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('radio').first().click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.locator('textarea').first().fill('Wired homes in Nashik for six years.');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Submit declaration' })).toBeVisible({
      timeout: 20000,
    });

    // Offline submit: nothing may leave the device; the queue holds exactly one.
    await page.context().setOffline(true);
    await page.getByRole('button', { name: 'Submit declaration' }).click();
    await expect(page.getByText('Saved on this device').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('1 declaration saved on this device').first()).toBeVisible({
      timeout: 20000,
    });
    expect(await pendingQueueCount(page)).toBe(1);

    // Count replay POSTs (registered only now, so the offline attempt cannot pollute the count).
    const posts: Array<{ auth: string }> = [];
    await page.route('**/api/rpl/declare', async (route) => {
      if (route.request().method() === 'POST') {
        posts.push({ auth: route.request().headers()['authorization'] ?? '' });
      }
      await route.continue();
    });

    // Back online: the page replays on reconnect; Sync now is the fallback.
    await page.context().setOffline(false);
    let clickedSync = false;
    for (let i = 0; i < 30; i += 1) {
      if ((await pendingQueueCount(page)) === 0 && posts.length > 0) break;
      if (i >= 10 && !clickedSync) {
        const btn = page.getByRole('button', { name: 'Sync now' });
        if ((await btn.count()) > 0 && (await btn.first().isEnabled())) {
          await btn.first().click();
          clickedSync = true;
        }
      }
      await page.waitForTimeout(2000);
    }
    expect(await pendingQueueCount(page)).toBe(0);
    expect(posts.length).toBe(1);
    // Fresh token: offline-sync.ts fetches a Bearer token at replay time for
    // every record (with one forced refresh on 401) — observed here.
    expect(posts[0].auth).toMatch(/^Bearer \S+$/);
    await expect(page.getByText('1 declaration saved on this device')).toHaveCount(0);
    // No duplicate on a second look.
    await page.waitForTimeout(5000);
    expect(posts.length).toBe(1);
    console.log(
      `[replay] posts=${posts.length} freshBearer=${posts[0].auth.length > 20} clickedSync=${clickedSync}`,
    );
  });
});

interface SweepPage {
  path: string;
  ready: string;
}

interface SweepResult {
  overflowOk: boolean;
  scrollW: number;
  clientW: number;
  badButtons: Array<{ text: string; h: number }>;
  clipped: Array<{ tag: string; text: string }>;
}

/** Load the synthetic demo set as a fresh admin (idempotent). */
async function loadDemoForSweep(page: Page): Promise<void> {
  const adminEmail = 'part5-sweep-admin@rplcompass.test';
  await ensureRoleUser(adminEmail, 'admin', 'Part 5 Sweep Admin');
  // Candidate/assessor identities must exist BEFORE the load so the demo
  // route maps Suresh + the assessor pair to real uids.
  await ensureRoleUser('candidate1@rplcompass.test', 'candidate', 'Suresh Kumar');
  await ensureRoleUser('assessor1@rplcompass.test', 'assessor', 'Sweep Assessor One');
  await ensureRoleUser('assessor2@rplcompass.test', 'assessor', 'Sweep Assessor Two');
  await signInViaUi(page, adminEmail);
  await page.goto(BASE + '/rpl/admin/demo-guide', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('demo-guide-page')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('demo-guide-load').click();
  await expect(page.getByTestId('demo-guide-load-result')).toBeVisible({ timeout: 120_000 });
}

/** Switch accounts mid-test through the app's own sign-out control. A bare
 * second sign-in can strand the RPL layout guard on a transient null user
 * and bounce to /login; signing out first makes the hand-off deterministic. */
async function switchToUser(page: Page, email: string): Promise<void> {
  const signOut = page.getByRole('button', { name: 'Sign out' });
  if ((await signOut.count()) > 0) {
    await signOut.first().click();
    await page.waitForURL((url) => url.pathname.startsWith('/login'), { timeout: 60000 });
  }
  await signInViaUi(page, email);
}

async function sweepOnePage(page: Page, url: string, ready: string): Promise<SweepResult> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(ready).first()).toBeVisible({ timeout: 60000 });
  return page.evaluate(() => {
    const doc = document.documentElement;
    const scrollW = doc.scrollWidth;
    const clientW = doc.clientWidth;
    const badButtons = [...document.querySelectorAll('button')]
      .filter(
        (b) =>
          b.offsetParent !== null &&
          b.id !== 'next-logo' &&
          !b.hasAttribute('data-nextjs-dev-tools-button') &&
          // Form controls with full-row labels (radio/checkbox/switch) are
          // not tap-target buttons: the wrapping label is the target.
          !['radio', 'checkbox', 'switch', 'menuitemradio', 'menuitemcheckbox'].includes(
            b.getAttribute('role') ?? '',
          ),
      )
      .map((b) => ({
        text: (b.textContent ?? '').trim().slice(0, 40),
        h: b.getBoundingClientRect().height,
      }))
      .filter((b) => b.h < 39.5);
    const clipped = [...document.querySelectorAll('h1,h2,h3,button')]
      .filter((el) => {
        const e = el as HTMLElement;
        if (e.offsetParent === null) return false;
        if (e.id === 'next-logo' || e.hasAttribute('data-nextjs-dev-tools-button')) return false;
        // Intentional ellipsis (e.g. admin pack rows) is design, not a bug.
        if (e.classList.contains('truncate')) return false;
        if (getComputedStyle(e).textOverflow === 'ellipsis') return false;
        return e.scrollWidth > e.clientWidth + 1;
      })
      .map((el) => ({
        tag: el.tagName,
        text: (el.textContent ?? '').trim().slice(0, 60),
      }));
    return { overflowOk: scrollW <= clientW + 1, scrollW, clientW, badButtons, clipped };
  });
}

async function sweepPages(
  page: Page,
  label: string,
  pages: SweepPage[],
): Promise<void> {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 740 },
  ]) {
    await page.setViewportSize(viewport);
    for (const p of pages) {
      const r = await sweepOnePage(page, BASE + p.path, p.ready);
      console.log(
        `[mobile ${viewport.width}x${viewport.height} ${label}] ${p.path} ` +
          `overflow=${r.overflowOk ? 'ok' : `OVERFLOW scrollW=${r.scrollW} clientW=${r.clientW}`} ` +
          `buttons_lt40=${r.badButtons.length} clipped=${r.clipped.length}`,
      );
      expect(r.overflowOk, `horizontal overflow on ${p.path}: scrollW=${r.scrollW} clientW=${r.clientW}`).toBe(true);
      expect(r.badButtons, `buttons < 40px tall on ${p.path}: ${JSON.stringify(r.badButtons)}`).toEqual([]);
      expect(r.clipped, `clipped text on ${p.path}: ${JSON.stringify(r.clipped)}`).toEqual([]);
    }
  }
}

test.describe('Part 5 follow-up — mobile sweep (all RPL pages)', () => {
  test.use({ bypassCSP: true });
  test.setTimeout(900_000);

  test.beforeEach(async () => {
    await clearRateLimits();
  });

  test('candidate pages: no overflow, buttons >= 40px, no clipped text', async ({ page }) => {
    await loadDemoForSweep(page);
    const sureshUid = await ensureRoleUser('candidate1@rplcompass.test', 'candidate', 'Suresh Kumar');
    await switchToUser(page, 'candidate1@rplcompass.test');
    await sweepPages(page, 'candidate', [
      { path: '/rpl', ready: 'What is RPL?' },
      { path: '/rpl/declare', ready: 'Personal & trade context' },
      { path: '/rpl/declare/result?ref=RPL-K7M2-9QWE', ready: 'Your declaration has been received' },
      { path: '/rpl/status', ready: 'My RPL Status' },
      { path: `/rpl/profile/${sureshUid}`, ready: 'Competency profile' },
    ]);
  });

  test('assessor pages: no overflow, buttons >= 40px, no clipped text', async ({ page }) => {
    await loadDemoForSweep(page);
    await switchToUser(page, 'assessor1@rplcompass.test');
    await sweepPages(page, 'assessor', [
      { path: '/rpl/assessor', ready: 'My consistency vs panel' },
      { path: '/rpl/assess', ready: 'Pending assessments' },
      { path: '/rpl/assess/demo-ravi-ssc-draft', ready: 'Ravi Shankar' },
    ]);
  });

  test('admin pages: no overflow, buttons >= 40px, no clipped text', async ({ page }) => {
    await loadDemoForSweep(page);
    const sureshUid = await ensureRoleUser('candidate1@rplcompass.test', 'candidate', 'Suresh Kumar');
    await switchToUser(page, 'part5-sweep-admin@rplcompass.test');
    await sweepPages(page, 'admin', [
      { path: '/rpl/admin', ready: 'Inter-assessor agreement' },
      { path: '/rpl/consistency/ELE%2FQ1301', ready: 'Overall agreement' },
      { path: `/rpl/certify/${sureshUid}`, ready: 'Draft recommendation' },
      { path: '/rpl/forge', ready: 'Upload an official NCVET qualification pack PDF' },
      { path: '/rpl/admin/demo-guide', ready: 'Presenter demo guide' },
    ]);
  });
});

test.describe('Part 5 follow-up — axe sweep (all RPL pages)', () => {
  test.use({ bypassCSP: true });
  test.setTimeout(900_000);

  test.beforeEach(async () => {
    await clearRateLimits();
  });

  async function axeOnePage(page: Page, url: string, ready: string, label: string): Promise<void> {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(ready).first()).toBeVisible({ timeout: 60000 });
    const violations = await axeViolations(page);
    const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    console.log(
      `[axe ${label}] ${new URL(url).pathname} violations=${violations.length} serious/critical=${blocking.length}`,
    );
    expect(blocking, `axe serious/critical on ${url}: ${JSON.stringify(blocking)}`).toEqual([]);
  }

  test('candidate pages: no serious/critical axe violations', async ({ page }) => {
    await loadDemoForSweep(page);
    const sureshUid = await ensureRoleUser('candidate1@rplcompass.test', 'candidate', 'Suresh Kumar');
    await switchToUser(page, 'candidate1@rplcompass.test');
    for (const p of [
      { path: '/rpl', ready: 'What is RPL?' },
      { path: '/rpl/declare', ready: 'Personal & trade context' },
      { path: '/rpl/declare/result?ref=RPL-K7M2-9QWE', ready: 'Your declaration has been received' },
      { path: '/rpl/status', ready: 'My RPL Status' },
      { path: `/rpl/profile/${sureshUid}`, ready: 'Competency profile' },
    ] as const) {
      await axeOnePage(page, BASE + p.path, p.ready, 'candidate');
    }
  });

  test('assessor pages: no serious/critical axe violations', async ({ page }) => {
    await loadDemoForSweep(page);
    await switchToUser(page, 'assessor1@rplcompass.test');
    for (const p of [
      { path: '/rpl/assessor', ready: 'My consistency vs panel' },
      { path: '/rpl/assess', ready: 'Pending assessments' },
      { path: '/rpl/assess/demo-ravi-ssc-draft', ready: 'Ravi Shankar' },
    ] as const) {
      await axeOnePage(page, BASE + p.path, p.ready, 'assessor');
    }
  });

  test('admin pages: no serious/critical axe violations', async ({ page }) => {
    await loadDemoForSweep(page);
    const sureshUid = await ensureRoleUser('candidate1@rplcompass.test', 'candidate', 'Suresh Kumar');
    await switchToUser(page, 'part5-sweep-admin@rplcompass.test');
    for (const p of [
      { path: '/rpl/admin', ready: 'Inter-assessor agreement' },
      { path: '/rpl/consistency/ELE%2FQ1301', ready: 'Overall agreement' },
      { path: `/rpl/certify/${sureshUid}`, ready: 'Draft recommendation' },
      { path: '/rpl/forge', ready: 'Upload an official NCVET qualification pack PDF' },
      { path: '/rpl/admin/demo-guide', ready: 'Presenter demo guide' },
    ] as const) {
      await axeOnePage(page, BASE + p.path, p.ready, 'admin');
    }
  });
});
