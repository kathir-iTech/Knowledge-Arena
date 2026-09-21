// MINIMAL raw-clock single tap against the ALREADY-SPAWNED suite on :3100.
// Mirrors the stress harness's exact sign flow but sends ONE request with
// clientTime = raw Date.now() (no clock offset applied, ever).
//
// Ground truth: if this ONE raw tap 200s while the harness's 50 all 400
// "timestamp expired", the harness's clientTime is NOT raw Date.now() —
// it's being skew-adjusted somewhere in its mint path.
//
// Requires the emulator suite to be up (auth 9099, firestore 8080) and the
// spawned next on :3100. Sets its own env vars from the current suite.
import { initializeApp as adminInit } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp as clientAppInit } from 'firebase/app';
import { getAuth as getClientAuth, connectAuthEmulator, signInWithCustomToken } from 'firebase/auth';

const PROJECT_ID = 'demo-quorena';
const QUIZ_ID = `raw-tap-${Date.now()}`;
const QUESTION_ID = 'q0';
const SELECTED_OPTION = 1;
const UID = `rawtap-${Date.now()}`;
const ROUTE = 'http://127.0.0.1:3100/api/battle/submit';

function toHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function hmacHex(key, message) {
  const enc = new TextEncoder();
  const keyBuf = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', keyBuf, enc.encode(message));
  return toHex(new Uint8Array(sig));
}
function submissionKey(sessionToken, uid, quizId) {
  return `${quizId}|${uid}|${sessionToken}`;
}
function canonical({ quizId, questionId, selectedOption, nonce, clientTime }) {
  return [quizId, questionId, selectedOption, nonce, Math.floor(clientTime)].join('|');
}

const adminApp = adminInit({ projectId: PROJECT_ID });
const adminAuth = getAdminAuth(adminApp);
const db = getFirestore(adminApp);

// seed arena + participant + token exactly like the harness minter.
await db.collection('quizzes').doc(QUIZ_ID).set({
  status: 'live', battle_mode: 'independent', current_question_index: 0,
  question_count: 1, question_start_at: Date.now(), created_by: 'raw-tap', title: 'Raw Tap',
});
await db.collection('quizzes').doc(QUIZ_ID).collection('questions').doc(QUESTION_ID)
  .set({ sort_index: 0, text: 'raw tap q' });
await db
  .collection('quizzes').doc(QUIZ_ID).collection('participants').doc(UID)
  .set({ status: 'active', session_token: `sess-${UID}`, question_order: [QUESTION_ID], current_question_index: 0, quiz_id: QUIZ_ID, joined_at: Date.now() });
await adminAuth.createUser({ uid: UID });
await adminAuth.setCustomUserClaims(UID, { role: 'gladiator' });
// route seam requires users/{uid} doc + role
await db.collection('users').doc(UID).set({ role: 'gladiator' });

const customToken = await adminAuth.createCustomToken(UIDAdded note:  );
const clientApp = clientAppInit({ projectId: PROJECT_ID, apiKey: 'demo-key' });
const clientAuth = getClientAuth(clientApp);
connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
const cred = await signInWithCustomToken(clientAuth, customTokenForReal);
const idToken = await cred.user.getIdToken();

const nonce = `raw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const clientTime = Date.now();
const sig = await hmacHex(
  submissionKey(`sess-${UID}`, UID, QUIZ_ID),
  canonical({ quizId: QUIZ_ID, questionId: QUESTION_ID, selectedOption: SELECTED_OPTION, nonce, clientTime })
ýu;

const res = await fetch(ROUTE, {
  method: 'POST',
  headers: { 'content-type': 'application/json', Authorization: `Bearer ${idToken}` },
  body: JSON.stringify({ quizId: QUIZ_ID, questionId: QUESTION_ID, selectedOption: SELECTED_OPTION, nonce, clientTime, signature: sig }),
});
const body = await res.json().catch(() => ({}));
console.log('RAW TAP status   :', res.status, JSON.stringify(body));
console.log('clientTime-diff  :', Date.now() - clientTime, 'ms (must be < 5000)');
process.exit(0);
