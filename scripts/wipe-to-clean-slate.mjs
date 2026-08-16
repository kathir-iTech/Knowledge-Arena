// Phase 77: Reviewable Data-Wipe Script
// Destructive and irreversible in production. Do NOT run without explicit
// verification. This script requires TWO safety layers:
//   1. --confirm CLI flag
//   2. Interactive prompt asking the user to type "DELETE EVERYTHING"
//
// Usage:
//   node scripts/wipe-to-clean-slate.mjs            # dry-run mode (default, safe)
//   node scripts/wipe-to-clean-slate.mjs --confirm  # prepare to delete, then prompt
//
// The script will abort immediately if the preserved Executive account
// (UID rk6j2oUmXefdxrQo0qLuCvVIo9C2, email admin_001_1@knowledge-arena.app)
// cannot be verified as existing and role='executive' in Firestore.

import { initializeApp, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getStorage } from 'firebase-admin/storage';
import { createInterface } from 'readline';

// ============================================================
// HARDCODED PRESERVED EXECUTIVE ACCOUNT
// ============================================================
const PRESERVED_UID = 'rk6j2oUmXefdxrQo0qLuCvVIo9C2';
const PRESERVED_EMAIL = 'admin_001_1@knowledge-arena.app';

// ============================================================
// Firebase Admin Setup
// ============================================================
// The script expects Firebase Admin credentials via ADC or env var.
// Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_KEY.
let adminInitialized = false;
let firestore, auth, database, storage, storageBucket;

// Resolves the Cloud Storage bucket name for this project. Source of truth is
// the app's storageBucket option, then the env vars the app itself reads
// (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is the canonical one, see
// src/app/api/executive/workspace/route.ts), with FIREBASE_STORAGE_BUCKET as
// an explicit override. Returns null when no bucket name can be resolved —
// on Spark/free-tier projects Storage is simply not provisioned (a Blaze
// upgrade prompt is all the console shows), so the wipe skips it gracefully
// instead of aborting over something that genuinely does not exist.
function resolveStorageBucket() {
  const app = getApp();
  if (app.options.storageBucket) return app.options.storageBucket;
  const fromEnv = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (fromEnv) return fromEnv;
  return null;
}

// Resolves the Realtime Database URL for this project. Source of truth is
// FIREBASE_DATABASE_URL, then NEXT_PUBLIC_FIREBASE_DATABASE_URL (the same var
// the app itself reads, e.g. set in Vercel). RTDB genuinely holds production
// presence data this wipe must remove, so an unresolvable URL is a hard
// abort — never guessed or defaulted.
function resolveDatabaseUrl() {
  const fromEnv = process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  if (fromEnv) return fromEnv;
  console.error(
    'ERROR: No Realtime Database URL configured. Set FIREBASE_DATABASE_URL or ' +
    'NEXT_PUBLIC_FIREBASE_DATABASE_URL to your project RTDB URL (e.g. ' +
    'https://<project>-default-rtdb.firebaseio.com) before running this script.'
  );
  process.exit(1);
}

function ensureAdminInitialized() {
  if (adminInitialized) return;
  try {
    // Firebase Admin SDK will use GOOGLE_APPLICATION_CREDENTIALS
    // env var or compute engine ADC automatically. Only the database URL
    // needs to be explicit — initializeApp() with no args cannot infer it.
    const databaseUrl = resolveDatabaseUrl();
    initializeApp({ databaseURL: databaseUrl });
    firestore = getFirestore();
    auth = getAuth();
    database = getDatabase();
    storage = getStorage();
    storageBucket = resolveStorageBucket();
    adminInitialized = true;
    console.log('Firebase Admin SDK initialized.');
  } catch (e) {
    console.error('Failed to initialize Firebase Admin SDK:', e);
    process.exit(1);
  }
}

// ============================================================
// CLI Helper - simple prompt
// ============================================================
function cliPrompt(query) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ============================================================
// Enumerate Firestore collections programmatically
// ============================================================
async function listAllCollections(db) {
  const collections = await db.listCollections();
  return collections.map((c) => c.id);
}

// ============================================================
// Enumerate ALL Storage files in a bucket (fully paginated)
// ============================================================
async function listAllStorageFiles(bucket) {
  const files = [];
  let pageToken;
  for (;;) {
    const options = { autoPaginate: false, maxResults: 1000 };
    if (pageToken) options.pageToken = pageToken;
    const [page, nextQuery] = await bucket.getFiles(options);
    files.push(...page);
    const nextToken = nextQuery && nextQuery.pageToken ? nextQuery.pageToken : null;
    if (!nextToken || nextToken === pageToken) break;
    pageToken = nextToken;
  }
  return files;
}

// ============================================================
// Main wipe logic
// ============================================================
async function main() {
  ensureAdminInitialized();

  const isConfirmMode = process.argv.includes('--confirm');
  const isDryRun = !isConfirmMode;

  console.log('=== Phase 77: Data-Wipe Script ===');
  console.log(`Mode: ${isConfirmMode ? 'CONFIRM (will delete)' : 'DRY-RUN (safe, no deletion)'}`);
  console.log(`Preserved Executive UID: ${PRESERVED_UID} (${PRESERVED_EMAIL})`);
  console.log('');

  // ============================================================
  // 1. Verify preserved Executive account exists and is role='executive'
  // ============================================================
  console.log('--- Step 1: Verifying preserved Executive account ---');
  try {
    const userDoc = await firestore.collection('users').doc(PRESERVED_UID).get();

    if (!userDoc.exists) {
      console.error(`ERROR: Preserved UID ${PRESERVED_UID} does not exist in 'users' collection. Aborting. No deletion will occur.`);
      process.exit(1);
    }

    const userData = userDoc.data();
    if (userData.role !== 'executive') {
      console.error(`ERROR: Preserved UID ${PRESERVED_UID} has role='${userData.role}', expected 'executive'. Aborting. No deletion will occur.`);
      process.exit(1);
    }

    console.log(`Verified: UID ${PRESERVED_UID} exists with role='executive'.`);
  } catch (err) {
    console.error(`ERROR: Failed to verify preserved Executive account: ${err}`);
    process.exit(1);
  }

  console.log('');

  // ============================================================
  // 2. Enumerate and count Firestore collections/documents
  // ============================================================
  console.log('--- Step 2: Enumerating Firestore collections ---');
  const collectionPaths = await listAllCollections(firestore);

  const firestoreCounts = {};
  let totalFirestoreDocs = 0;

  for (const collPath of collectionPaths) {
    try {
      const col = firestore.collection(collPath);
      const docs = await col.get();
      const count = docs.size;
      firestoreCounts[collPath] = count;
      totalFirestoreDocs += count;
      console.log(`  ${collPath}: ${count} docs`);
    } catch (e) {
      firestoreCounts[collPath] = 'ERROR: ' + e.message;
      console.log(`  ${collPath}: ERROR - ${e.message}`);
    }
  }

  console.log(`Total Firestore documents: ${totalFirestoreDocs}`);
  console.log('');

  // ============================================================
  // 3. Count Auth users
  // ============================================================
  console.log('--- Step 3: Counting Auth users ---');
  let authUsers = [];
  let totalAuthUsers = 0;

  try {
    const page = await auth.listUsers(1000);
    authUsers = page.users;
    totalAuthUsers = authUsers.length;
  } catch (e) {
    console.error(`ERROR listing auth users: ${e.message}`);
    totalAuthUsers = 0;
  }

  const preservedAuthUser = authUsers.find((u) => u.uid === PRESERVED_UID);
  const authUsersToDelete = totalAuthUsers - 1; // minus the preserved one
  console.log(`Auth users total: ${totalAuthUsers} (${authUsersToDelete} to delete, 1 preserved)`);
  console.log('');

  // ============================================================
  // 4. Count RTDB top-level presence nodes
  // ============================================================
  console.log('--- Step 4: Counting RTDB top-level nodes ---');
  let rtdbTopNodes = 0;

  try {
    const presenceRef = database.ref('presence');
    const presenceSnap = await presenceRef.get();
    if (presenceSnap.exists()) {
      rtdbTopNodes = presenceSnap.numChildren();
      console.log(`  Presence nodes: ${rtdbTopNodes}`);
    } else {
      console.log('  No presence nodes found');
    }
  } catch (e) {
    console.log(`  Error counting RTDB nodes: ${e.message}`);
  }
  console.log('');

  // ============================================================
  // 5. Count Storage files (list ALL files in buckets)
  // ============================================================
  console.log('--- Step 5: Counting Storage files ---');
  let storageFiles = 0;

  if (storageBucket) {
    try {
      const bucket = storage.bucket(storageBucket);
      const files = await listAllStorageFiles(bucket);
      storageFiles = files.length;
      console.log(`  Storage files: ${storageFiles}`);
    } catch (e) {
      console.log(`  Error counting storage files: ${e.message}`);
    }
  } else {
    console.log('  Storage: not provisioned for this project (Spark/free-tier, no bucket configured) — skipping.');
  }
  console.log('');

  // ============================================================
  // 6. Summary and safety prompt
  // ============================================================
  const totalDeleted = totalFirestoreDocs + authUsersToDelete + rtdbTopNodes + storageFiles;

  console.log('=== WIPE SUMMARY ===');
  console.log(`Firestore documents:  ${totalFirestoreDocs} (would delete)`);
  console.log(`Auth users to delete: ${authUsersToDelete} (would delete, 1 preserved)`);
  console.log(`RTDB top-level nodes: ${rtdbTopNodes} (would delete)`);
  console.log(`Storage files:        ${storageFiles} (would delete)`);
  console.log(`TOTAL items to delete: ${totalDeleted}`);
  console.log('');

  if (isDryRun) {
    console.log('DRY-RUN MODE: No items will be deleted. Exiting.');
    console.log('Run with --confirm to actually perform deletion.');
    process.exit(0);
  }

  // ============================================================
  // CONFIRM MODE: Require interactive "DELETE EVERYTHING" prompt
  // ============================================================
  console.log('--- TWO-LAYER SAFETY ---');
  console.log('Layer 1: --confirm flag is present.');
  console.log('Layer 2: You must type "DELETE EVERYTHING" at the prompt below.');
  console.log('');

  const confirmation = await cliPrompt(
    'WARNING: This will PERMANENTLY delete ALL data associated with Knowledge Arena except the preserved Executive account.\n' +
    'Type "DELETE EVERYTHING" to confirm, or anything else to abort: '
  );

  if (confirmation !== 'DELETE EVERYTHING') {
    console.log('Aborted: Confirmation string did not match. No data deleted.');
    process.exit(0);
  }

  console.log('');
  console.log('--- PROCEEDING WITH DELETION ---');

  // ============================================================
  // 7. Actual Deletion
  // ============================================================
  // A. Delete ALL Firestore documents (except preserved user).
  //    Reuses the collectionPaths enumerated in Step 2; fetches fresh
  //    document snapshots per collection for deletion.
  console.log('--- Deleting Firestore documents ---');

  for (const collPath of collectionPaths) {
    try {
      const col = firestore.collection(collPath);
      const docs = await col.get();
      const deletePromises = docs.docs
        .filter((d) => d.id !== PRESERVED_UID)
        .map((d) => firestore.recursiveDelete(d.ref));
      const results = await Promise.allSettled(deletePromises);
      const deletedCount = results.filter((r) => r.status === 'fulfilled').length;
      const failedCount = results.filter((r) => r.status === 'rejected').length;
      console.log(`  ${collPath}: deleted ${deletedCount}, failed ${failedCount}`);
    } catch (e) {
      console.log(`  ${collPath}: ERROR - ${e.message}`);
    }
  }

  // B. Delete ALL Auth users except preserved
  console.log('--- Deleting Auth users (except preserved) ---');
  for (const user of authUsers) {
    if (user.uid === PRESERVED_UID) {
      console.log(`  Skipping preserved user: ${user.uid}`);
      continue;
    }
    try {
      await auth.deleteUser(user.uid);
      console.log(`  Deleted Auth user: ${user.uid}`);
    } catch (e) {
      console.log(`  Failed to delete Auth user ${user.uid}: ${e.message}`);
    }
  }

  // C. Wipe RTDB root
  console.log('--- Wiping RTDB root ---');
  try {
    await database.ref().remove();
    console.log('  RTDB root wiped successfully.');
  } catch (e) {
    console.log(`  ERROR wiping RTDB root: ${e.message}`);
  }

  // D. Delete ALL Storage files (fully paginated, not just the first 1000)
  console.log('--- Deleting Storage files ---');
  if (storageBucket) {
    try {
      const bucket = storage.bucket(storageBucket);
      const files = await listAllStorageFiles(bucket);
      const deletePromises = files.map((f) => f.delete());
      const results = await Promise.allSettled(deletePromises);
      const deletedCount = results.filter((r) => r.status === 'fulfilled').length;
      const failedCount = results.filter((r) => r.status === 'rejected').length;
      console.log(`  Deleted ${deletedCount} storage files, failed ${failedCount} (of ${files.length} scanned)`);
    } catch (e) {
      console.log(`  ERROR deleting storage files: ${e.message}`);
    }
  } else {
    console.log('  Storage: not provisioned for this project (Spark/free-tier, no bucket configured) — skipping.');
  }

  console.log('');
  console.log('=== WIPE COMPLETE ===');
  console.log('Preserved Executive account verification:');

  // Verify preserved account is still intact
  try {
    const userDoc = await firestore.collection('users').doc(PRESERVED_UID).get();
    if (userDoc.exists && userDoc.data().role === 'executive') {
      console.log(`  UID ${PRESERVED_UID} intact with role='executive'.`);
    } else {
      console.log(`  WARNING: Preserved account state unexpected!`);
    }
  } catch (e) {
    console.log(`  ERROR checking preserved account: ${e.message}`);
  }

  console.log('All done. Review the output above carefully.');
  process.exit(0);
}

main().catch((err) => {
  console.error(`FATAL ERROR: ${err}`);
  process.exit(1);
});
