import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync, existsSync } from 'fs';

const DEFAULT_PASSWORD = '1234567';
const STAFF_DOMAIN = 'knowledge-arena.app';

function loadServiceAccount(): string {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (fromEnv) return fromEnv;

  const pathFromEnv = process.env.SERVICE_ACCOUNT_PATH;
  if (pathFromEnv && existsSync(pathFromEnv)) {
    return readFileSync(pathFromEnv, 'utf-8');
  }

  const localPath = 'service-account.json';
  if (existsSync(localPath)) {
    return readFileSync(localPath, 'utf-8');
  }

  console.error('\nFATAL: No Firebase service account key found.');
  console.error('Provide it via one of:\n');
  console.error('  1. FIREBASE_SERVICE_ACCOUNT_KEY env var (JSON string)');
  console.error('  2. SERVICE_ACCOUNT_PATH env var (path to JSON file)');
  console.error('  3. service-account.json file in project root');
  console.error('\nUsage:');
  console.error('  npx tsx scripts/bootstrap-executive.ts\n');
  process.exit(1);
}

function initAdmin(): void {
  if (getApps().length) return;

  const raw = loadServiceAccount();

  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error('\nFATAL: FIREBASE_SERVICE_ACCOUNT_KEY contains invalid JSON.\n');
    process.exit(1);
  }

  if (!parsed.private_key) {
    console.error('\nFATAL: Service account key missing private_key.\n');
    process.exit(1);
  }
  parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');

  try {
    initializeApp({ credential: cert(parsed as ServiceAccount) });
  } catch (e) {
    console.error('\nFATAL: Admin SDK initialization failed:', (e as Error).message, '\n');
    process.exit(1);
  }
}

async function main() {
  console.log('==============================================');
  console.log('  Knowledge Arena — Executive Bootstrap');
  console.log('==============================================\n');

  initAdmin();
  const auth = getAuth();
  const db = getFirestore();

  const seq = process.env.EXECUTIVE_SEQ || '001';
  const staffId = `admin_${seq}_1`;
  const email = `${staffId}@${STAFF_DOMAIN}`;
  const password = process.env.EXECUTIVE_PASSWORD || DEFAULT_PASSWORD;
  const displayName = process.env.EXECUTIVE_NAME || `Executive ${seq}`;

  const existingUsers = await db.collection('users').where('role', '==', 'executive').get();
  if (!existingUsers.empty) {
    console.log('Executive already exists — checking if migration needed.\n');
    for (const doc of existingUsers.docs) {
      const data = doc.data();
      console.log(`  Existing: ${data.email || 'unknown'} (${doc.id})`);
      if (!data.mustChangePassword) {
        console.log('  Updating existing Executive with mustChangePassword flag...');
        await doc.ref.update({ mustChangePassword: true });
        console.log('  Done.\n');
      }
    }
    console.log('Bootstrap skipped — Executive already exists.\n');
    return;
  }

  console.log(`Creating Executive account...`);
  console.log(`  Staff ID:  ${staffId}`);
  console.log(`  Email:     ${email}`);
  console.log(`  Name:      ${displayName}`);
  console.log(`  Password:  ${password} (CHANGE ON FIRST LOGIN)\n`);

  const userRecord = await auth.createUser({
    email,
    password,
    displayName,
  });

  console.log(`Auth user created: ${userRecord.uid}\n`);

  await db.collection('users').doc(userRecord.uid).set({
    name: displayName,
    email,
    role: 'executive',
    avatar: '🔮',
    mustChangePassword: true,
    createdAt: Date.now(),
  });

  console.log('Firestore profile created.\n');
  console.log('==============================================');
  console.log('  BOOTSTRAP COMPLETE');
  console.log('==============================================');
  console.log(`\n  Login ID:   ${staffId}`);
  console.log(`  Password:   ${password}`);
  console.log('\n  Login at the app using Staff Login section.');
  console.log('  You will be prompted to change your password.\n');
}

main().catch((e) => {
  console.error('\nFATAL:', e.message, '\n');
  process.exit(1);
});
