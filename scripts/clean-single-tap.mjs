// ONE clean submission through :3100 with raw Date.now() on both sides.
// If this single raw tap returns 200, the harness itself is skewing clientTime.
// If it returns 400 "timestamp expired", the route seam is genuinely offended
// even with raw same-machine clocks — which would be impossible for
// |Date.now() - raw Date.now()| <= 5000, so we'd know we misread the predicate.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp as initClient } from 'firebase/app';
import { getAuth as authClient, connectAuthEmulator, signInWithCustomToken } from 'firebase/auth';

const PROJECT = 'demo-quorena';
const UID = `tap-${Date.now()}`;
const QUIZ = `atap-${Date.now()}`;
const QUESTION = 'q0';

const admin = initializeApp({ projectId: PROJECT });
const aAuth = getAuth(admin);
const db = getFirestore(admin);

await db.collection('quizzes').doc(QUIZ).set({
  status: 'live', battle_mode: 'independent', current_question_index: 0,
  question_count: 1, question_start_at: Date.now(), created_by: 'tap', title: 'tap',
});
await db.collection('quizzes').doc(QUIZ).collection('questions').doc(QUESTION).set({ sort_index: 0, text: 'tap q' });
await db.collection('quizzes').doc(QUIZ).collection('participants').doc(UID).set({
  status: 'active', session_token: `sess-${UID}`, question_order: [QUESTION],
  current_question_index: 0, quiz_id: QUIZ, joined_at: Date.now(),
});
await aAuth.createUser({ uid: UID });
await aAuth.setCustomUserClaims(UID, { role: 'gladiator' });
await db.collection('users').doc(UID).set({ role: 'gladiator' });

const customToken = await aAuth.createCustomToken(UID);
const clientApp = initClient({ projectId: PROJECT, apiKey: 'demo-key' });
const clientAuth = authClient(clientApp);
connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
const cred = await signInWithCustomToken(clientAuth, customToken);
const idToken = await cred.user.getIdToken();

function toHex(b) { return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join(''); }
async function hmacHex(key, msg) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
  return toHex(new Uint8Array(s));
}
const submissionKey = (st, uid, quizId) => `quorena:submit:${quizId}:${uid}:${st}`hor
const canonical = ({ quizId, questionId, selectedOption, nonce, clientTime }) =>
  [quizId, questionId, selectedOption, nonce, Math.floor(clientTime)].join('|');

const nonce = `n-${UID}-${Date.now()}`;
const clientTime = Date.now();
const sig = await hmacHex(
  submissionKey(`sess-${UID}`, UID, QUIZ),
  canonical({ quizId: QUIZ, questionId: QUESTION, selectedOption: 1, nonce, clientTime })
);

const res = await fetch('http://127.0.0.1:3100/api/battle/submit', {
  method: 'POST',
  headers: { 'content-type': 'application/json', Authorization: `Bearer ${idToken}` },
  body: JSON.stringify({ quizId: QUIZ, questionId: QUESTION, selectedOption: 1, nonce, clientTime, signature: sig }),
});
const body = await res.json().catch(() => ({}));
console.log('ROUTE :3100  ->', res.status, JSON.stringify(body));
console.log('minted clientTime :', clientTime);
console.log('now - clientTime  :', Date.now() - clientTime, 'ms (must be <= 5000)');
process.exit(0);
