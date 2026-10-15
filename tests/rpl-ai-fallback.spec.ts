// SIH-26242 Part 4 — Gemini quota-fallback UI notices.
//
// These tests force the AI endpoints to report that AI is unavailable and
// assert the page shows a calm, human "score manually / keyword matches"
// notice instead of a raw error code or a silent failure. The underlying
// multi-key rotation is unit-tested in scripts/test-ai-fallback.mjs; here we
// verify the user-visible contract.
//
// Requires: Firebase emulators + dev server on :3456 (see rpl-testkit).
// Run: npx playwright test tests/rpl-ai-fallback.spec.ts --reporter=list
import { test, expect, type Page, type Route } from '@playwright/test';
import {
  BASE,
  signInViaUi,
  clearRateLimits,
  ensureRoleUser,
} from './support/rpl-testkit';

interface FakeResponse {
  status?: number;
  body?: unknown;
}

/**
 * Install a single /api/rpl/** handler. The handler returns a FakeResponse to
 * fulfil, or null to let the request through to the real dev server.
 */
async function installRplRoutes(
  page: Page,
  handler: (pathname: string, route: Route) => FakeResponse | null | Promise<FakeResponse | null>,
): Promise<void> {
  await page.route('**/api/rpl/**', async (route) => {
    let pathname = '';
    try {
      pathname = new URL(route.request().url()).pathname;
    } catch {
      pathname = '';
    }
    const res = await handler(pathname, route);
    if (!res) {
      await route.continue().catch(() => {});
      return;
    }
    await route.fulfill({
      status: res.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(res.body ?? {}),
    });
  });
}

test.describe('RPL AI quota fallbacks (emulator, mocked AI endpoints)', () => {
  test.use({ bypassCSP: true });
  test.setTimeout(900_000);

  test.beforeEach(async () => {
    await clearRateLimits();
  });

  test('matching local-fallback shows an "AI unavailable" note on the declare step', async ({
    page,
  }) => {
    const email = 'aifallback-candidate@rplcompass.test';
    await ensureRoleUser(email, 'candidate', 'AI Fallback Candidate');
    await installRplRoutes(page, (pathname) => {
      if (pathname === '/api/rpl/match') {
        return {
          status: 200,
          body: {
            matches: [
              {
                packTitle: 'Electrician - General',
                matchReason: 'Keyword match (AI unavailable)',
                suggestedUnits: [],
                assessmentQuestions: [],
              },
            ],
            aiUsed: false,
            source: 'local-fallback',
          },
        };
      }
      return null;
    });
    await signInViaUi(page, email);

    await page.goto(BASE + '/rpl/declare', { waitUntil: 'domcontentloaded' });

    // Step 1 — minimal valid personal + trade context, then advance.
    await page.locator('#trade').fill('Electrician');
    await page.locator('#years').fill('5');
    await page.locator('#sector').click();
    await page.getByRole('option', { name: 'Construction', exact: true }).click();
    await page.locator('#location').click();
    await page.getByRole('option', { name: 'Maharashtra', exact: true }).click();
    await page.locator('#emp-informal').click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // Step 2 — trigger AI matching; the mocked response is local-fallback.
    const matchButton = page.getByRole('button', { name: 'Find matching qualifications' });
    await expect(matchButton).toBeVisible({ timeout: 30000 });
    await matchButton.click();

    await expect(
      page.getByText('AI ranking is unavailable right now', { exact: false }).first(),
    ).toBeVisible({ timeout: 20000 });
    // The literal i18n key must never leak to the user.
    await expect(
      page.getByText('aiMatchNoteUnavailable', { exact: false }),
    ).toHaveCount(0);
  });

  test('AI suggestion {available:false} shows a "score manually" notice on the assess page', async ({
    page,
  }) => {
    const email = 'aifallback-assessor@rplcompass.test';
    await ensureRoleUser(email, 'assessor', 'AI Fallback Assessor');
    await installRplRoutes(page, (pathname) => {
      if (pathname === '/api/rpl/assess/suggest') {
        return {
          status: 502,
          body: {
            available: false,
            reason: 'AI temporarily unavailable',
            error: 'AI suggestion is unavailable — score manually.',
            code: 'AI_UNAVAILABLE',
          },
        };
      }
      if (pathname === '/api/rpl/assess/AI-FALLBACK-1') {
        return {
          status: 200,
          body: {
            assessment: {
              id: 'AI-FALLBACK-1',
              workerId: 'AI-FALLBACK-WORKER',
              packId: 'ELE/Q1301',
              status: 'draft',
            },
            items: [],
            worker: null,
            pack: null,
          },
        };
      }
      return null;
    });
    await signInViaUi(page, email);

    await page.goto(BASE + '/rpl/assess/AI-FALLBACK-1', { waitUntil: 'domcontentloaded' });

    const proposeButton = page.getByRole('button', { name: 'AI-propose score' }).first();
    await expect(proposeButton).toBeVisible({ timeout: 30000 });
    await proposeButton.click();

    await expect(
      page.getByText('AI temporarily unavailable — score manually.', { exact: false }).first(),
    ).toBeVisible({ timeout: 20000 });
  });

  test('forge quota outage returns a retry-later error (503) instead of a silent fallback pack', async ({
    page,
  }) => {
    const email = 'aifallback-forge@rplcompass.test';
    await ensureRoleUser(email, 'admin', 'AI Fallback Forge Admin');
    await installRplRoutes(page, (pathname) => {
      if (pathname === '/api/rpl/forge') {
        return {
          status: 503,
          body: {
            error:
              'AI is temporarily unavailable — all Gemini keys are rate-limited. Please try again in a few minutes.',
            code: 'AI_UNAVAILABLE',
          },
        };
      }
      return null;
    });
    await signInViaUi(page, email);

    await page.goto(BASE + '/rpl/forge', { waitUntil: 'domcontentloaded' });
    await page.locator('#rpl-pdf').setInputFiles({
      name: 'qualification-pack.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(64 * 1024, 0x20),
    });
    await page.getByRole('button', { name: 'Forge assessment pack' }).click();

    await expect(
      page.getByText('AI is temporarily unavailable', { exact: false }).first(),
    ).toBeVisible({ timeout: 20000 });
  });
});
