const { initializeApp, getApps, getApp, cert } = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

const raw = process.env.DIAGNOSTIC_SERVICE_ACCOUNT_KEY
  ?? (() => { try { return require('fs').readFileSync(require('path').join(__dirname, 'diagnostic-service-account.json'), 'utf-8'); } catch { return null; } })();
if (!raw) { console.error('DIAGNOSTIC_SERVICE_ACCOUNT_KEY not set'); process.exit(1); }
const key = JSON.parse(raw);
if (!getApps().length) initializeApp({ credential: cert(key) });
const db = getFirestore();

async function main() {
  const snap = await db.collection('ai_logs')
    .orderBy('createdAt', 'desc')
    .limit(500)
    .get();

  const logs = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis?.() || d.data().createdAt }));

  // Separate explanations vs forge/other
  const explanations = logs.filter(l => l.fileTypes?.includes?.('explanation'));
  const forge = logs.filter(l => !l.fileTypes?.includes?.('explanation') && l.questionCount > 0);
  const other = logs.filter(l => !l.fileTypes?.includes?.('explanation') && (!l.questionCount || l.questionCount === 0));

  const avg = arr => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;

  console.log(`\n=== RECENT AI_LOGS (${logs.length} entries) ===`);
  console.log(`\n--- EXPLANATIONS (${explanations.length}) ---`);
  console.log('  count:', explanations.length);
  console.log('  avg durationMs:', Math.round(avg(explanations.map(l => l.durationMs || 0))));
  console.log('  success:', explanations.filter(l => l.success).length, '/', explanations.length);
  console.log('  sample durations:', explanations.slice(0, 5).map(l => l.durationMs));

  console.log(`\n--- FORGE (${forge.length}) ---`);
  if (forge.length) {
    // Group by questionCount
    const byQ = {};
    for (const l of forge) {
      const q = l.questionCount;
      if (!byQ[q]) byQ[q] = { count: 0, durations: [], qCount: [] };
      byQ[q].count++;
      byQ[q].durations.push(l.durationMs || 0);
      byQ[q].qCount.push(l.questionCount || 0);
    }
    for (const [q, d] of Object.entries(byQ)) {
      console.log(`  ${q} questions/jobs: ${d.count} entries, avg total duration ${Math.round(avg(d.durations))}ms`);
      console.log(`    implied ticks (@5/tick): ${d.count > 0 ? Math.round(avg(d.qCount)) / 5 : '?'}, avg per-tick: ${Math.round(avg(d.durations) / Math.max(1, avg(d.qCount) / 5))}ms`);
    }
  }

  console.log(`\n--- OTHER (${other.length}) ---`);
  console.log('  models:', [...new Set(other.map(l => l.model))]);
  console.log('  sample durations:', other.slice(0, 5).map(l => ({ model: l.model, durationMs: l.durationMs })));
}

main().catch(err => { console.error(err); process.exit(1); });