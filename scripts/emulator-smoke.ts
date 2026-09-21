// Emulator binding smoke test.
//
// Run with (Windows):
//   cross-env FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npx tsx scripts/emulator-smoke.ts
//
// Validates the environment-binding sweep in src/lib/firebase-admin.ts:
//   - getAdminDb() talks to the LOCAL Firestore emulator (not prod)
//   - getAdminAuth() talks to the LOCAL Auth emulator
// Read-only; does not write any documents.

import { getAdminDb, getAdminAuth } from '../src/lib/firebase-admin';

async function main() {
  console.log('FIRESTORE_EMULATOR_HOST =', process.env.FIRESTORE_EMULATOR_HOST ?? '(unset)');
  console.log('FIREBASE_AUTH_EMULATOR_HOST =', process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '(unset)');

  const db = getAdminDb();
  const auth = getAdminAuth();

  const [participants, quizzes, submissions] = await Promise.all([
    db.collection('participants').limit(1).get(),
    db.collection('quizzes').limit(1).get(),
    db.collection('submissions').limit(1).get(),
  ]);
  console.log('firestore emulator probe: participants=%d quizzes=%d submissions=%d', participants.size, quizzes.size, submissions.size);

  const authProbe = await auth
    .getUser('definitely-missing-user')
    .then((u) => `unexpected-user:${u.uid}`)
    .catch((e: { code?: string }) => e?.code ?? 'unknown-error');
  console.log('auth emulator probe: getUser(missing) ->', authProbe);
  if (authProbe !== 'auth/user-not-found') {
    throw new Error(`Auth emulator binding failed: expected auth/user-not-found, got "${authProbe}"`);
  }

  console.log('EMULATOR BINDING OK: admin Firestore + Auth are pointed at the local sandbox.');
}

main().catch((e) => {
  console.error('EMULATOR BINDING FAILED:', e?.message ?? e);
  process.exit(1);
});