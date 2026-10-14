// SIH-26242 Part 3 — loading / empty / error / 401 states across the RPL pages.
//
// Each page's primary API response is FORCED with page.route() so the four
// states are deterministic instead of depending on live emulator data:
//
//   loading       -> the endpoint stalls for 3.5s, so the page's loading state
//   empty         -> 200 with an empty (but well-formed) payload
//   error         -> 500 with no error message (forces the page's fallback)
//   unauthorized  -> 401 { error: 'Unauthorized' } (what every RPL route returns
//                    when the session is gone)
//
// Requires: Firebase emulators + dev server on :3456 (see rpl-testkit).
// Run: npx playwright test tests/rpl-states.spec.ts --reporter=list
import { test, expect, type Page } from '@playwright/test';
import {
  BASE,
  signInViaUi,
  clearRateLimits,
  ensureRoleUser,
} from './support/rpl-testkit';

// ── route mocking ───────────────────────────────────────────────────────────

interface RplMock {
  match: (pathname: string) => boolean;
  status?: number;
  body?: unknown;
  delayMs?: number;
}

/** The mock currently in force. Tests run one-at-a-time (1 worker). */
let active: RplMock | null = null;

/**
 * Intercept only /api/rpl/** . Non-matching paths fall through to the real
 * dev server so auth/session and non-targeted RPL calls keep working.
 */
async function installRplMockRoute(page: Page): Promise<void> {
  active = null;
  await page.route('**/api/rpl/**', async (route) => {
    const m: RplMock | null = active;
    let pathname = '';
    try {
      pathname = new URL(route.request().url()).pathname;
    } catch {
      pathname = '';
    }
    if (!m || !m.match(pathname)) {
      await route.continue().catch(() => {});
      return;
    }
    if (m.delayMs) {
      await new Promise((r) => setTimeout(r, m.delayMs));
    }
    try {
      await route.fulfill({
        status: m.status ?? 200,
        contentType: 'application/json',
        body: JSON.stringify(m.body ?? {}),
      });
    } catch {
      // The page navigated away while the delayed response was pending.
    }
  });
}

// ── state case runner ───────────────────────────────────────────────────────

interface StateSpec {
  path: string;
  match: (pathname: string) => boolean;
  /** Text of the loading state, or undefined to assert a Skeleton instead. */
  loadingText?: string;
  emptyBody?: unknown;
  emptyExpect: string;
  errorExpect: string;
  unauthorizedExpect: string;
  /** Extra wait after the empty-state assertion before moving on. */
  settleMs?: number;
}

async function expectLoading(page: Page, spec: StateSpec): Promise<void> {
  active = { match: spec.match, status: 200, body: {}, delayMs: 3500 };
  await page.goto(BASE + spec.path, { waitUntil: 'domcontentloaded' });
  if (spec.loadingText) {
    await expect(page.getByText(spec.loadingText).first()).toBeVisible({ timeout: 20000 });
  } else {
    await expect(page.locator('.animate-pulse').first()).toBeVisible({ timeout: 20000 });
  }
}

async function expectEmpty(page: Page, spec: StateSpec): Promise<void> {
  active = { match: spec.match, status: 200, body: spec.emptyBody ?? {} };
  await page.goto(BASE + spec.path, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(spec.emptyExpect).first()).toBeVisible({ timeout: 20000 });
}

async function expectError(page: Page, spec: StateSpec): Promise<void> {
  active = { match: spec.match, status: 500, body: {} };
  await page.goto(BASE + spec.path, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(spec.errorExpect).first()).toBeVisible({ timeout: 20000 });
}

async function expectUnauthorized(page: Page, spec: StateSpec): Promise<void> {
  active = { match: spec.match, status: 401, body: { error: 'Unauthorized' } };
  await page.goto(BASE + spec.path, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(spec.unauthorizedExpect).first()).toBeVisible({ timeout: 20000 });
}

async function runAllStates(page: Page, spec: StateSpec): Promise<void> {
  await expectLoading(page, spec);
  await expectEmpty(page, spec);
  await expectError(page, spec);
  await expectUnauthorized(page, spec);
}

/** Sign in a fresh admin account for a single admin-surface spec. */
async function signInAdmin(page: Page, email: string): Promise<void> {
  await ensureRoleUser(email, 'admin', 'State Admin');
  await installRplMockRoute(page);
  await signInViaUi(page, email);
}

const SESSION_EXPIRED = 'Your session has expired. Please sign in again.';

// ── payloads for "empty" (200 but no data yet) ──────────────────────────────

const emptyOverview = {
  totalWorkers: 0,
  assessmentsInProgress: 0,
  assessmentsCompleted: 0,
  averageKappa: null,
  certificationsThisMonth: 0,
  packs: [],
  recentActivity: [],
  assessors: [],
  activeAlerts: [],
};

const emptyConsistencyReport = {
  packId: 'ELE/Q1301',
  overallKappa: null,
  interpretation: 'No data',
  confidence: [0, 0],
  assessorPairs: [],
  perCriterion: [],
  unassistedKappa: null,
  assistedKappa: null,
  assessmentCount: 0,
  computedAt: 1700000000000,
};

const emptyProfileResponse = {
  profile: {
    workerId: 'STATE-WORKER',
    packId: 'ELE/Q1301',
    overallScore: 0,
    unitScores: {},
    knowledgeGaps: [],
    nsqfLevelRecommended: 5,
    generatedAt: 1700000000000,
  },
  recommendation: {
    workerId: 'STATE-WORKER',
    status: 'pending_human_signoff',
    requiredGapTraining: [],
    rationale: '',
  },
  evidence: [],
};

const statusNone = { status: 'none' };

/** Part 2's "no assessment yet" payload — profile null, HTTP 200. */
const profileNull = {
  profile: null,
  recommendation: null,
  evidence: [],
  reason: 'no_assessment',
};

// ── specs ───────────────────────────────────────────────────────────────────

const CANDIDATE: StateSpec[] = [
  {
    path: '/rpl',
    match: (p) => p.startsWith('/api/rpl/status/'),
    emptyBody: statusNone,
    emptyExpect: 'Start your assessment',
    errorExpect: 'We could not check your status. Please try again.',
    unauthorizedExpect: SESSION_EXPIRED,
  },
  {
    path: '/rpl/status',
    match: (p) => p.startsWith('/api/rpl/status/'),
    emptyBody: statusNone,
    emptyExpect: 'No declaration yet',
    errorExpect: 'Could not load status',
    unauthorizedExpect: SESSION_EXPIRED,
  },
  {
    path: '/rpl/declare/result?ref=STATE-REF',
    match: (p) => p.startsWith('/api/rpl/status/'),
    emptyBody: statusNone,
    emptyExpect: 'Declaration not found for this reference code.',
    errorExpect: 'Failed to load your declaration status.',
    unauthorizedExpect: SESSION_EXPIRED,
  },
];

const ASSESSOR: StateSpec[] = [
  {
    path: '/rpl/assessor',
    match: (p) => p === '/api/rpl/assess',
    emptyBody: { assessments: [] },
    emptyExpect: 'Queue is clear. Nothing awaiting scoring.',
    errorExpect: 'Failed to load queue.',
    unauthorizedExpect: SESSION_EXPIRED,
  },
  {
    path: '/rpl/assess',
    match: (p) => p === '/api/rpl/assess',
    loadingText: 'Loading assessments',
    emptyBody: { assessments: [] },
    emptyExpect: 'No assessments in the queue yet.',
    errorExpect: 'Failed to load assessments.',
    unauthorizedExpect: SESSION_EXPIRED,
  },
  {
    path: '/rpl/assess/STATE-ASSESSMENT',
    match: (p) => p.startsWith('/api/rpl/assess/'),
    loadingText: 'Loading assessment',
    emptyBody: { assessment: null },
    emptyExpect: 'Assessment unavailable',
    errorExpect: 'Assessment unavailable',
    unauthorizedExpect: SESSION_EXPIRED,
  },
];

const ADMIN: StateSpec[] = [
  {
    path: '/rpl/admin',
    match: (p) => p === '/api/rpl/admin/overview',
    emptyBody: emptyOverview,
    emptyExpect: 'No packs yet.',
    errorExpect: 'Admin overview unavailable',
    unauthorizedExpect: SESSION_EXPIRED,
  },
  {
    path: '/rpl/consistency/ELE%2FQ1301',
    match: (p) => p.startsWith('/api/rpl/consistency/'),
    loadingText: 'Loading consistency report',
    emptyBody: emptyConsistencyReport,
    emptyExpect: 'No assessor pairs with overlapping items yet.',
    errorExpect: 'Consistency report unavailable',
    unauthorizedExpect: SESSION_EXPIRED,
  },
  {
    path: '/rpl/certify/STATE-WORKER',
    match: (p) => p.startsWith('/api/rpl/profile/'),
    loadingText: 'Loading certification review',
    emptyBody: emptyProfileResponse,
    emptyExpect: 'No unit scores yet.',
    errorExpect: 'Certification review unavailable',
    unauthorizedExpect: SESSION_EXPIRED,
  },
];

// ── tests ───────────────────────────────────────────────────────────────────

test.describe('RPL page states via API mocks (emulator)', () => {
  test.setTimeout(900_000);

  test.beforeEach(async () => {
    await clearRateLimits();
  });

  test('candidate pages: loading/empty/error/401', async ({ page }) => {
    const email = 'state-candidate@rplcompass.test';
    const uid = await ensureRoleUser(email, 'candidate', 'State Candidate');
    await installRplMockRoute(page);
    await signInViaUi(page, email);

    for (const spec of CANDIDATE) {
      console.log(`[candidate] ${spec.path}`);
      await runAllStates(page, spec);
    }

    // The own-profile page is the one Part 2 made a 200-with-profile-null
    // empty state — assert it explicitly here too.
    const profileSpec: StateSpec = {
      path: `/rpl/profile/${uid}`,
      match: (p) => p.startsWith('/api/rpl/profile/'),
      loadingText: 'Loading competency profile',
      emptyBody: profileNull,
      emptyExpect: 'No competency profile yet',
      errorExpect: 'Profile unavailable',
      unauthorizedExpect: SESSION_EXPIRED,
    };
    console.log(`[candidate] ${profileSpec.path}`);
    await runAllStates(page, profileSpec);
  });

  test('assessor pages: loading/empty/error/401', async ({ page }) => {
    const email = 'state-assessor@rplcompass.test';
    await ensureRoleUser(email, 'assessor', 'State Assessor');
    await installRplMockRoute(page);
    await signInViaUi(page, email);

    for (const spec of ASSESSOR) {
      console.log(`[assessor] ${spec.path}`);
      await runAllStates(page, spec);
    }
  });

  test('admin overview: loading/empty/error/401', async ({ page }) => {
    await signInAdmin(page, 'state-admin-overview@rplcompass.test');
    console.log(`[admin] ${ADMIN[0].path}`);
    await runAllStates(page, ADMIN[0]);
  });

  test('consistency report: loading/empty/error/401', async ({ page }) => {
    await signInAdmin(page, 'state-admin-consistency@rplcompass.test');
    console.log(`[admin] ${ADMIN[1].path}`);
    await runAllStates(page, ADMIN[1]);
  });

  test('certify review: loading/empty/error/401', async ({ page }) => {
    await signInAdmin(page, 'state-admin-certify@rplcompass.test');
    console.log(`[admin] ${ADMIN[2].path}`);
    await runAllStates(page, ADMIN[2]);
  });

  test('forge: loading/error/401 on the upload action', async ({ page }) => {
    // /rpl/forge is action-driven (no primary GET), so its states are exercised
    // on the POST /api/rpl/forge call instead of a page load.
    const email = 'state-forge@rplcompass.test';
    await ensureRoleUser(email, 'admin', 'State Forge Admin');
    await installRplMockRoute(page);
    await signInViaUi(page, email);

    const pdf = {
      name: 'qualification-pack.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(64 * 1024, 0x20),
    };
    const matchForge = (p: string) => p === '/api/rpl/forge';

    async function setup(): Promise<void> {
      await page.goto(BASE + '/rpl/forge', { waitUntil: 'domcontentloaded' });
      await page.locator('#rpl-pdf').setInputFiles(pdf);
    }

    // loading: the button switches to "Forging…" while the POST is in flight.
    active = { match: matchForge, status: 200, body: {}, delayMs: 4000 };
    await setup();
    await page.getByRole('button', { name: 'Forge assessment pack' }).click();
    await expect(page.getByText('Forging…').first()).toBeVisible({ timeout: 10000 });

    // error: 500 -> page fallback message.
    active = { match: matchForge, status: 500, body: {} };
    await setup();
    await page.getByRole('button', { name: 'Forge assessment pack' }).click();
    await expect(page.getByText('Forge failed. Please try again.').first()).toBeVisible({
      timeout: 15000,
    });

    // 401: session-expired message.
    active = { match: matchForge, status: 401, body: { error: 'Unauthorized' } };
    await setup();
    await page.getByRole('button', { name: 'Forge assessment pack' }).click();
    await expect(page.getByText(SESSION_EXPIRED).first()).toBeVisible({ timeout: 15000 });
  });

  test('unauthenticated visitor on an RPL page is sent to login', async ({ page }) => {
    // The signed-out (401) path for every /rpl/* page: middleware/session guard
    // must not leave the user staring at an empty or broken page.
    await installRplMockRoute(page);
    await page.goto(BASE + '/rpl/declare', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/login/, { timeout: 60000 });
    expect(page.url()).toContain('/login');
  });
});
