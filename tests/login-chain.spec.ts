// Phase A verification — the login chain must actually work end to end.
// Requires: `npm run emulators:start` + a dev server on :3456 started with the
// emulator env (see scripts/dev-verify.sh). Run with:
//   npx playwright test tests/login-chain.spec.ts
import { test, expect, type Page, type Response } from '@playwright/test';

const PASSWORD = 'Test123456!';

interface SessionResponseBody {
  success?: boolean;
  role?: string;
  claimsRefresh?: boolean;
}

interface SessionResult {
  response: Response;
  body: SessionResponseBody | null;
}

// Register the response listener BEFORE clicking, and read the JSON body as
// soon as the response arrives. Reading it after the click (once ClientLayout
// has already navigated to the post-login destination) throws "Response body
// is not available for a response that was navigated away from".
function awaitSession(page: Page): Promise<SessionResult> {
  return page
    .waitForResponse(
      (r) => r.url().includes('/api/auth/session') && r.request().method() === 'POST',
      { timeout: 60000 },
    )
    .then(async (response) => ({
      response,
      body: (await response.json().catch(() => null)) as SessionResponseBody | null,
    }));
}

// `next` is passed through to /login?next=… so the test does not clobber a
// destination the server already put in the URL (bare page.goto('/login')).
async function staffLogin(page: Page, email: string, next?: string): Promise<SessionResult> {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login', {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  const session = awaitSession(page);
  await page.locator('button[type="submit"]').click();
  return session;
}

test.describe('Phase A — login chain', () => {
  test.beforeEach(() => {
    // Local dev servers compile on demand; give the chain room without hiding
    // a genuine hang (the client itself has its own 10-30s budgets).
    test.setTimeout(180000);
  });

  test('staff sign-in mints a session cookie that carries the role claim', async ({ page }) => {
    const { response: resp, body } = await staffLogin(page, 'exec@test.local');
    expect(resp.status(), 'POST /api/auth/session must succeed').toBe(200);
    expect(body?.success).toBe(true);
    expect(body?.role, 'role must be in the response').toBe('executive');

    await expect(page).toHaveURL(/\/executive\/workspace/, { timeout: 30000 });

    // Server-side proof: middleware reads the token's top-level role claim, so
    // an executive hitting a gladiator route must be bounced to their own home.
    await page.goto('/gladiator/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/executive\/workspace/, { timeout: 30000 });
  });

  test('no infinite "Authenticating..." spinner after sign-in', async ({ page }) => {
    await staffLogin(page, 'commander@test.local');
    await expect(page).toHaveURL(/\/commander\/dashboard/, { timeout: 30000 });
    // The loading screen must be gone, not stuck.
    await expect(page.getByText('Authenticating...')).toHaveCount(0, { timeout: 15000 });
    // Two elements can briefly exist because the commander/executive/gladiator
    // layouts render their own <main id="main-content"> (pre-existing duplicate
    // id, outside this change) — assert the first resolved main is visible.
    await expect(page.locator('main#main-content').first()).toBeVisible({ timeout: 15000 });
  });

  test('unauthenticated /rpl -> /login?next=/rpl -> back to /rpl after sign-in', async ({ page }) => {
    await page.goto('/rpl', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/, { timeout: 30000 });
    expect(page.url(), 'destination must be remembered').toContain('next=%2Frpl');

    const { response: resp } = await staffLogin(page, 'commander@test.local', '/rpl');
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

test.describe('RPL Compass — signup, sign-out, env roles, wrong-role redirect', () => {
  test.beforeEach(() => {
    test.setTimeout(240000);
  });

  async function signUp(page: Page, email: string, name: string) {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Create account' }).click();
    await page.locator('input[name="name"]').fill(name);
    await page.locator('input[name="email"]').fill(email);
    const pw = page.locator('input[autocomplete="new-password"]');
    await pw.nth(0).fill('Test123456!');
    await pw.nth(1).fill('Test123456!');
    const session = awaitSession(page);
    await page.locator('button[type="submit"]').click();
    return session;
  }

  test('create account lands on /rpl as candidate, sign-out returns to /login', async ({ page }) => {
    const email = `cand-${Date.now()}@test.local`;
    const { response: resp, body } = await signUp(page, email, 'Candidate New');
    expect(resp.status(), 'POST /api/auth/session must succeed').toBe(200);
    expect(body?.success).toBe(true);
    expect(body?.role, 'signup mints the candidate role').toBe('candidate');

    await expect(page).toHaveURL(/\/rpl$/, { timeout: 30000 });

    // The RPL layout now carries a sign-out control.
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 30000 });
  });

  test('candidate visiting /rpl/admin is redirected home with a visible message', async ({ page }) => {
    const email = `cand-${Date.now()}-b@test.local`;
    await signUp(page, email, 'Candidate Two');
    await expect(page).toHaveURL(/\/rpl$/, { timeout: 30000 });

    await page.goto('/rpl/admin', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/rpl$/, { timeout: 30000 });
    expect(page.url(), 'must not bounce through /login').not.toContain('/login');
    // The toast renders the title twice (visible toast + assertive live region).
    await expect(page.getByText('Access redirected').first()).toBeVisible({ timeout: 15000 });
  });

  test('gladiator visiting /rpl/assessor is redirected to their own portal home', async ({ page }) => {
    await staffLogin(page, 'glad1@test.local');
    await page.goto('/rpl/assessor', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/gladiator\/dashboard/, { timeout: 30000 });
    await expect(page.getByText('Access redirected').first()).toBeVisible({ timeout: 15000 });
  });

  test('RPL_ASSESSOR_EMAILS promotes a seeded user to assessor at session mint', async ({ page }) => {
    // glad2@test.local is in RPL_ASSESSOR_EMAILS for this dev server; the env
    // role overrides the gladiator doc and the claims handshake syncs it.
    const { response: resp, body } = await staffLogin(page, 'glad2@test.local');
    expect(resp.status()).toBe(200);
    expect(body?.success).toBe(true);
    expect(body?.role, 'env-assigned assessor role must win over the doc').toBe('assessor');
    await expect(page).toHaveURL(/\/rpl\/assessor/, { timeout: 30000 });
  });
});
