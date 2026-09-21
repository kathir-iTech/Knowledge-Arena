// SINGLE raw-clock tap through the live spawned :3100 server.
import { initializeApp as adminInit } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp as clientInit } from 'firebase/app';
import { getAuth as getClientAuth, connectAuthEmulator, signInWithCustomToken } from 'firebase/auth';
import {
  canonicalSubmissionPayload,
  hmacHex,
  submissionKey,
} from '../src/lib/submit-answer';
import { SUBMIT_CLOCK_SKEW_TOLERANCE_MS } from '../src/lib/constants';

const PROJECT_ID = 'demo-quorena';
const QUIZ_ID = `tap-${Date.now()}`;
const QUESTION_ID = 'q0';
const SELECTED_OPTION = 1;
const UID = `tap-${Date.now()}`;
const ROUTE_URL = 'http://127.0.0.1:3100/api/battle/submit';

const app = adminInit({ projectId: PROJECT_ID });
const adminAuth = getAdminAuth(app);
const db = getFirestore(app);

await db.collection('quizzes').doc(QUIZ_ID).set({
  status: 'live',
  battle_mode: 'independent',
  current_question_index: 0,
  question_count: 1,
  question_start_at: Date.now(),
  created_by: 'tap',
  title: 'tap',
});
await db
  .collection('quizzes').doc(QUIZ_ID).collection('questions').doc(QUESTION_ID)
  .set({ sort_index: 0, text: 'tap q' });
const SESSION_TOKEN = `sess-${UID}`;
await db
  .collection('quizzes').doc(QUIZ_ID).collection('participants').doc(UID)
  .set({
    status: 'active',
    session_token: SESSION_TOKEN,
    question_order: [QUESTION_ID],
    current_question_index: 0,
    quiz_id: QUIZ_ID,
    joined_at: Date.now(),
  });
await adminAuth.createUser({ uid: UID });
await adminAuth.setCustomUserClaims(UID, { role: 'gladiator' });
await db.collection('users').doc(UID).set({ role: 'gladiator' });

// Mint a real emulator ID token.
const customToken = await adminAuth.createCustomToken(UID);
const clientApp = clientInit({ projectId: PROJECT_ID, apiKey: 'demo-key' });
const clientAuth = getClientAuth(clientApp);
connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
const cred = await signInWithCustomToken(clientAuth, customToken);
const idToken = await cred.user.getIdToken();

// Sign with RAW Date.now() — identical to the stress harness fixture.
const nonce = `n-${UID}-${Date.now()}`;
const clientTime = Date.now();
const payload = canonicalSubmissionPayload({
  quizId: QUIZ_ID,
  questionId: QUESTION_ID,
  selectedOption: SELECTED_OPTION,
  nonce,
  clientTime,
});
const sig = await hmacHex(submissionKey(SESSION_TOKEN, UID, QUIZ_ID), payload);

console.log('clientTime (raw)      :', clientTime);
console.log('Date.now() at sign    :', Date.now());
console.log('server tolerance      :', SUBMIT_CLOCK_SKEW_TOLERANCE_MS, 'ms');
console.log('now - clientTime @sign:', Date.now() - clientTime, 'ms');

const res = await fetch(ROUTE_URL, {
  method: 'POST',
  headers: { 'content-type': 'application/json', Authorization: `Bearer ${idToken}` },
  body: JSON.stringify({
    quizId: QUIZ_ID,
    questionId: QUESTION_ID,
    selectedOption: SELECTED_OPTION,
    nonce,
    clientTime,
    signature: sig,
  }),
});
const body = await res.json().catch(() => ({}));
console.log('RESPONSE:', res.status, JSON.stringify(body));
console.log('now - clientTime @resp:', Date.now() - clientTime, 'ms');
process.exit(0);
