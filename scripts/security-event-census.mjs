// Distinct-event census of the LIVE suite's security_logs collection.
// No filters, no requests, no spawns: this is what the server ACTUALLY
// persisted across every earlier tap. Decides whether the 400s minted
// 'stale_submission_timestamp' (as I've been filtering) or some OTHER event
// (which my repeated filter-based reads would never surface — the blindspot).
import { Firestore } from 'firebase-admin/firestore';

const db = new Firestore({ projectId: 'demo-quorena', host: '127.0.0.1', port: 8080, ssl: false });

const snap = await db.collectionGroup('security_logs').limit(500).get();
const tally = new Map();
for (const d of snap.docs) {
  const ev = d.data().event;
  tally.set(ev, (tally.get(ev) ?? 0) + 1);
}
const total = [...tally.values()].reduce((a, b) => a + b, 0);
console.log('security_logs docs scanned:', snap.size, ' total events tallied:', total);
console.log('--- distinct events present (name -> count) ---');
for (const [ev, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(String(ev), '->', n);
}
process.exit(0);
