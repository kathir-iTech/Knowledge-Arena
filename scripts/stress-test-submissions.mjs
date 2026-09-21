// Concurrency surge test for the /api/battle/submit transaction block.
//
// Self-contained local harness (emulator-only, zero prod risk):
//   1. Seeds a fresh "live" arena via the Admin SDK on the emulator.
//   2. Creates N mock gladiator users (role claim -> custom token -> ID token)
//      ALL on the local Auth emulator.
//   3. Spawns a throwaway `next dev` on :3100 bound to the emulator.
//   4. Fires N concurrent signed /api/battle/submit requests (real endpoint,
//      real HMAC, real db.runTransaction) and asserts the one-shot invariants:
//        - every player gets ok:true, alreadySubmitted:false (first tap)
//        - exactly one submission doc per player (no overwrite / no duplicate)
//        - a replayed payload is a graceful no-op (alreadySubmitted:true)
//        - a stale-question payload is rejected (409 wrong-question)
//
// Usage (Windows cmd):  node scripts\stress-test-submissions.mjs [N]
// Env required: FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST.
// Also available as:  npm run stress:submissions

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp as adminInit } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { initializeApp as clientInit } from 'firebase/app';
import { getAuth as getClientAuth, connectAuthEmulator, signInWithCustomToken } from 'firebase/auth';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ---- environment contract -------------------------------------------------
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FIRESTORE_HOST || !AUTH_HOST) {
  console.error('FATAL: set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST first.');
  process.exit(2);
}
const PROJECT_ID = 'demo-quorena';
const N = Math.max(1, Number(process.argv[2]) || 50);
const RUN_ID = Date.now();
const QUIZ_ID = `stress-arena-${RUN_ID}`;
const QUESTION_ID = 'q0';
const SERVER_BASE = 'http://127.0.0.1:3100';
const ROUTE = `${SERVER_BASE}/api/battle/submit`;
const SELECTED_OPTION = 1;

const adminApp = adminInit({ projectId: PROJECT_ID });
const db = getFirestore(adminApp);
const adminAuth = getAdminAuth(adminApp);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(1200);
  }
  throw new Error(`Next dev server did not become ready at ${url}`);
}

// ---- HMAC signing (mirrors src/lib/submit-answer.ts exactly) --------------
async function hmacHex(key, message) {
  const enc = new TextEncoder();
  const keyBuf = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', keyBuf, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const submissionKey = (sessionToken, userId, quizId) => `quorena:submit:${quizId}:${userId}:${sessionToken}`;
const canonical = ({ quizId, questionId, selectedOption, nonce, clientTime }) =>
  [quizId, questionId, selectedOption, nonce, Math.floor(clientTime)].join('|');

// ---- 1. seed the arena ----------------------------------------------------
const quizRef = db.collection('quizzes').doc(QUIZ_ID);
const questionRef = db.collection('quizzes').doc(QUIZ_ID).collection('questions').doc(QUESTION_ID);
await quizRef.set({
  status: 'live',
  battle_mode: 'independent',
  current_question_index: 0,
  question_count: 1,
  question_start_at: Date.now(),
  created_by: 'stress-commander',
  title: 'Stress Arena',
});
await questionRef.set({ sort_index: 0, text: 'stress question' });

// ---- 2. mock gladiators: user + participant + token ------------------------
const uids = Array.from({ length: N }, (_, i) => `stress-player-${RUN_ID}-${i}`);

for (const uid of uids) {
  const pRef = db.collection('quizzes').doc(QUIZ_ID).collection('participants').doc(uid);
  await Promise.all([
    adminAuth.createUser({ uid }),
    pRef.set({
      status: 'active',
      session_token: `sess-${uid}`,
      question_order: [QUESTION_ID],
      current_question_index: 0,
      quiz_id: QUIZ_ID,
      joined_at: Date.now(),
    }),
  ]);
}
for (const uid of uids) {
  await adminAuth.setCustomUserClaims(uid, { role: 'gladiator' });
  // The route's gate (verifyFirebaseTokenWithAnyRole) reads users/{uid} and
  // 401s when the doc is absent — custom claims alone do NOT satisfy it.
  // Mirror the real auth flow: create the peers/users Firestore doc the route
  // demands, holding the role the route branches on.
  await db.collection('users').doc(uid).set({ role: 'gladiator' });
}

// Client sign-in against the auth emulator to mint valid ID tokens.
const client = clientInit({ projectId: PROJECT_ID, apiKey: 'demo-key' });
const clientAuth = getClientAuth(client);
connectAuthEmulator(clientAuth, `http://127.0.0.1:9099`, { disableWarnings: true });
const idTokens = {};
for (const uid of uids) {
  const customToken = await adminAuth.createCustomToken(uid);
  const cred = await signInWithCustomToken(clientAuth, customToken);
  idTokens[uid] = await cred.user.getIdToken();
}

// ---- 3. throwaway Next instance bound to the emulator ----------------------
const next = spawn(process.execPath, [join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '-p', '3100'], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: '3100',
    FIRESTORE_EMULATOR_HOST: FIRESTORE_HOST,
    FIREBASE_AUTH_EMULATOR_HOST: AUTH_HOST,
    NEXT_PUBLIC_FIREBASE_EMULATOR: 'true',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let nextLog = '';
next.stdout.on('data', (d) => { nextLog += d.toString(); });
next.stderr.on('data', (d) => { nextLog += d.toString(); });
process.on('exit', () => { try { next.kill(); } catch {} });

console.log(`seeded arena ${QUIZ_ID} with ${N} gladiators; starting next dev on :3100`);
await waitForServer(SERVER_BASE);

// Warm the submit route (forces Next dev to compile it) BEFORE any clientTime
// is minted. Without this, the first real request pays cold-compile latency
// while all 50 timestamps age past the 5s freshness window — a test artifact,
// not production behavior (prod runs precompiled `next start`, warm).
try {
  await fetch(ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  console.log('route warmed (cold-compile cost absorbed before minting)');
} catch { /* warmup best-effort; the surge is the real test */ }

// ---- 4. concurrent surge ---------------------------------------------------
console.log(`firing ${N} concurrent signed submissions...`);
const started = Date.now();
const results = await Promise.all(
  uids.map(async (uid) => {
    const nonce = `n-${uid}-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const clientTime = Date.now();
    const sig = await hmacHex(
      submissionKey(`sess-${uid}`, uid, QUIZ_ID),
      canonical({ quizId: QUIZ_ID, questionId: QUESTION_ID, selectedOption: SELECTED_OPTION, nonce, clientTime })
    );
    const res = await fetch(ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${idTokens[uid]}` },
      body: JSON.stringify({ quizId: QUIZ_ID, questionId: QUESTION_ID, selectedOption: SELECTED_OPTION, nonce, clientTime, signature: sig }),
    });
    let body = {};
    try { body = await res.json(); } catch {}
    return { uid, status: res.status, ...body };
  })
);
const elapsedMs = Date.now() - started;

// ---- 5. assertions ---------------------------------------------------------
const okFirst = results.filter((r) => r.ok === true && r.alreadySubmitted === false);
const errors = results.filter((r) => r.ok !== true);
const subDocs = await db
  .collection('quizzes').doc(QUIZ_ID).collection('questions').doc(QUESTION_ID)
  .collection('submissions').get();
const subCount = subDocs.size;

// replay probe: identical payload must be a graceful idempotent no-op.
const replayUid = uids[0];
const replayNonce = `replay-${Date.now()}`;
const replayTime = Date.now();
const replaySig = await hmacHex(
  submissionKey(`sess-${replayUid}`, replayUid, QUIZ_ID),
  canonical({ quizId: QUIZ_ID, questionId: QUESTION_ID, selectedOption: SELECTED_OPTION, nonce: replayNonce, clientTime: replayTime })
);
const replayRes = await fetch(ROUTE, {
  method: 'POST',
  headers: { 'content-type': 'application/json', Authorization: `Bearer ${idTokens[replayUid]}` },
  body: JSON.stringify({ quizId: QUIZ_ID, questionId: QUESTION_ID, selectedOption: SELECTED_OPTION, nonce: replayNonce, clientTime: replayTime, signature: replaySig }),
});
const replayBody = await replayRes.json();

// wrong-question probe: nonexistent question in the per-player order => 409.
const wrongUid = uids[1];
const wrongNonce = `wrong-${Date.now()}`;
const wrongTime = Date.now();
const wrongSig = await hmacHex(
  submissionKey(`sess-${wrongUid}`, wrongUid, QUIZ_ID),
  canonical({ quizId: QUIZ_ID, questionId: 'q-ghost', selectedOption: SELECTED_OPTION, nonce: wrongNonce, clientTime: wrongTime })
);
const wrongRes = await fetch(ROUTE, {
  method: 'POST',
  headers: { 'content-type': 'application/json', Authorization: `Bearer ${idTokens[wrongUid]}` },
  body: JSON.stringify({ quizId: QUIZ_ID, questionId: 'q-ghost', selectedOption: SELECTED_OPTION, nonce: wrongNonce, clientTime: wrongTime, signature: wrongSig }),
});
const wrongBody = await wrongRes.json();

const success = okFirst.length === N && errors.length === 0 && subCount === N;

console.log('--------------------------------------------------');
console.log(`elapsed: ${elapsedMs}ms for ${N} concurrent submits`);
console.log(`first-tap ok            : ${okFirst.length}/${N}`);
console.log(`errors / non-ok responses: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log(`  - ${e.status} ${JSON.stringify(e)}`));
console.log(`submission docs written : ${subCount} (expected ${N})`);
console.log(`replay probe            : HTTP ${replayRes.status} -> ${JSON.stringify(replayBody)} (expected alreadySubmitted:true)`);
console.log(`wrong-question probe    : HTTP ${wrongRes.status} -> ${JSON.stringify(wrongBody)} (expected 409)`);
console.log(success ? 'SURGE PASS' : 'SURGE FAIL');
next.kill();

if (!success || replayBody.alreadySubmitted !== true || wrongRes.status !== 409) {
  process.exitCode = 1;
}
if (success) {
  mkdirSync(join(ROOT, '.firebase-emulator-data'), { recursive: true });
}