import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync, existsSync } from 'fs';

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
  initAdmin();
  const auth = getAuth();
  const db = getFirestore();

  const email = 'commander_3@gmail.com';

  // 1. Look up Auth user by email
  console.log('--- STEP 1: Auth lookup ---');
  let uid: string;
  try {
    const record = await auth.getUserByEmail(email);
    uid = record.uid;
    console.log(`UID:        ${uid}`);
    console.log(`Email:      ${record.email}`);
    console.log(`Disabled:   ${record.disabled}`);
  } catch (err: any) {
    if (err.code === 'auth/user-not-found') {
      console.log(`Auth user ${email} not found. Cannot proceed without UID.`);
      process.exit(1);
    }
    console.error(`Failed to look up user: ${err.message}`);
    process.exit(1);
  }

  // 2. Read Firestore doc
  console.log('\n--- STEP 2: Firestore doc ---');
  const docRef = db.collection('users').doc(uid);
  const snap = await docRef.get();

  if (snap.exists) {
    const data = snap.data()!;
    console.log(`Exists:     true`);
    console.log('Fields:');
    for (const [key, value] of Object.entries(data)) {
      console.log(`  ${key}: ${JSON.stringify(value)}`);
    }

    // 3. Verify
    console.log('\n--- STEP 3: Verification ---');
    if (data.role === 'commander' && data.disabled === false) {
      console.log('VERIFIED');
    } else {
      console.log('NOT VERIFIED — role or disabled mismatch');
    }
  } else {
    console.log(`Exists:     false`);
    console.log('\n--- STEP 3: MISSING - creating doc ---');

    await docRef.set({
      email,
      name: 'Commander 3',
      role: 'commander',
      avatar: '👾',
      disabled: false,
      mustChangePassword: false,
      createdAt: Date.now(),
    });

    console.log('MISSING');
    console.log('Document created at users/' + uid);
  }
}

main().catch((e) => {
  console.error('\nFATAL:', e.message, '\n');
  process.exit(1);
});
