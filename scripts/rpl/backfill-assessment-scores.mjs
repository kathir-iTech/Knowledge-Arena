// Backfill shared score fields onto existing rpl_assessments docs (D2 fix).
// node scripts/rpl/backfill-assessment-scores.mjs [--write] [--production]
//
// For every non-template rpl_assessments doc that has an items subcollection,
// recomputes overallScore / unitScores / scores with the SHARED scoring lib
// (src/lib/rpl/scores.ts — same computeAssessmentScores + formula the app's
// POST /api/rpl/assess uses) and set-merges them onto the doc. This both
// fills docs saved before the fix and normalises legacy rubric-mean-scale
// values (e.g. the old seeder's overallScore: 3.13) to the canonical 0-100
// scale. Docs are NEVER deleted or otherwise modified.
//
//   (default)      dry-run: print every doc with old -> new values, write nothing
//   --write        apply the changes (set-merge)
//   --production   allow touching production (requires SA key or ADC);
//                  without it the script refuses unless FIRESTORE_EMULATOR_HOST is set.
//
// Unknown packId / zero-item docs are SKIPPED and reported — never guessed.

import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'node:fs';

const RPL_ASSESSMENTS = 'rpl_assessments';

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');
const PRODUCTION = args.has('--production');

// ---------------------------------------------------------------------------
// TS module loader — scores.ts / nsqf-packs.ts use type-only imports
// internally, so plain `node` (>=22.13) type-stripping resolves them.
// ---------------------------------------------------------------------------
async function loadTsModule(candidates, label) {
  let mod = null;
  let used = null;
  for (const p of candidates) {
    try {
      mod = await import(p);
      used = p;
      break;
    } catch (err) {
      console.log(`TS import path failed (${label}): ${p}: ${err?.message ?? err}`);
    }
  }
  if (!mod) {
    console.log(
      `DIRECT_TS_IMPORT_FAILED (${label}) — run with a Node version supporting type-stripping (>=22.13).`
    );
    process.exit(1);
  }
  console.log(`TS import path worked: ${used} (${label}, Node type-stripping)`);
  return mod;
}

// ---------------------------------------------------------------------------
// Admin init — mirrors src/lib/firebase-admin.ts (same as the seeder).
// ---------------------------------------------------------------------------
function loadServiceAccountKey() {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (fromEnv) return fromEnv;
  const fromPath = process.env.SERVICE_ACCOUNT_PATH;
  if (fromPath && existsSync(fromPath)) return readFileSync(fromPath, 'utf-8');
  if (existsSync('service-account.json')) return readFileSync('service-account.json', 'utf-8');
  return null;
}

function initAdminForTarget() {
  if (getApps().length) return;
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulatorHost && !PRODUCTION) {
    const projectId =
      process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'demo-quorena';
    initializeApp({ projectId });
    console.log(`Admin init: emulator mode (FIRESTORE_EMULATOR_HOST=${emulatorHost}, projectId=${projectId})`);
    return;
  }
  const raw = loadServiceAccountKey();
  if (raw) {
    const parsed = JSON.parse(raw);
    parsed.private_key = String(parsed.private_key).replace(/\\n/g, '\n');
    initializeApp({ credential: cert(parsed) });
    console.log(`Admin init: service-account mode (project=${parsed.project_id})`);
    return;
  }
  initializeApp({ credential: applicationDefault() });
  console.log('Admin init: ADC mode (applicationDefault)');
}

function toAssessmentItem(docId, data) {
  if (typeof data.itemId !== 'string' || !data.itemId) return null;
  if (typeof data.unitId !== 'string' || !data.unitId) return null;
  if (typeof data.criterionText !== 'string' || !data.criterionText) return null;
  if (data.kind !== 'performance' && data.kind !== 'knowledge') return null;
  return { ...data, itemId: data.itemId, assessmentId: data.assessmentId ?? docId };
}

async function main() {
  console.log('RPL assessment score backfill');
  console.log(`flags: write=${WRITE} production=${PRODUCTION}`);
  console.log(`node ${process.version}`);

  const scoresMod = await loadTsModule(
    ['../../src/lib/rpl/scores.ts', '../src/lib/rpl/scores.ts'],
    'scores'
  );
  const packsMod = await loadTsModule(
    ['../../src/lib/rpl/nsqf-packs.ts', '../src/lib/rpl/nsqf-packs.ts'],
    'nsqf-packs'
  );
  const { computeAssessmentScores } = scoresMod;
  const { NSQF_PACKS } = packsMod;

  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (!emulatorHost && !PRODUCTION) {
    console.error(
      'REFUSING to touch production: FIRESTORE_EMULATOR_HOST is not set and --production was not passed. ' +
        'Set FIRESTORE_EMULATOR_HOST (emulator) or re-run with --production.'
    );
    process.exit(1);
  }

  initAdminForTarget();
  const db = getFirestore();

  // Single collection scan; isTemplate filtering in memory (no queries).
  const snap = await db.collection(RPL_ASSESSMENTS).get();
  const summary = { total: 0, updated: 0, unchanged: 0, skippedNoItems: 0, skippedUnknownPack: 0 };

  for (const doc of snap.docs) {
    const data = doc.data() ?? {};
    if (data.isTemplate === true) continue;
    summary.total += 1;

    const itemsSnap = await doc.ref.collection('items').get();
    const items = [];
    for (const itemDoc of itemsSnap.docs) {
      const item = toAssessmentItem(doc.id, itemDoc.data() ?? {});
      if (item) items.push(item);
    }
    if (items.length === 0) {
      summary.skippedNoItems += 1;
      console.log(`SKIP ${doc.id}: no scoreable items`);
      continue;
    }

    const packId = typeof data.packId === 'string' ? data.packId : '';
    const pack = NSQF_PACKS.find((p) => p.id === packId);
    if (!pack) {
      summary.skippedUnknownPack += 1;
      console.error(`SKIP ${doc.id}: unknown packId ${JSON.stringify(data.packId)} — NOT guessing scores`);
      continue;
    }

    const next = computeAssessmentScores(items, pack);
    const prevOverall = typeof data.overallScore === 'number' ? data.overallScore : null;
    const same =
      prevOverall === next.overallScore &&
      JSON.stringify(data.unitScores ?? null) === JSON.stringify(next.unitScores) &&
      JSON.stringify(data.scores ?? null) === JSON.stringify(next.scores);

    if (same) {
      summary.unchanged += 1;
      console.log(`OK   ${doc.id}: overallScore=${next.overallScore} already current`);
      continue;
    }

    summary.updated += 1;
    console.log(
      `CHANGE ${doc.id}: overallScore ${prevOverall === null ? '(absent)' : prevOverall} -> ${next.overallScore}` +
        ` unitScores=${JSON.stringify(Object.fromEntries(Object.entries(next.unitScores).map(([k, v]) => [k, v.score])))}` +
        (WRITE ? ' (written)' : ' (dry-run, pass --write to apply)')
    );

    if (WRITE) {
      await doc.ref.set(
        {
          overallScore: next.overallScore,
          unitScores: next.unitScores,
          scores: next.scores,
          scoresBackfilledAt: Date.now(),
        },
        { merge: true }
      );
    }
  }

  console.log('--- SUMMARY ---');
  console.log(`docs considered: ${summary.total}`);
  console.log(`updated:         ${summary.updated}${WRITE ? '' : ' (dry-run)'}`);
  console.log(`already current:${summary.unchanged}`);
  console.log(`skipped (no items):        ${summary.skippedNoItems}`);
  console.log(`skipped (unknown packId):  ${summary.skippedUnknownPack}`);
  console.log(WRITE ? 'backfill complete.' : 'dry-run complete: nothing written. Re-run with --write to apply.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
