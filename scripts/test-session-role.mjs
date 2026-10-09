// Phase A2 tests — role claim sync decision + the client mint handshake.
// Run with: node scripts/test-session-role.mjs
// (fallback if Node type-stripping fails: npx tsx scripts/test-session-role.mjs)
// Node >=22.13 required (package.json engines).

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
  console.log(`DIRECT_TS_IMPORT_FAILED for ${specifier} - run via: npx tsx scripts/test-session-role.mjs`);
  process.exit(1);
}

const roleMod = await loadTs('src/lib/session-role.ts');
const sessionMod = await loadTs('src/lib/client-session.ts');
const { resolveSessionRole, normalizeDocRole } = roleMod;
const { mintSessionCookie } = sessionMod;

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

console.log('\nresolveSessionRole');
check('valid claim + no doc -> mint', resolveSessionRole({ claimRole: 'gladiator' }), { action: 'mint', role: 'gladiator' });
check('executive claim -> mint', resolveSessionRole({ claimRole: 'executive' }), { action: 'mint', role: 'executive' });
check('no claim + doc role -> refresh-claims', resolveSessionRole({ docRole: 'commander' }), { action: 'refresh-claims', role: 'commander' });
check('no claim + no doc -> role-missing', resolveSessionRole({}), { action: 'role-missing', role: null });
check('no claim + Firestore read error -> lookup-failed', resolveSessionRole({ lookupFailed: true }), { action: 'lookup-failed', role: null });
check(
  'legacy claim "teacher" ignored, doc wins -> refresh-claims',
  resolveSessionRole({ claimRole: 'teacher', docRole: 'commander' }),
  { action: 'refresh-claims', role: 'commander' },
);
check(
  'legacy claim "teacher" + no doc -> role-missing',
  resolveSessionRole({ claimRole: 'teacher' }),
  { action: 'role-missing', role: null },
);
check(
  'legacy doc "student" normalized -> refresh-claims/gladiator',
  resolveSessionRole({ docRole: 'student' }),
  { action: 'refresh-claims', role: 'gladiator' },
);
check('non-string claim + doc -> refresh-claims', resolveSessionRole({ claimRole: 123, docRole: 'gladiator' }), {
  action: 'refresh-claims',
  role: 'gladiator',
});
check('gibberish doc role -> role-missing', resolveSessionRole({ docRole: 'wizard' }), { action: 'role-missing', role: null });

console.log('\nnormalizeDocRole');
check('teacher -> commander', normalizeDocRole('teacher'), 'commander');
check('student -> gladiator', normalizeDocRole('GLADIATOR '), 'gladiator');
check('undefined -> null', normalizeDocRole(undefined), null);

// --- client handshake -------------------------------------------------------

function makeFetcher(responses) {
  const calls = [];
  const impl = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.idToken);
    const next = responses[calls.length - 1];
    if (next instanceof Error) throw next;
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body,
    };
  };
  return { impl, calls };
}

function tokenSource(log) {
  return async (forceRefresh) => {
    log.push(forceRefresh);
    return `token-${forceRefresh ? 'refreshed' : 'initial'}`;
  };
}

console.log('\nmintSessionCookie — happy path (role claim already present)');
{
  const { impl, calls } = makeFetcher([{ status: 200, body: { success: true, role: 'gladiator' } }]);
  const tokenLog = [];
  const result = await mintSessionCookie(tokenSource(tokenLog), impl);
  check('ok', result.ok, true);
  check('role', result.role, 'gladiator');
  check('claimSynced', result.claimSynced, false);
  check('server called once', calls.length, 1);
  check('token fetched without forced refresh', tokenLog, [false]);
}

console.log('\nmintSessionCookie — claim sync sequence (server returns claimsRefresh)');
{
  const { impl, calls } = makeFetcher([
    { status: 200, body: { success: true, claimsRefresh: true, role: 'commander' } },
    { status: 200, body: { success: true, role: 'commander' } },
  ]);
  const tokenLog = [];
  const result = await mintSessionCookie(tokenSource(tokenLog), impl);
  check('ok', result.ok, true);
  check('claimSynced', result.claimSynced, true);
  check('role', result.role, 'commander');
  check('server called twice', calls.length, 2);
  check('second call used a FORCED token refresh so the new claim is inside the cookie', tokenLog, [false, true]);
}

console.log('\nmintSessionCookie — loop guard (claimsRefresh twice)');
{
  const { impl, calls } = makeFetcher([
    { status: 200, body: { success: true, claimsRefresh: true } },
    { status: 200, body: { success: true, claimsRefresh: true } },
  ]);
  const result = await mintSessionCookie(tokenSource([]), impl);
  check('ok', result.ok, false);
  check('errorCode', result.errorCode, 'CLAIM_SYNC_LOOP');
  check('exactly two calls (no hammering)', calls.length, 2);
  check('errorMessage is human readable', typeof result.errorMessage === 'string' && result.errorMessage.length > 0, true);
}

console.log('\nmintSessionCookie — server refuses with a specific code');
{
  const { impl } = makeFetcher([
    {
      status: 409,
      body: { error: 'This account has no role yet, so it cannot be given a session.', code: 'ROLE_MISSING' },
    },
  ]);
  const result = await mintSessionCookie(tokenSource([]), impl);
  check('ok', result.ok, false);
  check('status', result.status, 409);
  check('errorCode forwarded', result.errorCode, 'ROLE_MISSING');
  check('errorMessage surfaced verbatim', result.errorMessage, 'This account has no role yet, so it cannot be given a session.');
}

console.log('\nmintSessionCookie — non-JSON 500 still produces a message');
{
  const { impl } = makeFetcher([{ status: 500, body: {} }]);
  const result = await mintSessionCookie(tokenSource([]), impl);
  check('ok', result.ok, false);
  check('errorCode', result.errorCode, 'HTTP_500');
  check('errorMessage mentions status', result.errorMessage.includes('500'), true);
}

console.log('\nmintSessionCookie — network failure is visible, not silent');
{
  const result = await mintSessionCookie(tokenSource([]), async () => {
    throw new Error('Failed to fetch');
  });
  check('ok', result.ok, false);
  check('status', result.status, 0);
  check('errorCode', result.errorCode, 'NETWORK_ERROR');
  check('message includes the cause', result.errorMessage.includes('Failed to fetch'), true);
}

console.log(failures === 0 ? '\nALL SESSION-ROLE TESTS PASSED' : `\n${failures} SESSION-ROLE TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
