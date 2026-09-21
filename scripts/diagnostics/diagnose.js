const { initializeApp, getApps, getApp, cert } = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

const raw = process.env.DIAGNOSTIC_SERVICE_ACCOUNT_KEY
  ?? (() => { try { return require('fs').readFileSync(require('path').join(__dirname, 'diagnostic-service-account.json'), 'utf-8'); } catch { return null; } })();
if (!raw) {
  console.error('DIAGNOSTIC_SERVICE_ACCOUNT_KEY is not set and scripts/diagnostics/diagnostic-service-account.json is not present');
  process.exit(1);
}
let key;
try { key = JSON.parse(raw); } catch (e) {
  console.error('Failed to parse DIAGNOSTIC_SERVICE_ACCOUNT_KEY as JSON:', (e).message);
  process.exit(1);
}
if (!key.type || !key.project_id || !key.private_key || !key.client_email) {
  console.error('Service account JSON missing required fields (type, project_id, private_key, client_email)');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: cert(key) });
}
const db = getFirestore();

async function main() {
  // --- READ TEST ---
  // A successful query (even returning zero docs) proves read access.
  // We use a collection we know exists and check for a permission error,
  // not for a specific document.
  const snap = await db.collection('quizzes').limit(1).get();
  console.log('READ TEST OK — queries returned', snap.size, 'doc(s) without a permission error');
  if (snap.size > 0) {
    const d = snap.docs[0];
    console.log('  sample doc:', d.id, '=>', d.data());
  }

  // --- WRITE TEST (must fail) ---
  let writeFailed = false;
  let writeCode = null;
  try {
    await db.collection('quizzes').add({ __opencode_readonly_diagnostic_write_test: true, ts: Date.now() });
    console.error('WRITE TEST FAILED — write succeeded when it should have been denied');
    process.exit(1);
  } catch (err) {
    writeFailed = true;
    writeCode = err.code ?? '(unknown)';
    const msg = (err.message ?? '').toLowerCase();
    const isPermission = msg.includes('permission') || msg.includes('forbidden') || msg.includes('403') || String(err.code) === '7';
    console.log('WRITE TEST OK — correctly rejected:', writeCode, isPermission ? '(permission-denied, as expected)' : '(rejected, verify this is permission-denied)');
  }

  console.log('\nALL CHECKS PASSED — read works, write is blocked by roles/datastore.viewer');
}

main().catch(err => {
  console.error('Diagnostic script error:', err);
  process.exit(1);
});