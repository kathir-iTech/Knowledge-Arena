// Unit tests for mapFirebaseAuthError (RPL Compass login rebuild).
// Run with: node scripts/test-firebase-auth-errors.mjs
// Node >=22.13 required (package.json engines; type-stripping).

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
  console.log(`DIRECT_TS_IMPORT_FAILED for ${specifier}`);
  process.exit(1);
}

const { mapFirebaseAuthError } = await loadTs('src/lib/firebase-auth-errors.ts');

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

function byCode(code, context) {
  return mapFirebaseAuthError({ code, message: 'raw firebase message' }, context);
}

console.log('\nlogin context');
{
  const r = byCode('auth/invalid-credential', 'login');
  check('invalid-credential title', r.title, 'Sign In Failed');
  check('invalid-credential message is human readable', r.message.includes('Incorrect email or password'), true);
  check('invalid-credential visible', r.isSilent, false);
}
{
  const r = byCode('auth/too-many-requests', 'login');
  check('too-many-requests title', r.title, 'Too Many Attempts');
  check('too-many-requests asks the user to wait', r.message.includes('wait'), true);
}

console.log('\nsignup context');
{
  const r = byCode('auth/email-already-in-use', 'signup');
  check('email-already-in-use title', r.title, 'Account Creation Failed');
  check('email-already-in-use points at sign-in', r.message.includes('sign in instead'), true);
}
{
  const r = byCode('auth/weak-password', 'signup');
  check('weak-password asks for stronger password', r.message.includes('stronger password'), true);
}

console.log('\ngoogle context');
{
  const r = byCode('auth/popup-blocked', 'google');
  check('popup-blocked title', r.title, 'Google Sign-In Failed');
  check('popup-blocked uses the RPL Compass blocked copy', r.message, 'Google sign-in was blocked in this browser. Use email and password instead.');
  check('popup-blocked is visible (inline, not silent)', r.isSilent, false);
}
{
  const r = byCode('auth/popup-closed-by-user', 'google');
  check('popup-closed is VISIBLE (RPL Compass inline contract)', r.isSilent, false);
  check('popup-closed uses the blocked copy', r.message, 'Google sign-in was blocked in this browser. Use email and password instead.');
}
{
  const r = byCode('auth/cancelled-popup-request', 'google');
  check('cancelled-popup-request is VISIBLE', r.isSilent, false);
  check('cancelled-popup-request uses the blocked copy', r.message, 'Google sign-in was blocked in this browser. Use email and password instead.');
}
{
  const r = byCode('auth/unauthorized-domain', 'google');
  check('unauthorized-domain is visible', r.isSilent, false);
  check('unauthorized-domain title', r.title, 'Google Sign-In Failed');
  check('unauthorized-domain points at email/password fallback', r.message.includes('email and password'), true);
}

console.log('\nfallback behaviour');
{
  const r = byCode('auth/some-future-code', 'google');
  check('unknown code -> google title', r.title, 'Google Sign-In Failed');
  check('unknown code -> visible fallback message', r.isSilent, false);
  check('unknown code shows the CODE ITSELF', r.message.includes('auth/some-future-code'), true);
}
{
  const r = mapFirebaseAuthError(null, 'login');
  check('null error -> login title', r.title, 'Sign In Failed');
  check('null error -> visible', r.isSilent, false);
}
{
  const r = mapFirebaseAuthError(new Error('boom'), 'signup');
  check('code-less Error -> signup title', r.title, 'Account Creation Failed');
  check('code-less Error -> visible', r.isSilent, false);
}

console.log(failures === 0 ? '\nALL FIREBASE-AUTH-ERROR TESTS PASSED' : `\n${failures} FIREBASE-AUTH-ERROR TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
