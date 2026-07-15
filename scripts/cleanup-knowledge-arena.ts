import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync, existsSync } from 'fs';

const PRESERVED_UID = 'EIt1mN93hhbEOyh7AToW6s6vV9A2';
const PRESERVED_EMAIL = 'admin1@gmail.com';
const BATCH_SIZE = 500;
const AUTH_DELETE_CHUNK = 1000;

let db: FirebaseFirestore.Firestore;
let auth: import('firebase-admin/auth').Auth;

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
  console.error('  npx tsx scripts/cleanup-knowledge-arena.ts --dry-run\n');
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
    initializeApp({ credential: cert(parsed as { projectId?: string; clientEmail?: string; privateKey?: string }) });
  } catch (e) {
    console.error('\nFATAL: Admin SDK initialization failed:', (e as Error).message, '\n');
    process.exit(1);
  }

  db = getFirestore();
  auth = getAuth();
}

async function getAllAuthUsers(): Promise<admin.auth.UserRecord[]> {
  const users: admin.auth.UserRecord[] = [];
  let nextPageToken: string | undefined;
  do {
    const result = await auth.listUsers(AUTH_DELETE_CHUNK, nextPageToken);
    users.push(...result.users);
    nextPageToken = result.pageToken;
  } while (nextPageToken);
  return users;
}

async function verifyPreservedAccount(): Promise<boolean> {
  console.log('\n--- Verifying Preserved Executive Account ---');

  try {
    const record = await auth.getUser(PRESERVED_UID);
    if (record.email !== PRESERVED_EMAIL) {
      console.error(`ABORT: Preserved UID ${PRESERVED_UID} has email "${record.email}", expected "${PRESERVED_EMAIL}".`);
      return false;
    }
    console.log(`  Auth user: ${record.email} (${record.uid}) — verified`);
  } catch (e) {
    console.error(`ABORT: Preserved Auth user ${PRESERVED_UID} not found.`, (e as Error).message);
    return false;
  }

  try {
    const doc = await db.collection('users').doc(PRESERVED_UID).get();
    if (!doc.exists) {
      console.error(`ABORT: Firestore document users/${PRESERVED_UID} does not exist.`);
      return false;
    }
    const data = doc.data()!;
    if (data.role !== 'executive') {
      console.error(`ABORT: Firestore document users/${PRESERVED_UID} has role "${data.role}", expected "executive".`);
      return false;
    }
    console.log(`  Firestore doc: role=${data.role}, email=${data.email} — verified`);
  } catch (e) {
    console.error(`ABORT: Failed to read Firestore document users/${PRESERVED_UID}.`, (e as Error).message);
    return false;
  }

  console.log('  All checks passed — Executive account is safe.\n');
  return true;
}

async function countDocs(collectionPath: string): Promise<number> {
  const snap = await db.collection(collectionPath).limit(10000).get();
  return snap.size;
}

async function countDocsWithFilter(collectionPath: string, field: string, op: FirebaseFirestore.WhereFilterOp, value: unknown): Promise<number> {
  const snap = await db.collection(collectionPath).where(field, op, value).limit(10000).get();
  return snap.size;
}

async function countQuizSubcollections(quizId: string): Promise<{ questions: number; submissions: number; participants: number; answerKeys: number }> {
  const base = `quizzes/${quizId}`;

  const questionsSnap = await db.collection(`${base}/questions`).limit(10000).get();
  const questions = questionsSnap.size;

  let submissions = 0;
  for (const qDoc of questionsSnap.docs) {
    const subSnap = await db.collection(`${base}/questions/${qDoc.id}/submissions`).limit(10000).get();
    submissions += subSnap.size;
  }

  const participantsSnap = await db.collection(`${base}/participants`).limit(10000).get();
  const answerKeysSnap = await db.collection(`${base}/answerKeys`).limit(10000).get();

  return { questions, submissions, participants: participantsSnap.size, answerKeys: answerKeysSnap.size };
}

async function deleteSubcollectionsRecursive(docRef: FirebaseFirestore.DocumentReference): Promise<number> {
  let total = 0;
  const collections = await docRef.listCollections();
  for (const col of collections) {
    const docs = await col.listDocuments();
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = docs.slice(i, i + BATCH_SIZE);
      for (const d of chunk) {
        total += await deleteSubcollectionsRecursive(d);
        batch.delete(d);
        total++;
      }
      await batch.commit();
    }
  }
  return total;
}

async function deleteAllDocsInCollection(collectionPath: string, exceptDocId?: string): Promise<number> {
  let totalDeleted = 0;
  const docs = await db.collection(collectionPath).listDocuments();
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + BATCH_SIZE);
    for (const d of chunk) {
      if (d.id === exceptDocId) continue;
      totalDeleted += await deleteSubcollectionsRecursive(d);
      batch.delete(d);
      totalDeleted++;
    }
    await batch.commit();
  }
  return totalDeleted;
}

async function dryRunAuth(): Promise<{ total: number; toDelete: number; preserved: boolean }> {
  console.log('=== AUTHENTICATION USERS (DRY RUN) ===\n');
  const users = await getAllAuthUsers();
  console.log(`Total Auth users found: ${users.length}\n`);

  let preserved = false;
  let toDelete = 0;

  for (const u of users) {
    if (u.uid === PRESERVED_UID) {
      console.log(`  PRESERVE: ${u.email} (${u.uid}) — Executive`);
      preserved = true;
    } else {
      console.log(`  DELETE:   ${u.email || '(no email)'} (${u.uid})`);
      toDelete++;
    }
  }

  console.log(`\nSummary: ${toDelete} users to delete, 1 preserved (Executive)`);
  if (!preserved) {
    console.log('\n  *** WARNING: Preserved Executive account was NOT found in Auth! ***');
  }
  return { total: users.length, toDelete, preserved };
}

async function dryRunFirestore(): Promise<void> {
  console.log('\n=== FIRESTORE COLLECTIONS (DRY RUN) ===\n');

  const collections: { path: string; purpose: string; count: number; action: string }[] = [
    { path: 'users', purpose: 'User profiles', count: 0, action: 'DELETE (except Executive)' },
    { path: 'quizzes', purpose: 'Quiz/arena metadata', count: 0, action: 'DELETE ALL' },
    { path: 'executive_requests', purpose: 'Commander-to-Executive requests', count: 0, action: 'DELETE ALL' },
    { path: 'question_bank', purpose: 'Reusable executive-managed questions', count: 0, action: 'DELETE ALL' },
    { path: 'platform_settings', purpose: 'Global platform config (single doc)', count: 0, action: 'PRESERVE' },
  ];

  for (const col of collections) {
    col.count = await countDocs(col.path);
    const label = col.action.startsWith('DELETE') ? 'DELETE' : 'PRESERVE';
    console.log(`  ${col.path}:`);
    console.log(`    Purpose: ${col.purpose}`);
    console.log(`    Documents: ${col.count}`);
    console.log(`    Action: ${col.action}`);
    console.log();
  }

  console.log('--- Quiz Subcollections ---\n');

  const quizSnap = await db.collection('quizzes').get();
  const quizIds = quizSnap.docs.map(d => d.id);
  let totalQuestions = 0;
  let totalSubmissions = 0;
  let totalParticipants = 0;
  let totalAnswerKeys = 0;

  for (const quizId of quizIds) {
    const sub = await countQuizSubcollections(quizId);
    totalQuestions += sub.questions;
    totalSubmissions += sub.submissions;
    totalParticipants += sub.participants;
    totalAnswerKeys += sub.answerKeys;
  }

  console.log(`  quizzes/{quizId}/questions:                ${totalQuestions}`);
  console.log(`  quizzes/{quizId}/questions/{q}/submissions: ${totalSubmissions}`);
  console.log(`  quizzes/{quizId}/participants:             ${totalParticipants}`);
  console.log(`  quizzes/{quizId}/answerKeys:               ${totalAnswerKeys}`);
  const totalQuizSub = totalQuestions + totalSubmissions + totalParticipants + totalAnswerKeys;
  console.log(`  Total quiz subcollection docs to delete:   ${totalQuizSub}\n`);

  const userSnap = await db.collection('users').get();
  const usersExceptExecutive = userSnap.docs.filter(d => d.id !== PRESERVED_UID).length;

  console.log('--- User Documents (excluding Executive) ---');
  console.log(`  users/* (except ${PRESERVED_UID}): ${usersExceptExecutive}\n`);

  console.log('=== DRY RUN SUMMARY ===');
  const authUsers = await getAllAuthUsers();
  const authToDelete = authUsers.filter(u => u.uid !== PRESERVED_UID).length;

  console.log(`  Auth users to delete:     ${authToDelete}`);
  console.log(`  Auth users preserved:     1 (${PRESERVED_EMAIL})`);
  console.log(`  Firestore user docs del:  ${usersExceptExecutive}`);
  console.log(`  Quizzes to delete:        ${quizIds.length}`);
  console.log(`  Quiz subcollections del:  ${totalQuizSub}`);
  console.log(`  Executive requests del:   ${await countDocs('executive_requests')}`);
  console.log(`  Question bank del:        ${await countDocs('question_bank')}`);
  console.log(`  Platform settings kept:   1 (global config)\n`);
}

async function executeAuthCleanup(): Promise<void> {
  console.log('\n=== DELETING AUTH USERS ===\n');
  const users = await getAllAuthUsers();
  const toDelete = users.filter(u => u.uid !== PRESERVED_UID);
  console.log(`Found ${toDelete.length} Auth users to delete...`);

  const uids = toDelete.map(u => u.uid);
  for (let i = 0; i < uids.length; i += AUTH_DELETE_CHUNK) {
    const chunk = uids.slice(i, i + AUTH_DELETE_CHUNK);
    const result = await auth.deleteUsers(chunk);
    if (result.failureCount > 0) {
      console.warn(`  ${result.failureCount} deletions failed in chunk ${i / AUTH_DELETE_CHUNK + 1}`);
      for (const err of result.errors) {
        console.warn(`    ${err.index}: ${err.error.message}`);
      }
    }
    console.log(`  Deleted ${chunk.length - result.failureCount} users (chunk ${i / AUTH_DELETE_CHUNK + 1})`);
  }
  console.log(`\nAuth cleanup complete.\n`);
}

async function executeFirestoreCleanup(): Promise<void> {
  console.log('=== DELETING FIRESTORE DATA ===\n');

  console.log('Deleting quizzes (and all subcollections)...');
  const deletedQuizzes = await deleteAllDocsInCollection('quizzes');
  console.log(`  Deleted ${deletedQuizzes} documents (quizzes + subcollections)\n`);

  console.log('Deleting executive_requests...');
  const deletedRequests = await deleteAllDocsInCollection('executive_requests');
  console.log(`  Deleted ${deletedRequests} documents\n`);

  console.log('Deleting question_bank...');
  const deletedQB = await deleteAllDocsInCollection('question_bank');
  console.log(`  Deleted ${deletedQB} documents\n`);

  console.log('Deleting user documents (except Executive)...');
  const deletedUsers = await deleteAllDocsInCollection('users', PRESERVED_UID);
  console.log(`  Deleted ${deletedUsers} documents\n`);

  console.log('Preserving platform_settings/global...');
  const psSnap = await db.collection('platform_settings').get();
  console.log(`  Found ${psSnap.size} platform_settings doc(s) — preserved\n`);

  console.log('Firestore cleanup complete.\n');
}

async function verifyCleanup(): Promise<void> {
  console.log('=== VERIFICATION ===\n');

  const remainingAuth = await getAllAuthUsers();
  if (remainingAuth.length !== 1) {
    console.error(`FAIL: Expected 1 Auth user, found ${remainingAuth.length}`);
  } else {
    const u = remainingAuth[0];
    console.log(`Auth users: ${remainingAuth.length} (expected 1)`);
    console.log(`  ${u.email} (${u.uid})`);
    if (u.uid !== PRESERVED_UID) {
      console.error(`FAIL: Preserved UID mismatch — expected ${PRESERVED_UID}`);
    }
    if (u.email !== PRESERVED_EMAIL) {
      console.error(`FAIL: Preserved email mismatch — expected ${PRESERVED_EMAIL}`);
    }
  }

  const execDoc = await db.collection('users').doc(PRESERVED_UID).get();
  if (!execDoc.exists) {
    console.error('FAIL: Executive Firestore document missing!');
  } else {
    const data = execDoc.data()!;
    console.log(`Firestore users/${PRESERVED_UID}: exists=${execDoc.exists}, role=${data.role}`);
    if (data.role !== 'executive') {
      console.error(`FAIL: Role is "${data.role}", expected "executive"`);
    }
  }

  const otherUsers = await db.collection('users').get();
  console.log(`Total users collection docs: ${otherUsers.size} (expected 1)`);

  const quizzes = await db.collection('quizzes').get();
  console.log(`Quizzes: ${quizzes.size} (expected 0)`);

  const execReq = await db.collection('executive_requests').get();
  console.log(`Executive requests: ${execReq.size} (expected 0)`);

  const qb = await db.collection('question_bank').get();
  console.log(`Question bank: ${qb.size} (expected 0)`);

  console.log('\n=== VERIFICATION COMPLETE ===\n');
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('==============================================');
  console.log('  Knowledge Arena — Database Cleanup Script');
  console.log(`  Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'EXECUTE'}`);
  console.log(`  Preserved: ${PRESERVED_EMAIL} (${PRESERVED_UID})`);
  console.log('==============================================\n');

  initAdmin();

  if (!(await verifyPreservedAccount())) {
    console.error('Safety check failed. Aborting.\n');
    process.exit(1);
  }

  if (isDryRun) {
    await dryRunAuth();
    await dryRunFirestore();
    console.log('\n==============================================');
    console.log('  DRY RUN COMPLETE — No data was modified.');
    console.log('  To execute: run without --dry-run');
    console.log('==============================================\n');
  } else {
    console.log('\n*** EXECUTING DESTRUCTIVE CLEANUP ***\n');
    await executeAuthCleanup();
    await executeFirestoreCleanup();
    await verifyCleanup();
    console.log('\n==============================================');
    console.log('  CLEANUP COMPLETE');
    console.log('==============================================\n');
  }
}

main().catch((e) => {
  console.error('\nFATAL:', e.message, '\n');
  process.exit(1);
});
