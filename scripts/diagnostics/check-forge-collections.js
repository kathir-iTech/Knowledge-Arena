const { initializeApp, getApps, getApp, cert } = require('firebase-admin');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

const raw = process.env.DIAGNOSTIC_SERVICE_ACCOUNT_KEY
  ?? (() => { try { return require('fs').readFileSync(require('path').join(__dirname, 'diagnostic-service-account.json'), 'utf-8'); } catch { return null; } })();
if (!raw) { console.error('DIAGNOSTIC_SERVICE_ACCOUNT_KEY not set'); process.exit(1); }
const key = JSON.parse(raw);
if (!getApps().length) initializeApp({ credential: cert(key) });
const db = getFirestore();
const thirtyDaysAgo = Date.now() - 30 * 86400000;

async function checkColl(name) {
  const snap = await db.collection(name).orderBy('createdAt', 'desc').limit(10).get();
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis?.() || d.data().createdAt }));
  const recent = docs.filter(d => d.createdAt > thirtyDaysAgo);
  console.log(`${name}: ${docs.length} entries, ${recent.length} from last 30 days`);
  if (recent.length) {
    const newest = Math.max(...recent.map(d => d.createdAt));
    console.log(`  newest: ${new Date(newest).toISOString()}`);
    console.log(`  sample: ${JSON.stringify(recent.slice(0, 3).map(d => ({ id: d.id, createdAt: new Date(d.createdAt).toISOString(), status: d.status, generatedCount: d.generatedCount, questionCount: d.questionCount, error: (d.error || '').slice(0, 60) })))}`);
  } else if (docs.length) {
    const newest = Math.max(...docs.map(d => d.createdAt));
    console.log(`  oldest entry: ${new Date(newest).toISOString()} (all entries are older than 30 days)`);
  }
}

async function main() {
  await checkColl('forge_cache');
  await checkColl('ai_jobs');
}

main().catch(err => { console.error(err); process.exit(1); });