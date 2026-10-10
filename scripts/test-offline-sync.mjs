// B1 tests — offline queue replay with a fresh ID token at replay time.
// Run with: npx tsx scripts/test-offline-sync.mjs
// (offline-sync.ts imports ./offline-store extension-less, so plain
// `node` type-stripping cannot resolve it; tsx is already in the tree.)

console.log(`node ${process.version}`);

async function loadTs(specifier) {
  const candidates = [`../../${specifier}`, `../${specifier}`];
  for (const p of candidates) {
    try {
      const mod = await import(p);
      console.log(`TS import worked: ${p} (Node type-stripping)`);
      return mod;
    } catch (err) {
      console.log(`TS import failed: ${p}: ${err?.message ?? err}`);
    }
  }
  console.log(`DIRECT_TS_IMPORT_FAILED for ${specifier} - run via: npx tsx scripts/test-offline-sync.mjs`);
  process.exit(1);
}

const { syncPendingDeclarations, DECLARE_ENDPOINT } = await loadTs('src/lib/rpl/offline-sync.ts');

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}\n       expected ${e}\n       actual   ${a}`);
  }
}

/** In-memory QueueStore mirroring the IndexedDB store semantics. */
function makeStore(records) {
  const data = new Map(records.map((r) => [r.localId, { ...r }]));
  return {
    data,
    async list() {
      return [...data.values()].map((r) => ({ ...r }));
    },
    async remove(id) {
      data.delete(id);
    },
    async mark(id, patch) {
      const rec = data.get(id);
      if (!rec) return;
      if (patch.syncState) rec.syncState = patch.syncState;
      if (typeof patch.lastError === 'string') rec.lastError = patch.lastError;
      if (patch.bumpAttempt) rec.attempts = (rec.attempts ?? 0) + 1;
    },
  };
}

function queuedRecord(n) {
  return {
    localId: `local-${n}`,
    savedAt: 1000 + n,
    workerId: 'worker-1',
    trade: 'Electrician',
    yearsExperience: 8,
    syncState: undefined,
  };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function tokenSource(log) {
  return async (forceRefresh) => {
    log.push(forceRefresh);
    return `token-${forceRefresh ? 'refreshed' : 'initial'}`;
  };
}

// --- 1. happy path: Authorization header attached at replay, record deleted --
console.log('\nsync — attaches a fresh ID token and deletes only on success');
{
  const store = makeStore([queuedRecord(1), queuedRecord(2)]);
  const calls = [];
  const tokenLog = [];
  const result = await syncPendingDeclarations({
    isAuthenticated: true,
    getIdToken: tokenSource(tokenLog),
    store,
    fetchImpl: async (url, init) => {
      calls.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) });
      return jsonResponse(200, { id: 'worker-1' });
    },
  });
  check('endpoint used', calls[0].url, DECLARE_ENDPOINT);
  check('Authorization header present on replay', /^Bearer token-/.test(calls[0].auth), true);
  check('token fetched at replay time (getIdToken called per record)', tokenLog.length, 2);
  check('local fields stripped from body', 'localId' in calls[0].body, false);
  check('local fields stripped from body (savedAt)', 'savedAt' in calls[0].body, false);
  check('both records synced', result.synced, 2);
  check('queue empty afterwards', store.data.size, 0);
}

// --- 2. 401: kept queued with visible 'needs-signin', never dropped ----------
console.log('\nsync — 401 keeps the record with a visible "sign in to sync" state');
{
  const store = makeStore([queuedRecord(1)]);
  const tokenLog = [];
  const result = await syncPendingDeclarations({
    isAuthenticated: true,
    getIdToken: tokenSource(tokenLog),
    store,
    fetchImpl: async () => jsonResponse(401, { error: 'Unauthorized' }),
  });
  check('record NOT dropped', store.data.size, 1);
  const rec = store.data.get('local-1');
  check("syncState === 'needs-signin'", rec.syncState, 'needs-signin');
  check('lastError mentions sign in', /sign in/i.test(rec.lastError), true);
  check('one forced token refresh attempted', tokenLog, [false, true]);
  check('report.needsSignIn', result.needsSignIn, 1);
  check('report.synced', result.synced, 0);
}

// --- 3. server 500: kept queued with visible error --------------------------
console.log('\nsync — server error keeps the record queued with the reason');
{
  const store = makeStore([queuedRecord(1)]);
  const result = await syncPendingDeclarations({
    isAuthenticated: true,
    getIdToken: async () => 't',
    store,
    fetchImpl: async () => jsonResponse(500, { error: 'Internal server error' }),
  });
  check('record NOT dropped', store.data.size, 1);
  const rec = store.data.get('local-1');
  check("syncState === 'error'", rec.syncState, 'error');
  check('reason surfaced', rec.lastError, 'Internal server error');
  check('report.failed', result.failed, 1);
}

// --- 4. network drop: record kept, replay stops -----------------------------
console.log('\nsync — offline keeps records queued and stops the batch');
{
  const store = makeStore([queuedRecord(1), queuedRecord(2)]);
  let fetches = 0;
  const result = await syncPendingDeclarations({
    isAuthenticated: true,
    getIdToken: async () => 't',
    store,
    fetchImpl: async () => {
      fetches += 1;
      throw new TypeError('Failed to fetch');
    },
  });
  check('record 1 kept', store.data.has('local-1'), true);
  check('record 2 kept (batch stopped)', store.data.has('local-2'), true);
  check('only one network attempt', fetches, 1);
  check('attempts bumped on record 1', store.data.get('local-1').attempts, 1);
  check('report.failed', result.failed, 1);
}

// --- 5. signed out: everything marked 'needs-signin', nothing dropped -------
console.log('\nsync — signed out marks all as "sign in to sync" and keeps them');
{
  const store = makeStore([queuedRecord(1), queuedRecord(2)]);
  const result = await syncPendingDeclarations({
    isAuthenticated: false,
    getIdToken: async () => null,
    store,
    fetchImpl: async () => {
      throw new Error('must not fetch while signed out');
    },
  });
  check('no records dropped', store.data.size, 2);
  check(
    "all records syncState === 'needs-signin'",
    [...store.data.values()].every((r) => r.syncState === 'needs-signin'),
    true,
  );
  check('report.needsSignIn', result.needsSignIn, 2);
  check('report.synced', result.synced, 0);
}

// --- 6. rate limit: keeps record and stops replaying ------------------------
console.log('\nsync — 429 keeps the record and stops (no limiter hammering)');
{
  const store = makeStore([queuedRecord(1), queuedRecord(2)]);
  let fetches = 0;
  const result = await syncPendingDeclarations({
    isAuthenticated: true,
    getIdToken: async () => 't',
    store,
    fetchImpl: async () => {
      fetches += 1;
      return jsonResponse(429, { error: 'Declaration limit reached (15/min). Please wait.' });
    },
  });
  check('both records kept', store.data.size, 2);
  check('only one attempt', fetches, 1);
  check('429 reason surfaced on record 1', store.data.get('local-1').lastError.includes('Declaration limit'), true);
  check('record 2 untouched but still queued', store.data.has('local-2'), true);
  check('report.failed', result.failed, 1);
}

// --- 7. empty queue: no token fetch, no network -----------------------------
console.log('\nsync — empty queue does nothing');
{
  const store = makeStore([]);
  let tokenCalls = 0;
  const result = await syncPendingDeclarations({
    isAuthenticated: true,
    getIdToken: async () => {
      tokenCalls += 1;
      return 't';
    },
    store,
    fetchImpl: async () => {
      throw new Error('must not fetch');
    },
  });
  check('report.total', result.total, 0);
  check('no token fetched', tokenCalls, 0);
}

console.log(failures === 0 ? '\nALL OFFLINE-SYNC TESTS PASSED' : `\n${failures} OFFLINE-SYNC TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
