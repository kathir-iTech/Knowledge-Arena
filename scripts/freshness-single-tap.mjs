// ONE raw fresh submission through the ACTUAL spawned server (:3100).
// Tears the freshness gate apart: same host, raw Date.now() on BOTH sides,
// 5s tolerance. If this single tap 400s -> the gate is NOT wall-clock-based
// (or the harness/systematically-touches a corrected clock); if it 200s ->
//  the harness itself mints a sub-5s-stale clientTime (then its 0/50 is a
//  harness bug, not an app bug).
import { initializeApp as adminInit } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp as appInit } from 'firebase/app';
import { getAuth as authInit, connectAuthEmulator, signInWithCustomToken } from 'firebase/auth';

const PROJECT_ID = 'demo-quorena';
const QUIZ_ID = `fresh-${Date.now()}`;
const QUESTION_ID = 'q0';
const OPTION = 1;
const UID = `fresh-${Date.now()}`;
const ROUTE = 'http://127.0.0.1:3100/api/battle/submit';

const adminApp = adminInit({ projectId: PROJECT_ID });
const adminAuth = getAdminAuth(adminApp);
const db = getFirestore(adminApp);

// ---- seed the exact dotset the harness seeds --------------------------------
await db.collection('quizzes').doc(QUIZ_ID).set({
  status: 'live', battle_mode: 'independent', current_question_index: 0,
  question_count: 1, current_question_start_at: Date.now(), created_by: 'probe',
  title: 'Freshness Probe', status_live: true,
});
await db.collection('quizzes').doc(QUIZ_ID).collection('questions').doc(QUESTION_ID)
  .set({ sort_index: 0, text: 'probe q' });
const partRef = db.collection('quizzes').doc(QUIZ_ID).collection('participants').doc(UID);
await partRef.set({
  status: 'active', session_token: `sess-${UID}`, question_order: [QUESTION_ID],
  current_question_index: 0, quiz_id: QUIZ_ID, joined_at: Date.now(),
});
await adminAuth.createUser({ uid: UID });
await adminAuth.setCustomUserClaims(UID, { role: 'gladiator' });
await db.collection('users').doc(UID).set({ role: 'gladiator' });
await db.collection('quizzes').doc(QUIZ_ID).collection('questions').doc(QUESTION_ID)
  .set({ sort_index: 0, text: 'q0' });

// ---- mint a real emulator ID token (same path the harness uses) -------------
const customToken = await adminAuth.createCustomToken(UID);
const client = appInit({ projectId: PROJECT_ID, apiKey: 'demo-key' });
const clientAuth = authInit(client);
connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
const cred = await signInWithCustomToken(clientAuth, customToken);
const idToken = await cred.user.getIdToken();

// ---- HMAC sign with RAW Date.now() ------------------------------------------
const toHex = (b) => Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
async function hmacHex(key, message) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(message));
  return toHex(new Uint8Array(s));
}
const nonce = `n-${UID}-${Date.now()}`;
const clientTime = Date.now();
const submissionKey = (sessionToken, uid, quizId) => `quorena:submit:${quizId}:${uid}:${sessionToken}`;
const canonical = ({ quizId, questionId, selectedOption, nonce, clientTime }) =>
  [quizId, questionId, selectedOption, nonce, Math.floor(clientTime)].join('|');
const sig = await hmacHex(
  submissionKey(`sess-${UID}`, UID, QUIZ_ID),
  canonical({ quizId: QUIZ_ID, questionId: QUESTION_ID, selectedOption: OPTION, nonce, clientTime })
);

const body = JSON.stringify({ quizId: QUIZ_ID, questionId: QUESTION_ID, selectedOption: OPTION, nonce, clientTime, signature: sig });
const res = await fetch(ROUTE, {
  method: 'POST',
  headers: { 'content-type': 'application/json', Authorization: `Bearer ${idToken}` },
  body,
});
let rbody = {};
try { rbody = await res.json(); } catch {}
console.log('clientTime      :', clientTime);
console.log('now - clientTime:', Date.now() - clientTime, 'ms  (|x|<=5000 must hold)');
console.log('SINGLE FRESH TAP:', res.status, JSON.stringify(rbody));
process.exit(0);
