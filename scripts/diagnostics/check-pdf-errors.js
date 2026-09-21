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
    .limit(200)
    .get();

  const logs = snap.docs.map(d => {
    const data = d.data();
    return { id: d.id, ...data, createdAt: data.createdAt?.toMillis?.() || data.createdAt };
  });

  const pdfErrs = logs.filter(l => {
    const err = (l.error || '').toLowerCase();
    const meta = (l.metadata?.fullError || '').toLowerCase();
    return err.includes('pdf_extraction_failed') || meta.includes('workerSrc') || meta.includes('globalworkeroptions');
  });

  const now = Date.now();
  const day = 86400000;

  console.log(`\n=== PDF EXTRACTION ERROR ANALYSIS ===`);
  console.log(`Total ai_logs scanned: ${logs.length}`);
  console.log(`PDF_EXTRACTION_FAILED / workerSrc entries: ${pdfErrs.length}`);

  if (pdfErrs.length === 0) {
    console.log('No PDF extraction errors found in the last 200 entries.');
    return;
  }

  // Timestamps
  const dates = pdfErrs.map(l => ({ createdAt: l.createdAt, date: new Date(l.createdAt).toISOString(), ageMs: now - l.createdAt }));
  const recent = dates.filter(d => d.ageMs < 7 * day);
  const week = dates.filter(d => d.ageMs < 30 * day);
  const older = dates.filter(d => d.ageMs >= 30 * day);

  console.log(`\n--- TIMESTAMPS ---`);
  console.log(`  Recent (<7 days): ${recent.length}`);
  console.log(`  This month (<30 days): ${week.length}`);
  console.log(`  Older (>30 days): ${older.length}`);
  if (recent.length) {
    console.log(`  Newest PDF error: ${new Date(recent[0].createdAt).toISOString()}`);
    console.log(`  Oldest PDF error: ${new Date(recent[recent.length-1].createdAt).toISOString()}`);
  }
  if (week.length && !recent.length) {
    console.log(`  Newest PDF error: ${new Date(week[0].createdAt).toISOString()}`);
  }

  // Code path context
  console.log(`\n--- CODE PATH CONTEXT ---`);
  const sample = pdfErrs.slice(0, 3);
  for (const e of sample) {
    console.log(`\n  Entry ${e.id}:`);
    console.log(`    createdAt: ${new Date(e.createdAt).toISOString()}`);
    console.log(`    fileTypes: ${JSON.stringify(e.fileTypes)}`);
    console.log(`    questionCount: ${e.questionCount}`);
    console.log(`    success: ${e.success}`);
    console.log(`    model: ${e.model}`);
    console.log(`    error: ${(e.error || '').slice(0, 200)}`);
    if (e.metadata) {
      const keys = Object.keys(e.metadata);
      console.log(`    metadata keys: ${JSON.stringify(keys)}`);
      const fe = e.metadata.fullError;
      if (fe) {
        // Extract the file path context
        const pathMatch = fe.match(/\/var\/task\/\.next\/server\/chunks\/\d+\.js/);
        const workerMatch = fe.match(/workerSrc|GlobalWorkerOptions|pdfjs-dist/);
        console.log(`    has chunk path: ${!!pathMatch}`);
        console.log(`    has worker error: ${!!workerMatch}`);
        // Look for any path/context identifier
        const contextMatch = fe.match(/(client|server|legacy|browser|fallback)/i);
        console.log(`    context keyword in error: ${contextMatch ? contextMatch[0] : 'none'}`);
      }
    }
  }

  // Check if there's a distinguishing field anywhere
  const allFields = new Set();
  for (const l of pdfErrs) {
    if (l.metadata) Object.keys(l.metadata).forEach(k => allFields.add(k));
    if (l.metadata?.fullError) allFields.add('fullError');
  }
  console.log(`\n  All metadata fields across PDF errors: ${JSON.stringify([...allFields])}`);

  // Look for client vs server indicators in logs
  const hasFileTypes = pdfErrs.some(l => l.fileTypes && l.fileTypes.length > 0);
  const anyClient = pdfErrs.some(l => (l.metadata?.fullError || '').toLowerCase().includes('client'));
  console.log(`\n  Has fileTypes on PDF errors: ${hasFileTypes}`);
  console.log(`  Any 'client' keyword in PDF errors: ${anyClient}`);
}

main().catch(err => { console.error(err); process.exit(1); });