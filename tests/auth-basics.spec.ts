// SIH-26242 Part 1.7 — the seven named auth/redirect tests (a)–(g).
//
// These pin the behaviour changed in Part 1:
//   (a) sign-up lands on the role home with a "Welcome, <name>" toast
//   (b) duplicate email -> inline message + "Sign in with this email" switch
//   (c) wrong password  -> inline message + "Forgot password?", no takeover
//   (d) sign-out from a result URL lands on /login with NO ?next
//   (e) the next account to sign in lands on ITS OWN home
//   (f) 403 from the status API -> designed access state, never "Forbidden"
//   (g) admin opening the wizard -> redirected home with a toast, no skeletons
//
// Runs against the Firebase emulators + dev server on :3456 (see testkit).
import { test, expect } from '@playwright/test';
import {
  BASE,
  PASSWORD,
  LOCKED_REF,
  uniqueEmail,
  createEmuUser,
  ensureRoleUser,
  ensureLockedWorker,
  clearRateLimits,
  gotoLogin,
  fillSignIn,
  clickSubmit,
  signInViaUi,
  signUpViaUi,
} from './support/rpl-testkit';

const ADMIN_EMAIL = 'admin@test.local';

test.describe('SIH-26242 Part 1.7 — auth & redirect basics', () => {
  test.beforeAll(async () => {
    // (f) needs a worker record that belongs to nobody in these tests; (g)
    // needs a real admin account (claim + user doc, no RPL_*_EMAILS needed).
    await ensureLockedWorker();
    await ensureRoleUser(ADMIN_EMAIL, 'admin', 'Admin Pilot');
  });

  test.beforeEach(async () => {
    test.setTimeout(180_000);
    // The dev-server limits are 5/min per IP for login and signup; these specs
    // sign in several times inside one window on purpose.
    await clearRateLimits();
  });

  test('(a) sign-up lands the new candidate on /rpl with a "Welcome, <name>" toast', async ({ page }) => {
    const name = 'Asha Pilot';
    const email = uniqueEmail('signup');

    await signUpViaUi(page, { name, email, expectPath: '/rpl' });

    // Role home, not any result/ref URL and not /login.
    await expect(page).toHaveURL(`${BASE}/rpl`);
    // Part 1.3: the interactive sign-up says so, by name, on the page.
    await expect(page.getByText(`Welcome, ${name}`).first()).toBeVisible({ timeout: 15_000 });
  });

  test('(b) duplicate email shows an inline message with "Sign in with this email"', async ({ page }) => {
    const email = uniqueEmail('dup');
    await createEmuUser(email); // exists in Auth only -> the sign-up below collides

    await gotoLogin(page);
    await page.getByRole('tab', { name: 'Create account' }).click();
    await page.locator('input[name="name"]').fill('Duplicate Pilot');
    await page.locator('input[name="email"]').fill(email);
    const passwords = page.locator('input[autocomplete="new-password"]');
    await passwords.nth(0).fill(PASSWORD);
    await passwords.nth(1).fill(PASSWORD);
    await clickSubmit(page);

    // Inline, specific message — not a global takeover.
    const alert = page.getByRole('alert').filter({ hasText: 'This email already has an account.' });
    await expect(alert).toBeVisible({ timeout: 60_000 });
    await expect(alert.getByRole('button', { name: 'Sign in with this email' })).toBeVisible();
    await expect(page.getByText('Sign-in failed — please try again')).toHaveCount(0);
    await expect(page.getByText('We could not open your session')).toHaveCount(0);

    // The way out actually works: tab switches, email carries over, caret in
    // the password field.
    await alert.getByRole('button', { name: 'Sign in with this email' }).click();
    await expect(page.getByRole('tab', { name: 'Sign in' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('input[name="email"]')).toHaveValue(email);
    await expect(page.locator('input[autocomplete="current-password"]')).toBeFocused();
  });

  test('(c) wrong password stays inline with a recovery path — never the global takeover', async ({ page }) => {
    const email = uniqueEmail('badpw');
    await createEmuUser(email);

    await gotoLogin(page);
    await fillSignIn(page, email, 'WrongPassword123!');
    await clickSubmit(page);

    const alert = page.getByRole('alert').filter({ hasText: 'Sign-in failed' });
    await expect(alert).toBeVisible({ timeout: 60_000 });
    await expect(alert.getByText('Incorrect email or password')).toBeVisible();
    // Part 1.2: the dead end is replaced by the recovery path.
    await expect(alert.getByRole('button', { name: 'Forgot password?' })).toBeVisible();

    // Part 1.1: no global takeover, no session banner, form stays mounted with
    // the email preserved (passwords are never kept after a failure).
    await expect(page.getByText('Sign-in failed — please try again')).toHaveCount(0);
    await expect(page.getByText('We could not open your session')).toHaveCount(0);
    await expect(page.locator('input[name="email"]')).toHaveValue(email);
    await expect(page.locator('input[type="password"]')).toHaveValue('');
  });

  test('(d) sign-out from a result URL lands on /login with NO ?next', async ({ page }) => {
    const email = uniqueEmail('signout');
    await ensureRoleUser(email, 'candidate', 'Signout Pilot');

    await signInViaUi(page, email);
    await expect(page).toHaveURL(`${BASE}/rpl`);

    // Open somebody else's result page, then sign out from there — this is the
    // exact URL that used to leak into the next account's ?next=.
    await page.goto(`${BASE}/rpl/declare/result?ref=${LOCKED_REF}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Sign out' }).click();

    await page.waitForURL((url) => url.pathname === '/login', { timeout: 60_000 });
    // Part 1.4: no next param — guards must not re-append one while signing out.
    await page.waitForTimeout(2_000);
    const landed = new URL(page.url());
    expect(landed.pathname).toBe('/login');
    expect(landed.searchParams.has('next')).toBe(false);
    // Stored paths are released too, so nothing can resurrect the URL.
    await expect.poll(() => page.evaluate(() => localStorage.getItem('rpl:lastRef'))).toBeNull();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('rpl:next'))).toBeNull();
    // The login form is usable again — no takeover left behind.
    await expect(page.locator('button[type="submit"]').first()).toBeVisible({ timeout: 60_000 });
  });

  test('(e) the second account to sign in lands on its own home, not the previous result', async ({ page }) => {
    const first = uniqueEmail('first');
    const second = uniqueEmail('second');
    await ensureRoleUser(first, 'candidate', 'First Pilot');
    await ensureRoleUser(second, 'candidate', 'Second Pilot');

    // First user sits on somebody else's result page and signs out.
    await signInViaUi(page, first);
    await page.goto(`${BASE}/rpl/declare/result?ref=${LOCKED_REF}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText("This declaration isn't linked to your account")).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL((url) => url.pathname === '/login', { timeout: 60_000 });

    // Second user signs in on the same device.
    await fillSignIn(page, second);
    await clickSubmit(page);
    await page.waitForURL((url) => url.pathname !== '/login', { timeout: 90_000 });

    // Own home, clean URL — never the first user's result page.
    const landed = new URL(page.url());
    expect(landed.pathname).toBe('/rpl');
    expect(landed.search).toBe('');
    await expect(page.getByText("This declaration isn't linked to your account")).toHaveCount(0);
    await expect(page.getByText(`Welcome, Second Pilot`).first()).toBeVisible({ timeout: 15_000 });
  });

  test('(f) a 403 from the status API renders the designed access state, never "Forbidden"', async ({ page }) => {
    const email = uniqueEmail('denied');
    await ensureRoleUser(email, 'candidate', 'Denied Pilot');

    await signInViaUi(page, email);
    await page.goto(`${BASE}/rpl/declare/result?ref=${LOCKED_REF}`, { waitUntil: 'domcontentloaded' });

    // Part 1.5: designed explanation with two ways forward.
    await expect(page.getByText("This declaration isn't linked to your account")).toBeVisible({ timeout: 60_000 });
    const workspace = page.getByRole('link', { name: 'Go to my workspace' });
    const restart = page.getByRole('link', { name: 'Start a new declaration' });
    await expect(workspace).toHaveAttribute('href', '/rpl');
    await expect(restart).toHaveAttribute('href', '/rpl/declare');
    // The raw API string must never surface anywhere on the page.
    await expect(page.getByText('Forbidden')).toHaveCount(0);

    // The primary action really leaves the dead end.
    await workspace.click();
    await page.waitForURL((url) => url.pathname === '/rpl', { timeout: 60_000 });
  });

  test('(g) admin opening the declaration wizard is redirected home with a toast and no stuck skeleton', async ({ page }) => {
    await signInViaUi(page, ADMIN_EMAIL);
    await expect(page).toHaveURL(`${BASE}/rpl/admin`);

    await page.goto(`${BASE}/rpl/declare`, { waitUntil: 'domcontentloaded' });

    // Part 1.5: clean hand-off to the admin's OWN workspace with an
    // explanation, and the page settles into real content (not skeletons).
    await expect(page).toHaveURL(`${BASE}/rpl/admin`, { timeout: 60_000 });
    await expect(page.getByText('Access redirected').first()).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('heading', { name: 'RPL Admin Overview' }).or(page.getByText('Admin overview unavailable')),
    ).toBeVisible({ timeout: 60_000 });
    // The old failure mode: a screenful of loading placeholders that never
    // resolved. Neither the layout spinner nor page skeletons may remain —
    // toHaveCount(0) polls, so "stuck" skeletons (never resolving) fail here.
    await expect(page.locator('[aria-label="Loading"]')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('.animate-pulse')).toHaveCount(0, { timeout: 30_000 });
  });
});
