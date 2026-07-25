import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync, existsSync } from 'fs';

const PRESERVED_UIDS: string[] = [
  'EIt1mN93hhbEOyh7AToW6s6vV9A2',
];

const BATCH_SIZE = 500;

let db: FirebaseFirestore.Firestore;
let auth: import('firebase-admin/auth').Auth;

function loadServiceAccount(): string {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (fromEnv) return fromEnv;
  const pathFromEnv = process.env.SERVICE_ACCOUNT_PATH;
  if (pathFromEnv && existsSync(pathFromEnv)) return readFileSync(pathFromEnv, 'utf-8');
  const localPath = 'service-account.json';
  if (existsSync(localPath)) return readFileSync(localPath, 'utf-8');
  console.error('\nFATAL: No Firebase service account key found.\n');
  process.exit(1);
}

function initAdmin(): void {
  if (getApps().length) return;
  const raw = loadServiceAccount();
  let parsed: Record<string, string>;
  try { parsed = JSON.parse(raw); } catch { console.error('\nFATAL: Invalid JSON.\n'); process.exit(1); }
  if (!parsed.private_key) { console.error('\nFATAL: Missing private_key.\n'); process.exit(1); }
  parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  try { initializeApp({ credential: cert(parsed as ServiceAccount) }); } catch (e) { console.error('\nFATAL:', (e as Error).message, '\n'); process.exit(1); }
  db = getFirestore();
  auth = getAuth();
}

async function getGladiatorUsers(): Promise<{ uid: string; email: string; displayName: string }[]> {
  const snap = await db.collection('users').where('role', '==', 'gladiator').get();
  return snap.docs
    .filter(d => !PRESERVED_UIDS.includes(d.id))
    .map(d => ({
      uid: d.id,
      email: d.data().email || '(no email)',
      displayName: d.data().displayName || d.data().name || '(unnamed)',
    }));
}

async function removeFromParticipants(gladiatorUids: string[]): Promise<number> {
  let total = 0;
  const quizzesSnap = await db.collection('quizzes').get();
  for (const quizDoc of quizzesSnap.docs) {
    const partsSnap = await db.collection('quizzes').doc(quizDoc.id).collection('participants').get();
    for (const partDoc of partsSnap.docs) {
      if (gladiatorUids.includes(partDoc.data().user_id)) {
        await partDoc.ref.delete();
        total++;
      }
    }
  }
  return total;
}

async function removeFromRelatedCollections(gladiatorUids: string[]): Promise<number> {
  let total = 0;

  // Remove from conversations participants (pull from arrays)
  for (const uid of gladiatorUids) {
    const convSnap = await db.collection('conversations').where('participants', 'array-contains', uid).get();
    const batch = db.batch();
    convSnap.docs.forEach(d => {
      const data = d.data();
      const filtered = (data.participants || []).filter((p: string) => !gladiatorUids.includes(p));
      if (filtered.length !== data.participants?.length) {
        batch.update(d.ref, { participants: filtered });
        total++;
      }
    });
    await batch.commit();
  }

  return total;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('==============================================');
  console.log('  Remove Demo Gladiators');
  console.log(`  Mode: ${isDryRun ? 'DRY RUN' : 'EXECUTE'}`);
  console.log('==============================================\n');

  initAdmin();

  const gladiators = await getGladiatorUsers();
  if (gladiators.length === 0) {
    console.log('No gladiator users found to remove.\n');
    process.exit(0);
  }

  console.log(`Found ${gladiators.length} gladiator(s) to remove:\n`);
  for (const g of gladiators) {
    console.log(`  ${g.uid} — ${g.displayName} (${g.email})`);
  }

  if (isDryRun) {
    console.log('\nDry run complete. No changes made.\n');
    process.exit(0);
  }

  const uids = gladiators.map(g => g.uid);

  // Remove from participants
  console.log('\nRemoving from participants...');
  const partCount = await removeFromParticipants(uids);
  console.log(`  Removed ${partCount} participant records`);

  // Remove from conversations
  console.log('Removing from conversations...');
  const convCount = await removeFromRelatedCollections(uids);
  console.log(`  Updated ${convCount} conversations`);

  // Delete Firestore user documents
  console.log('Deleting Firestore user documents...');
  const batch = db.batch();
  for (const uid of uids) {
    batch.delete(db.collection('users').doc(uid));
  }
  await batch.commit();
  console.log(`  Deleted ${uids.length} user documents`);

  // Delete Firebase Auth users
  console.log('Deleting Firebase Auth users...');
  const result = await auth.deleteUsers(uids);
  if (result.failureCount > 0) {
    console.warn(`  ${result.failureCount} deletions failed:`);
    for (const err of result.errors) {
      console.warn(`    ${err.index}: ${err.error.message}`);
    }
  }
  console.log(`  Deleted ${uids.length - result.failureCount} auth users`);

  console.log('\nCleanup complete.\n');
}

main().catch((e) => {
  console.error('\nFATAL:', e.message, '\n');
  process.exit(1);
});
