// SIH-26242 Part 2 — console-error census for the RPL pages.
//
// Logs in against the LOCAL emulators, visits each RPL page (candidate,
// assessor and admin), and records:
//   - console.error()  (browser console errors)
//   - pageerror        (uncaught exceptions)
//   - failed responses (HTTP status >= 400) per page
//
// Requires: Firebase emulators + a dev server on :3456 (see rpl-testkit).
// Run: npx playwright test tests/rpl-console.spec.ts --reporter=list
import { test, expect, type Page } from '@playwright/test';
import {
  BASE,
  PASSWORD,
  signInViaUi,
  clearRateLimits,
  ensureRoleUser,
} from './support/rpl-testkit';

const AUTH_EMU =
  'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key';

async function restSignIn(email: string): Promise<{ idToken: string; localId: string }> {
  const res = await fetch(AUTH_EMU, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`REST sign-in failed for ${email}: ${res.status}`);
  const body = (await res.json()) as { idToken: string; localId: string };
  return { idToken: body.idToken, localId: body.localId };
}

interface PageReport {
  path: string;
  consoleErrors: string[];
  pageErrors: string[];
  failedResponses: string[];
}

/**
 * Attach listeners, navigate, wait for the app to settle, return everything
 * the page emitted. `settleMs` gives client-side fetches a chance to fail.
 */
async function census(page: Page, path: string, settleMs = 2500): Promise<PageReport> {
  const report: PageReport = { path, consoleErrors: [], pageErrors: [], failedResponses: [] };

  const onConsole = (msg: import('@playwright/test').ConsoleMessage) => {
    if (msg.type() === 'error') report.consoleErrors.push(msg.text());
  };
  const onPageError = (err: Error) => report.pageErrors.push(String(err.message ?? err));
  const onResponse = (res: import('@playwright/test').Response) => {
    if (res.status() >= 400) {
      // Host shown so emulator/third-party noise is obvious in the output.
      let host = '';
      try {
        host = new URL(res.url()).host;
      } catch {
        host = '?';
      }
      report.failedResponses.push(`${res.status()} ${res.request().method()} ${host}${new URL(res.url()).pathname}`);
    }
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);
  try {
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(settleMs);
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
  }
  return report;
}

function logReports(title: string, reports: PageReport[]): void {
  console.log(`\n===== ${title} =====`);
  for (const r of reports) {
    console.log(`-- ${r.path}`);
    console.log(`   console.error : ${r.consoleErrors.length}`);
    r.consoleErrors.forEach((e) => console.log(`     ! ${e}`));
    console.log(`   pageerror     : ${r.pageErrors.length}`);
    r.pageErrors.forEach((e) => console.log(`     ! ${e}`));
    console.log(`   response >=400: ${r.failedResponses.length}`);
    r.failedResponses.forEach((e) => console.log(`     ! ${e}`));
  }
}

/** Drops emulator-origin noise (auth/firestore reached directly by the SDK). */
function appOnly(reports: PageReport[]): PageReport[] {
  return reports.map((r) => ({
    ...r,
    failedResponses: r.failedResponses.filter(
      (x) => !x.includes('127.0.0.1:9099') && !x.includes('127.0.0.1:8080') && !x.includes('127.0.0.1:9000'),
    ),
  }));
}

test.describe('RPL console census (emulator)', () => {
  test.setTimeout(180_000);
  test.beforeEach(async () => {
    await clearRateLimits();
  });

  test('candidate pages', async ({ page }) => {
    const uid = await ensureRoleUser('console-candidate@rplcompass.test', 'candidate', 'Console Candidate');
    await signInViaUi(page, 'console-candidate@rplcompass.test');

    const reports: PageReport[] = [];
    for (const p of ['/rpl', '/rpl/declare', '/rpl/declare/result', '/rpl/status', `/rpl/profile/${uid}`]) {
      reports.push(await census(page, p));
    }
    logReports('CANDIDATE', reports);
    const clean = appOnly(reports);
    const ours = clean.flatMap((r) => [...r.consoleErrors, ...r.pageErrors, ...r.failedResponses]);
    expect(ours, `candidate console errors:\n${ours.join('\n')}`).toEqual([]);
  });

  test('assessor pages', async ({ page }) => {
    await ensureRoleUser('console-assessor@rplcompass.test', 'assessor', 'Console Assessor');
    await signInViaUi(page, 'console-assessor@rplcompass.test');

    const reports: PageReport[] = [];
    for (const p of ['/rpl/assessor', '/rpl/assess']) {
      reports.push(await census(page, p));
    }
    logReports('ASSESSOR', reports);
    const clean = appOnly(reports);
    const ours = clean.flatMap((r) => [...r.consoleErrors, ...r.pageErrors, ...r.failedResponses]);
    expect(ours, `assessor console errors:\n${ours.join('\n')}`).toEqual([]);
  });

  test('admin pages', async ({ page }) => {
    await ensureRoleUser('console-admin@rplcompass.test', 'admin', 'Console Admin');
    // Load demo data so the consistency report has a real computed document.
    const admin = await restSignIn('console-admin@rplcompass.test');
    await fetch(BASE + '/api/rpl/admin/demo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin.idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    await signInViaUi(page, 'console-admin@rplcompass.test');

    const reports: PageReport[] = [];
    for (const p of ['/rpl/admin', '/rpl/consistency/ELE%2FQ1301']) {
      reports.push(await census(page, p));
    }
    logReports('ADMIN', reports);
    const clean = appOnly(reports);
    const ours = clean.flatMap((r) => [...r.consoleErrors, ...r.pageErrors, ...r.failedResponses]);
    expect(ours, `admin console errors:\n${ours.join('\n')}`).toEqual([]);
  });
});
