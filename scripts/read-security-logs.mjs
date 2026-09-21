// ZERO-TAP ground truth, finally correct: the emulator's security_logs hold
// EVERY violation as event 'security_violation' with the ROUTE's kind string
// embedded as "detail = `${kind}: ${detail}`" (security-log.ts:84-106) and the
// route's literal metadata passed through (route.ts:83-88): clientTime +
// serverTime: Date.now(). So 'stale_submission_timestamp' lives in detail,
// NOT in event — my old readers queried the wrong column and falsely reported
// 'not persisted'. This reads THAT metadata verbatim: the true typeof + value
// of clientTime the server parsed when it decided 400.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

const app = initializeApp({ projectId: 'demo-quorena' });
const db = getFirestore(app);

const snap = await db.collectionGroup('security_logs').limit(500).get();
console.log('security_logs docs scanned:', snap.size);
let stale = 0;
const types = new Map();
let numeric = 0;
let nonNumeric = 0;
const diffs = [];
for (const doc of snap.docs) {
  const d = doc.data();
  if (typeof d.detail === 'string' && d.detail.startsWith('stale_submission_timestamp')) {
    stale++;
    const md = d.metadata ?? {};
    const ct = md.clientTime;
    const st = md.serverTime;
    const t = ct === null ? 'null' : ct === undefined ? 'undefined' : typeof ct;
    types.set(t, (types.get(t) ?? 0) + 1);
    if (typeof ct === 'number') {
      numeric++;
      const diff = (typeof st === 'number' ? st : 0) - ct;
      diffs.push(diff);
      if (diffs.length <= 8) {
        console.log('  STALE clientTime=%d typeof=%s serverTime=%d diff(server-client)=%d ms', ct, t, st, diff);
      }
    } else {
      nonNumeric++;
      if (nonNumeric <= 8) {
        console.log('  STALE clientTime typeof=%s VALUE=%j serverTime=%j', t, md.clientTime, md.serverTime);
      }
    }
  }
}
console.log('---');
console.log('stale_submission_timestamp violations found:', stale);
console.log('clientTime typeof tally :', JSON.stringify(Object.fromEntries(types)));
console.log('numeric clientTime count:', numeric);
console.log('non-numeric            :', nonNumeric);
if (diffs.length) {
  console.log('diff ms (server-client): min=%d max=%d', Math.min(...diffs), Math.max(...diffs));
}
const verdict =
  nonNumeric === 0 && diffs.length > 0 && diffs.every((x) => Math.abs(x) <= 5000)
    ? 'FRESHNESS OK — clientTime arrived as fresh numeric; failure is NOT clock skew'
    : nonNumeric > 0
    ? 'FIELD-TYPE CONFIRMED — clientTime reached the route as NON-number (see tally)'
    : 'unclear';
console.log('VERDICT:', verdict);
process.exit(0);
