// SIH-26242 RPL track — Playwright E2E covering the full RPL journey.
// Runs against the local dev server (port 3456) + Firebase emulators.
// NEVER run against production.
import { test, expect, type Page, type Response } from '@playwright/test';

const BASE = 'http://127.0.0.1:3456';
const AUTH_EMU =
  'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key';
const PASSWORD = 'Test123456!';
const INTERPRETATIONS = ['Poor', 'Fair', 'Moderate', 'Substantial', 'Almost perfect'];

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

async function uiLogin(page: Page, email: string) {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  // The app never auto-navigates away from /login: success = session cookie
  // minted via /api/auth/session (the client then carries Firebase auth state).
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/session'), {
      timeout: 30000,
    }),
    page.locator('button[type="submit"]').click(),
  ]);
  if (resp.status() !== 200) throw new Error(`session not established: ${resp.status()}`);
}

// ELE/Q1301 structure (mirrors src/lib/rpl/nsqf-packs.ts) for building API items.
const ELE_UNITS = [
  {
    id: 'ELE/N1301',
    name: 'Installation of electrical systems',
    pc: [
      'Identify electrical tools and materials',
      'Follow safety procedures for electrical work',
      'Install wiring and conduit as per drawing',
      'Test installed electrical circuits',
    ],
    kc: [
      'Electrical safety codes and practices',
      'Basic electrical theory and circuits',
      'Wiring systems and cable types',
      'Tools and equipment used in electrical work',
    ],
  },
  {
    id: 'ELE/N1302',
    name: 'Maintenance and repair of electrical systems',
    pc: [
      'Diagnose faults in electrical systems',
      'Replace defective components safely',
      'Test repaired circuits',
      'Document repair work',
    ],
    kc: [
      'Common electrical faults and troubleshooting',
      'Testing instruments and their usage',
      'Preventive maintenance procedures',
      'Electrical regulations and standards',
    ],
  },
  {
    id: 'ELE/N1303',
    name: 'Testing and measurement of electrical circuits',
    pc: [
      'Use measuring instruments correctly',
      'Interpret readings from meters',
      'Perform continuity and insulation tests',
      'Verify compliance with specifications',
    ],
    kc: [
      'Working principles of measuring instruments',
      'Measurement units and calculations',
      'Testing procedures for circuits',
      'Quality standards and acceptance criteria',
    ],
  },
  {
    id: 'ELE/N1304',
    name: 'Safety and housekeeping',
    pc: [
      'Follow workplace safety rules',
      'Use personal protective equipment',
      'Identify and report hazards',
      'Maintain clean work area',
    ],
    kc: [
      'Electrical hazards and risk prevention',
      'First aid and emergency procedures',
      'Importance of housekeeping',
      'Safety signage and regulations',
    ],
  },
];

const safeId = (s: string) => s.replace(/\//g, '-');

test.describe('RPL end-to-end (emulator)', () => {
  // The app's strict CSP drops emulator origins in production builds
  // (middleware only allows http://127.0.0.1:* in dev). Bypass CSP in the
  // test browser so the client SDK can reach the Auth/Firestore emulators.
  test.use({ bypassCSP: true });
  test.setTimeout(180000);

  test.describe('Suite 1 — Worker self-declaration flow', () => {
    test('gladiator completes the 4-step wizard and reaches the result page', async ({
      page,
    }) => {
      await uiLogin(page, 'glad1@test.local');

      await page.goto(BASE + '/rpl', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('link', { name: 'Start your assessment' })).toBeVisible({
        timeout: 30000,
      });
      await page.getByRole('link', { name: 'Start your assessment' }).click();
      await page.waitForURL('**/rpl/declare', { timeout: 30000 });

      // Step 1 — Personal + trade context.
      await page.locator('#trade').fill('Electrician');
      await page.locator('#years').fill('5');
      await page.locator('#sector').click();
      await page.getByRole('option', { name: 'Construction', exact: true }).click();
      await page.locator('#location').click();
      await page.getByRole('option', { name: 'Maharashtra', exact: true }).click();
      await page.locator('#emp-informal').click();
      await page.getByRole('button', { name: 'Next' }).click();

      // Step 2 — Experience declaration: Electrician pack must match.
      await expect(page.getByText('Electrician - General')).toBeVisible({ timeout: 30000 });
      await page.locator('#ELE\\/Q1301-ELE\\/N1301-can-do').click();
      await page.getByRole('button', { name: 'Next' }).click();

      // Step 3 — Evidence summary.
      const evidenceBox = page.getByLabel('Describe when you did this and where.');
      await expect(evidenceBox).toBeVisible({ timeout: 30000 });
      await evidenceBox.fill(
        'Wired three homes in Pune under contractor Ramesh from 2021 to 2023.',
      );
      await page.getByRole('button', { name: 'Next' }).click();

      // Step 4 — Review + submit.
      await expect(page.getByText(/does not replace/)).toBeVisible({ timeout: 30000 });
      await page.getByRole('button', { name: 'Submit declaration' }).click();
      await page.waitForURL('**/rpl/declare/result?ref=*', { timeout: 60000 });

      // Result page: confirmation + reference code + matched packs + tracker.
      await expect(page.getByText('Your declaration has been received')).toBeVisible({
        timeout: 30000,
      });
      const refCode = (await page.locator('code').first().textContent()) ?? '';
      expect(refCode.trim().length).toBeGreaterThan(0);
      await expect(page.getByText('Electrician - General').first()).toBeVisible();
      await expect(page.getByText('Declaration reviewed')).toBeVisible();
    });
  });

  test.describe('Suite 2 — Assessor scoring', () => {
    test('commander scores, saves draft, reloads, submits', async ({ page }) => {
      const commander = await restSignIn('commander@test.local');
      const glad = await restSignIn('glad1@test.local');
      const assessmentId = `e2e-${Date.now()}`;

      // Build all 32 items; pre-score everything EXCEPT 3 perf criteria in ELE/N1301.
      const items: Record<string, unknown>[] = [];
      for (const u of ELE_UNITS) {
        u.pc.forEach((criterionText, i) => {
          const itemId = `${safeId(u.id)}-p${i}`;
          const preScored = !(u.id === 'ELE/N1301' && i < 3);
          items.push({
            itemId,
            unitId: u.id,
            unitName: u.name,
            kind: 'performance',
            criterionText,
            ...(preScored ? { rubricScore: 3 } : {}),
          });
        });
        u.kc.forEach((criterionText, i) => {
          items.push({
            itemId: `${safeId(u.id)}-k${i}`,
            unitId: u.id,
            unitName: u.name,
            kind: 'knowledge',
            criterionText,
            knowledgePass: true,
          });
        });
      }

      const createRes = await fetch(BASE + '/api/rpl/assess', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${commander.idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assessmentId,
          workerId: glad.localId,
          packId: 'ELE/Q1301',
          items,
          status: 'draft',
          workerName: 'Ruby',
          referenceCode: glad.localId,
        }),
      });
      expect(createRes.ok, `assess POST failed: ${createRes.status}`).toBe(true);

      await uiLogin(page, 'commander@test.local');
      await page.goto(BASE + '/rpl/assessor', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Assessor Home')).toBeVisible({ timeout: 30000 });
      await page.getByRole('link', { name: /Ruby/ }).first().click();
      await page.waitForURL(`**/rpl/assess/${assessmentId}`, { timeout: 30000 });

      // Pre-scored criterion renders checked.
      await expect(
        page.locator('input[name="ELE-N1301-p3"][value="3"]'),
      ).toBeChecked({ timeout: 30000 });

      // Score the 3 remaining criteria with the 1-4 rubric.
      await page.locator('input[name="ELE-N1301-p0"][value="3"]').check();
      await page.locator('input[name="ELE-N1301-p1"][value="2"]').check();
      await page.locator('input[name="ELE-N1301-p2"][value="4"]').check();

      // Save as draft, reload, confirm preservation.
      await page.getByRole('button', { name: 'Save draft' }).click();
      await expect(page.getByText('Draft saved.')).toBeVisible({ timeout: 30000 });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('input[name="ELE-N1301-p0"][value="3"]')).toBeChecked({
        timeout: 30000,
      });
      await expect(page.locator('input[name="ELE-N1301-p1"][value="2"]')).toBeChecked();
      await expect(page.locator('input[name="ELE-N1301-p2"][value="4"]')).toBeChecked();

      // Submit the full assessment.
      await page.getByRole('button', { name: 'Submit assessment' }).click();
      await expect(page.getByText('Assessment submitted.')).toBeVisible({ timeout: 60000 });

      // Appears in the completed list (API check).
      const listRes = await fetch(BASE + '/api/rpl/assess', {
        headers: { Authorization: `Bearer ${commander.idToken}` },
      });
      expect(listRes.ok).toBe(true);
      const listBody = (await listRes.json()) as {
        assessments: { assessmentId?: string; status?: string }[];
      };
      const row = listBody.assessments.find((a) => a.assessmentId === assessmentId);
      expect(row?.status).toBe('submitted');
    });
  });

  test.describe('Suite 3 — Kappa computation', () => {
    test('executive consistency report returns valid kappa + interpretation', async () => {
      const exec = await restSignIn('exec@test.local');
      const res = await fetch(
        `${BASE}/api/rpl/consistency/${encodeURIComponent('ELE/Q1301')}`,
        { headers: { Authorization: `Bearer ${exec.idToken}` } },
      );
      expect(res.ok, `consistency GET failed: ${res.status}`).toBe(true);
      const body = (await res.json()) as { overallKappa?: unknown; interpretation?: unknown };
      expect(typeof body.overallKappa).toBe('number');
      const kappa = body.overallKappa as number;
      expect(kappa).toBeGreaterThanOrEqual(0);
      expect(kappa).toBeLessThanOrEqual(1);
      expect(INTERPRETATIONS).toContain(body.interpretation);
    });
  });

  test.describe('Suite 4 — Access control', () => {
    test('gladiator cannot access /rpl/admin', async ({ page }) => {
      await uiLogin(page, 'glad1@test.local');
      await page.goto(BASE + '/rpl/admin', { waitUntil: 'domcontentloaded' });
      await page.waitForURL('**/gladiator/**', { timeout: 30000 });
    });

    test('commander cannot access /rpl/certify (executive only)', async ({ page }) => {
      await uiLogin(page, 'commander@test.local');
      await page.goto(BASE + '/rpl/certify/probe-worker', { waitUntil: 'domcontentloaded' });
      await page.waitForURL('**/commander/**', { timeout: 30000 });
    });

    test('worker cannot see another worker profile; commander cannot use admin API', async () => {
      const glad = await restSignIn('glad1@test.local');
      const commander = await restSignIn('commander@test.local');
      const other = await fetch(`${BASE}/api/rpl/profile/demo-suresh-kumar`, {
        headers: { Authorization: `Bearer ${glad.idToken}` },
      });
      expect(other.status).toBe(403);
      const adminApi = await fetch(`${BASE}/api/rpl/admin/overview`, {
        headers: { Authorization: `Bearer ${commander.idToken}` },
      });
      expect(adminApi.status).toBe(401);
    });
  });
});
