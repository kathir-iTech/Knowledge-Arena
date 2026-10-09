// Phase A verification — the login chain must actually work end to end.
// Requires: `npm run emulators:start` + a dev server on :3456 started with the
// emulator env (see scripts/dev-verify.sh). Run with:
//   npx playwright test tests/login-chain.spec.ts
import { test, expect, type Page, type Response } from '@playwright/test';

const PASSWORD = 'Test123456!';

async function staffLogin(page: Page, email: string): Promise<Response> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  const [resp] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/auth/session') && r.request().method() === 'POST',
      { timeout: 60000 },
    ),
    page.locator('button[type="submit"]').click(),
  ]);
  return resp;
}

test.describe('Phase A — login chain', () => {
  test.beforeEach(() => {
    // Local dev servers compile on demand; give the chain room without hiding
    // a genuine hang (the client itself has its own 10-30s budgets).
    test.setTimeout(180000);
  });

  test('staff sign-in mints a session cookie that carries the role claim', async ({ page }) => {
    const resp = await staffLogin(page, 'exec@test.local');
    expect(resp.status(), 'POST /api/auth/session must succeed').toBe(200);
    const body = (await resp.json()) as { success?: boolean; role?: string; claimsRefresh?: boolean };
    expect(body.success).toBe(true);
    expect(body.role, 'role must be in the response').toBe('executive');

    await expect(page).toHaveURL(/\/executive\/workspace/, { timeout: 30000 });

    // Server-side proof: middleware reads customClaims.role from the cookie, so
    // an executive hitting a gladiator route must be bounced to their own home.
    await page.goto('/gladiator/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/executive\/workspace/, { timeout: 30000 });
  });

  test('no infinite "Authenticating..." spinner after sign-in', async ({ page }) => {
    await staffLogin(page, 'commander@test.local');
    await expect(page).toHaveURL(/\/commander\/dashboard/, { timeout: 30000 });
    // The loading screen must be gone, not stuck.
    await expect(page.getByText('Authenticating...')).toHaveCount(0, { timeout: 15000 });
    await expect(page.locator('main#main-content')).toBeVisible({ timeout: 15000 });
  });

  test('unauthenticated /rpl -> /login?next=/rpl -> back to /rpl after sign-in', async ({ page }) => {
    await page.goto('/rpl', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/, { timeout: 30000 });
    expect(page.url(), 'destination must be remembered').toContain('next=%2Frpl');

    const resp = await staffLogin(page, 'commander@test.local');
    expect(resp.status()).toBe(200);
    await expect(page).toHaveURL(/\/rpl/, { timeout: 30000 });
    expect(page.url(), 'must not fall back to a portal home').not.toMatch(/\/(executive|commander|gladiator)\//);
  });

  test('session failures are specific, and /api/health/auth reports project ids', async ({ request }) => {
    const health = await request.get('/api/health/auth');
    expect(health.status()).toBe(200);
    const body = (await health.json()) as {
      ok: boolean;
      mode: string;
      clientProjectId: string;
      adminProjectId: string | null;
      match: boolean;
    };
    expect(body.clientProjectId, 'app project id must never change').toBe('studio-4092189688-c74a7');
    expect(body.mode).toBe('emulator');
    expect(body.match, 'emulator mode counts as matched').toBe(true);
    expect(body.ok).toBe(true);

    // A malformed exchange must return a coded error, not a bare 500.
    const bad = await request.post('/api/auth/session', { data: { idToken: 'not-a-token' } });
    expect(bad.status()).toBe(500);
    const badBody = (await bad.json()) as { error?: string; code?: string };
    expect(badBody.code, 'error code must be present').toBeTruthy();
    expect(badBody.error, 'human-readable message must be present').toBeTruthy();
  });
});
