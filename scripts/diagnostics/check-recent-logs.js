const { initializeApp, getApps, getApp, cert } = require('firebase-admin');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

const raw = process.env.DIAGNOSTIC_SERVICE_ACCOUNT_KEY
  ?? (() => { try { return require('fs').readFileSync(require('path').join(__dirname, 'diagnostic-service-account.json'), 'utf-8'); } catch { return null; } })();
if (!raw) { console.error('DIAGNOSTIC_SERVICE_ACCOUNT_KEY not set'); process.exit(1); }
const key = JSON.parse(raw);
if (!getApps().length) initializeApp({ credential: cert(key) });
const db = getFirestore();

async function main() {
  // Query with no filter — just most recent entries of ANY type
  const snap = await db.collection('ai_logs')
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  const logs = snap.docs.map(d => {
    const data = d.data();
    const rawVal = data.createdAt;
    let createdAt = null;
    try { createdAt = rawVal?.toMillis?.() ?? rawVal; } catch { createdAt = rawVal; }
    return { id: d.id, ...data, createdAt, rawCreatedAtType: typeof rawVal, rawCreatedAt: rawVal?.toMillis ? `Timestamp(${rawVal.toMillis()})` : String(rawVal) };
  });

  console.log(`\n=== MOST RECENT ai_logs ENTRIES (no filter) ===`);
  console.log(`Total returned: ${logs.length}`);

  let newestDate = 0;
  for (const l of logs) {
    if (l.createdAt > newestDate) newestDate = l.createdAt;
    const dateStr = l.createdAt ? new Date(l.createdAt).toISOString() : 'NO DATE';
    const isRecent = l.createdAt && (Date.now() - l.createdAt) < 7 * 86400000;
    console.log(`\n  ${isRecent ? '*** RECENT ***' : ''} ${dateStr} (${l.id})`);
    console.log(`    model: ${l.model}`);
    console.log(`    fileTypes: ${JSON.stringify(l.fileTypes)}`);
    console.log(`    questionCount: ${l.questionCount}`);
    console.log(`    success: ${l.success}`);
    console.log(`    error: ${(l.error || '').slice(0, 100)}`);
    console.log(`    createdAt field type: ${l.rawCreatedAtType}`);
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Newest entry: ${newestDate ? new Date(newestDate).toISOString() : 'NONE'}`);
  const hasSept13 = logs.some(l => l.createdAt && new Date(l.createdAt) >= new Date('2026-09-13'));
  const hasSept14 = logs.some(l => l.createdAt && new Date(l.createdAt) >= new Date('2026-09-14'));
  console.log(`Has Sept 13+ entries: ${hasSept13}`);
  console.log(`Has Sept 14 entries: ${hasSept14}`);
  console.log(`Total entries in collection (this query window): ${logs.length}`);

  // Now count ALL entries in the last 30 days regardless of type
  const thirtyDaysAgo = Date.now() - 30 * 86400000;
  const recentCount = logs.filter(l => l.createdAt && l.createdAt > thirtyDaysAgo).length;
  console.log(`Entries from last 30 days (of 20 queried): ${recentCount}`);
}

main().catch(err => { console.error(err); process.exit(1); });