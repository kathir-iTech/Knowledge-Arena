// Shared helpers for the SIH-26242 auth/redirect specs (Part 1.7).
//
// Everything here talks to the LOCAL Firebase emulators and the dev server on
// :3456. NEVER point these at a real project.
import type { Page } from '@playwright/test';

export const BASE = 'http://127.0.0.1:3456';
export const PASSWORD = 'Test123456!';
export const PROJECT_ID = 'demo-quorena';

const AUTH_EMU = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';

/** Unique per run so re-runs never collide with a previous account. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@test.local`;
}

async function authRequest(
  path: 'accounts:signUp' | 'accounts:signInWithPassword',
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${AUTH_EMU}/${path}?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true, ...body }),
  });
}

/** Create the account in the Auth emulator (no app rate limits). */
export async function createEmuUser(email: string, password = PASSWORD): Promise<string> {
  const res = await authRequest('accounts:signUp', { email, password });
  if (res.ok) {
    const body = (await res.json()) as { localId: string };
    return body.localId;
  }
  const text = await res.text();
  if (text.includes('EMAIL_EXISTS')) return emuUid(email, password);
  throw new Error(`createEmuUser(${email}) failed: ${res.status} ${text}`);
}

async function emuUid(email: string, password = PASSWORD): Promise<string> {
  const res = await authRequest('accounts:signInWithPassword', { email, password });
  if (!res.ok) throw new Error(`signIn failed for ${email}: ${res.status}`);
  const body = (await res.json()) as { localId: string };
  return body.localId;
}

type AdminContext = {
  auth: import('firebase-admin/auth').Auth;
  db: import('firebase-admin/firestore').Firestore;
};

let adminPromise: Promise<AdminContext> | null = null;

/**
 * Admin SDK against the emulator. Env must be set BEFORE the module loads,
 * hence the dynamic imports.
 */
async function getAdmin(): Promise<AdminContext> {
  if (!adminPromise) {
    adminPromise = (async () => {
      process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
      process.env.FIREBASE_AUTH_EMULATOR_HOST =
        process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
      const { initializeApp, getApps } = await import('firebase-admin/app');
      const { getAuth } = await import('firebase-admin/auth');
      const { getFirestore } = await import('firebase-admin/firestore');
      if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
      return { auth: getAuth(), db: getFirestore() };
    })();
  }
  return adminPromise;
}

/**
 * Ensure `email` exists with a role. The role is written BOTH as a custom
 * claim (what the edge middleware reads) and as users/{uid}.role (what the
 * client profile reads), so no RPL_*_EMAILS env var is required.
 */
export async function ensureRoleUser(
  email: string,
  role: 'admin' | 'assessor' | 'candidate' | 'executive' | 'commander' | 'gladiator',
  name = 'Test User',
): Promise<string> {
  const { auth, db } = await getAdmin();
  let uid: string;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    try {
      await auth.updateUser(uid, { password: PASSWORD });
    } catch {
      /* keep the existing password */
    }
  } catch {
    const created = await auth.createUser({ email, password: PASSWORD, displayName: name });
    uid = created.uid;
  }
  await auth.setCustomUserClaims(uid, { role });
  await db.collection('users').doc(uid).set({ name, email, role, avatar: '🧑‍🎓' }, { merge: true });
  return uid;
}

/** The reference code used by the "not my declaration" cases (Part 1.5). */
export const LOCKED_REF = 'e2e-locked-worker';

/**
 * A worker record that belongs to nobody signed in during these tests, so a
 * candidate opening /rpl/declare/result?ref=<LOCKED_REF> gets a real 403.
 */
export async function ensureLockedWorker(): Promise<void> {
  const { db } = await getAdmin();
  await db.collection('rpl_workers').doc(LOCKED_REF).set(
    {
      assessmentReferenceCode: LOCKED_REF,
      trade: 'Electrician',
      declaration: { workerId: LOCKED_REF, trade: 'Electrician' },
      declarationSubmittedAt: Date.now(),
    },
    { merge: true },
  );
}

// ── Rate limits ─────────────────────────────────────────────────────────────

/**
 * Wipe the Firestore-backed rate-limit counters (login:ip / login:email /
 * signup:ip). The dev-server limits are 5/min per IP, so a spec that signs in
 * several times inside one 60s window would otherwise trip them. This only
 * clears COUNTERS in the local emulator — it never changes product behaviour.
 */
export async function clearRateLimits(): Promise<void> {
  const { db } = await getAdmin();
  const docs = await db.collection('rate_limits').listDocuments();
  await Promise.all(docs.map((d) => d.delete()));
}

// ── UI flows ────────────────────────────────────────────────────────────────

export async function gotoLogin(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await expectSubmit(page);
}

async function expectSubmit(page: Page): Promise<void> {
  await page.locator('button[type="submit"]').first().waitFor({ state: 'visible', timeout: 60000 });
}

export async function fillSignIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
}

export async function clickSubmit(page: Page): Promise<void> {
  await page.locator('button[type="submit"]').click();
}

/**
 * Sign in through the real form and wait until the session cookie is minted
 * (claims handshake included) AND the app has routed away from /login.
 */
export async function signInViaUi(page: Page, email: string, password = PASSWORD): Promise<void> {
  await gotoLogin(page);
  await fillSignIn(page, email, password);
  await Promise.all([
    page.waitForResponse(
      async (r) => {
        if (!r.url().includes('/api/auth/session') || r.request().method() !== 'POST') return false;
        if (r.status() !== 200) return false;
        const body = (await r.json().catch(() => null)) as { claimsRefresh?: boolean } | null;
        return !!body && body.claimsRefresh !== true;
      },
      { timeout: 90000 },
    ),
    clickSubmit(page),
  ]);
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 90000 });
}

/** Create an account through the real sign-up form; waits for the role home. */
export async function signUpViaUi(
  page: Page,
  opts: { name: string; email: string; password?: string; expectPath?: string },
): Promise<void> {
  await gotoLogin(page);
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.locator('input[name="name"]').fill(opts.name);
  await page.locator('input[name="email"]').fill(opts.email);
  const passwords = page.locator('input[autocomplete="new-password"]');
  await passwords.nth(0).fill(opts.password ?? PASSWORD);
  await passwords.nth(1).fill(opts.password ?? PASSWORD);
  await Promise.all([
    page.waitForResponse(
      async (r) => {
        if (!r.url().includes('/api/auth/session') || r.request().method() !== 'POST') return false;
        if (r.status() !== 200) return false;
        const body = (await r.json().catch(() => null)) as { claimsRefresh?: boolean } | null;
        return !!body && body.claimsRefresh !== true;
      },
      { timeout: 90000 },
    ),
    clickSubmit(page),
  ]);
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 90000 });
  if (opts.expectPath) {
    await page.waitForURL((url) => url.pathname === opts.expectPath, { timeout: 30000 });
  }
}
