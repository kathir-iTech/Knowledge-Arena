// RPL Compass — session-handshake paths driven through the real UI.
//
// Firebase Auth runs against the LOCAL AUTH EMULATOR (real sign-in), while the
// /api/auth/session endpoint is route-MOCKED to exercise the three client
// handshake paths the server can produce:
//   1. success           -> 200 { success, role }             one POST, role home reached
//   2. claimsRefresh     -> 200 claimsRefresh:true first      two POSTs, forced token refresh
//   3. failure           -> 500 { code, error }               server code shown, client signed out
// Plus ?next= absolute-URL rejection (sign-in must never land on evil.com).
//
// Requires: auth+firestore emulators (npm run emulators:start), a dev server on
// :3456 with NEXT_PUBLIC_FIREBASE_EMULATOR=true. Run:
//   npx playwright test tests/login-session-mock.spec.ts
import { test, expect, type Page, type Route } from '@playwright/test';

const PASSWORD = 'Test123456!';
const SESSION_URL = /\/api\/auth\/session$/;

// The security-sensitive byte spent on a "/rpl" load without a real session
// cookie is a 307 -> /login?next=/rpl loop. Intercept /rpl navigations with a
// stub page so handshake tests can assert the CLIENT's routing decision without
// waiting on middleware (middleware needs a server-minted cookie we are mocking
// away on purpose).
async function stubRoleHome(page: Page, roleHome: string) {
  await page.route('**/*', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/rpl' || pathname.startsWith('/rpl/')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<html><body>stub ${roleHome}</body></html>`,
      });
    }
    return route.continue();
  });
}

type SessionCall = { idToken: string; body: Record<string, unknown> };

async function mockSession(
  page: Page,
  responses: Array<{ status: number; body: Record<string, unknown> }>,
): Promise<SessionCall[]> {
  const calls: SessionCall[] = [];
  await page.route(SESSION_URL, async (route) => {
    const post = route.request();
    const body = post.postDataJSON() as Record<string, unknown>;
    calls.push({ idToken: String(body.idToken ?? ''), body });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    await route.fulfill({ status: next.status, contentType: 'application/json', body: JSON.stringify(next.body) });
  });
  return calls;
}

// Prove the re-mint is a FORCED refresh. A cached getIdToken(false) returns the
// in-memory token and never touches the token-refresh endpoint; only the forced
// getIdToken(true) does. Counting calls to securetoken is therefore a
// deterministic signal (the auth emulator's tokens are second-granular, so
// comparing token bytes is flaky — within one second they can be identical).
async function countForcedRefreshes(page: Page): Promise<{ count: () => number }> {
  let count = 0;
  await page.route(/securetoken\.googleapis\.com\/.*\/token/, async (route) => {
    count += 1;
    await route.continue();
  });
  return { count: () => count };
}

async function gotoLogin(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('button[type="submit"]')).toBeVisible({ timeout: 30000 });
}

// A seeded RPL candidate (scripts/seed-demo.ts). Its Firestore role is
// 'candidate', so the client routes it to the RPL candidate home (/rpl) — the
// same home the mocked server response role reports.
const CANDIDATE = 'candidate@test.local';

async function submitSignIn(page: Page, email: string) {
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
}

test.describe('RPL Compass — mocked /api/auth/session handshake', () => {
  test.beforeEach(() => {
    test.setTimeout(120000);
  });

  test('success: one mint POST, then routes to the role home', async ({ page }) => {
    await stubRoleHome(page, '/rpl');
    const calls = await mockSession(page, [
      { status: 200, body: { success: true, role: 'candidate' } },
    ]);

    await gotoLogin(page);
    await submitSignIn(page, CANDIDATE);

    // ClientLanding (next=null) routes the signed-in candidate to /rpl.
    await expect(page).toHaveURL(/\/rpl(\?|$)/, { timeout: 30000 });
    expect(calls.length, 'exactly one session POST on the happy path').toBe(1);
  });

  test('claimsRefresh: server asks for a token refresh and the client re-mints once (forced)', async ({ page }) => {
    await stubRoleHome(page, '/rpl');
    const refresh = await countForcedRefreshes(page);
    const calls = await mockSession(page, [
      { status: 200, body: { success: true, claimsRefresh: true, role: 'candidate' } },
      { status: 200, body: { success: true, role: 'candidate' } },
    ]);

    await gotoLogin(page);
    await submitSignIn(page, CANDIDATE);

    await expect(page).toHaveURL(/\/rpl(\?|$)/, { timeout: 30000 });
    // One POST for the ask, one after the forced refresh: never a loop.
    expect(calls.length, 'claimsRefresh must trigger exactly one re-mint').toBe(2);
    // A cached getIdToken() never hits the refresh endpoint; only the forced
    // getIdToken(true) does, so this proves the re-mint carried a FRESH token
    // (the new role claim is inside the cookie the server mints).
    expect(refresh.count(), 'the re-mint must be a FORCED token refresh').toBe(1);
  });

  test('failure: server code + message surface, and the client signs out (no half-signed-in state)', async ({ page }) => {
    await mockSession(page, [
      {
        status: 500,
        body: {
          error:
            'Server session could not be created: the service account key does not belong to Firebase project "studio-4092189688-c74a7".',
          code: 'SERVICE_ACCOUNT_PROJECT_MISMATCH',
        },
      },
    ]);

    await gotoLogin(page);
    await submitSignIn(page, CANDIDATE);

    // The server's own code and message must be visible (ClientLayout error
    // surface), not a bare "Failed to create session".
    await expect(page.getByText(/SERVICE_ACCOUNT_PROJECT_MISMATCH/)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/service account key does not belong/i)).toBeVisible();

    // Signed out: reloading /login must NOT auto-advance to a role home.
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    expect(page.url(), 'no role-home redirect after a failed mint => client signed out').toContain('/login');
    await expect(page.locator('button[type="submit"]')).toBeVisible({ timeout: 30000 });
  });

  test('?next=https://evil.com is rejected: sign-in lands on the same-origin role home', async ({ page }) => {
    await stubRoleHome(page, '/rpl');
    await mockSession(page, [{ status: 200, body: { success: true, role: 'candidate' } }]);

    await page.goto('/login?next=https://evil.com', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 30000 });
    await submitSignIn(page, CANDIDATE);

    await expect(page).toHaveURL(/\/rpl(\?|$)/, { timeout: 30000 });
    expect(page.url(), 'must never navigate off-site').not.toContain('evil.com');
    expect(page.url().startsWith('http://localhost'), 'stays on the app origin').toBe(true);
  });
});