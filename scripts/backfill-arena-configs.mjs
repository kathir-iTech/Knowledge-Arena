// Phase 95: Legacy arena backfill script
// Pre-Phase-94 arenas have no config/settings subcollection doc. The battle
// server already falls back to parent-doc scoring_config for these, but if
// anyone ever rewrites one of these old arenas, the fallback breaks.
//
// This script backfills quizzes/{id}/config/settings from the parent doc's
// scoring_config + skipped_question_ids where the subcollection doc is missing.
// It is intentionally dry-run by default (safe, no writes) and only mutates
// Firestore when invoked with --confirm. Kathir will run it locally with real
// credentials.
//
// Usage:
//   node scripts/backfill-arena-configs.mjs              # dry-run (default, safe)
//   node scripts/backfill-arena-configs.mjs --confirm    # actually create missing docs
//
// Credentials: expects Firebase Admin credentials via one of
//   - GOOGLE_APPLICATION_CREDENTIALS env var (path to service-account json)
//   - FIREBASE_SERVICE_ACCOUNT_KEY env var (raw JSON string)
//   - SERVICE_ACCOUNT_PATH env var (path)
//   - service-account.json in project root (gitignored)
//
// Safety: mirrors scripts/wipe-to-clean-slate.mjs — dry-run by default,
// --confirm required to write, and every action is logged.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';

const QUIZ_CONFIG_COLLECTION = 'config';
const QUIZ_CONFIG_DOC = 'settings';

function loadServiceAccount() {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (fromEnv) return fromEnv;
  const pathFromEnv = process.env.SERVICE_ACCOUNT_PATH;
  if (pathFromEnv && existsSync(pathFromEnv)) return readFileSync(pathFromEnv, 'utf-8');
  if (existsSync('service-account.json')) return readFileSync('service-account.json', 'utf-8');
  throw new Error(
    'No Firebase service account key found. Provide FIREBASE_SERVICE_ACCOUNT_KEY, SERVICE_ACCOUNT_PATH, or service-account.json'
  );
}

function initAdmin() {
  if (getApps().length) return getFirestore();
  const raw = loadServiceAccount();
  const parsed = JSON.parse(raw);
  parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  initializeApp({ credential: cert(parsed) });
  return getFirestore();
}

async function main() {
  const isConfirm = process.argv.includes('--confirm');
  const isDryRun = !isConfirm;

  console.log('=== Phase 95: Arena Config Backfill ===');
  console.log(`Mode: ${isConfirm ? 'CONFIRM (will create missing docs)' : 'DRY-RUN (safe, no writes)'}`);
  console.log('');

  const db = initAdmin();

  console.log('Reading all quizzes documents...');
  const quizzesSnap = await db.collection('quizzes').get();
  console.log(`Found ${quizzesSnap.size} quizzes.\n`);

  if (quizzesSnap.empty) {
    console.log('No quizzes to process. Exiting.');
    process.exit(0);
  }

  let skipped = 0;
  let created = 0;
  let wouldCreate = 0;
  let errors = 0;

  for (const quizDoc of quizzesSnap.docs) {
    const quizId = quizDoc.id;
    const quizData = quizDoc.data() || {};
    const cfgRef = db.collection('quizzes').doc(quizId).collection(QUIZ_CONFIG_COLLECTION).doc(QUIZ_CONFIG_DOC);

    let cfgSnap;
    try {
      cfgSnap = await cfgRef.get();
    } catch (e) {
      console.error(`  [${quizId}] ERROR reading config/settings: ${e.message}`);
      errors++;
      continue;
    }

    if (cfgSnap.exists) {
      console.log(`  [${quizId}] SKIP — config/settings already exists`);
      skipped++;
      continue;
    }

    // Legacy parent-doc fields (may be undefined if arena was created without explicit scoring config)
    const legacyScoring = quizData.scoring_config ?? null;
    const legacySkipped = Array.isArray(quizData.skipped_question_ids) ? quizData.skipped_question_ids : [];

    // Payload mirrors arena-creation.service.ts defaults; if the legacy doc had an
    // explicit scoring_config we preserve it verbatim, otherwise we store null so
    // the battle server falls back to normalizeScoringConfig defaults (1000/100/...)
    // rather than fabricating a config that was never intended.
    const payload = {
      scoring_config: legacyScoring,
      skipped_question_ids: legacySkipped,
    };

    if (isDryRun) {
      console.log(
        `  [${quizId}] WOULD CREATE config/settings — scoring_config: ${JSON.stringify(legacyScoring)} skipped: ${JSON.stringify(legacySkipped)}`
      );
      wouldCreate++;
    } else {
      try {
        await cfgRef.set(payload, { merge: false });
        console.log(`  [${quizId}] CREATED config/settings — scoring_config: ${JSON.stringify(legacyScoring)} skipped: ${JSON.stringify(legacySkipped)}`);
        created++;
      } catch (e) {
        console.error(`  [${quizId}] ERROR creating config/settings: ${e.message}`);
        errors++;
      }
    }
  }

  console.log('');
  console.log('=== BACKFILL SUMMARY ===');
  if (isDryRun) {
    console.log(`  Total quizzes:      ${quizzesSnap.size}`);
    console.log(`  Already have config: ${skipped}`);
    console.log(`  Would create:       ${wouldCreate}`);
    console.log(`  Errors:             ${errors}`);
    console.log('');
    console.log('DRY-RUN: No documents were written. Re-run with --confirm to apply.');
  } else {
    console.log(`  Total quizzes:      ${quizzesSnap.size}`);
    console.log(`  Already have config: ${skipped}`);
    console.log(`  Created:            ${created}`);
    console.log(`  Errors:             ${errors}`);
    console.log('');
    console.log('BACKFILL COMPLETE.');
  }
}

main().catch((e) => {
  console.error(`FATAL: ${e.stack || e.message}`);
  process.exit(1);
});
