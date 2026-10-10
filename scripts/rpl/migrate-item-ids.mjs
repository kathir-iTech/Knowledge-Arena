// Migrate legacy item ids to the canonical `unitId::p{idx}` / `::k{idx}`
// scheme (D4 fix). node scripts/rpl/migrate-item-ids.mjs [--write] [--production]
//
// Why: the demo seeder used `ELE-N1301-p0` while the app's assess page looks
// up `ELE/N1301::p0`. Opening a seeded assessment therefore rendered empty
// scores, saving duplicated every item under the second scheme, and
// recompute-consistency double-counted criteria (distorted kappa).
//
// For every item doc in a non-template rpl_assessments subcollection:
//   - canonical id (matches /::[pk]\d+$/)          -> leave as-is
//   - legacy `-p{idx}` / `-k{idx}` + unitId field  -> write the doc under the
//     canonical doc id (firestoreItemId) with itemId updated, then delete the
//     legacy doc; if the canonical doc ALREADY exists with the same score
//     signature the legacy duplicate is simply deleted
//   - unparseable / missing unitId / kind mismatch -> SKIPPED and reported;
//     this script NEVER guesses an id and NEVER deletes unsafely
//
//   (default)      dry-run: print every planned move, write nothing
//   --write        apply (create-canonical-then-delete-legacy, ordered so no
//                  item can be lost mid-run)
//   --production   allow touching production (requires SA key or ADC);
//                  without it the script refuses unless FIRESTORE_EMULATOR_HOST is set.

import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'node:fs';

const RPL_ASSESSMENTS = 'rpl_assessments';

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');
const PRODUCTION = args.has('--production');

// ---------------------------------------------------------------------------
// TS module loader — item-ids.ts uses type-only imports internally, so plain
// `node` (>=22.13) type-stripping resolves it.
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

function sameScore(a, b) {
  const ka = ['rubricScore', 'knowledgePass', 'criterionText', 'kind', 'unitId'];
  return ka.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));
}

async function main() {
  console.log('RPL item-id migration (legacy `-pN`/`-kN` -> `unitId::pN`/`::kN`)');
  console.log(`flags: write=${WRITE} production=${PRODUCTION}`);
  console.log(`node ${process.version}`);

  const idsMod = await loadTsModule(
    ['../../src/lib/rpl/item-ids.ts', '../src/lib/rpl/item-ids.ts'],
    'item-ids'
  );
  const { isCanonicalItemId, parseLegacyItemId, itemIdFor, firestoreItemId } = idsMod;

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

  const snap = await db.collection(RPL_ASSESSMENTS).get();
  const summary = {
    assessments: 0,
    itemsTotal: 0,
    alreadyCanonical: 0,
    migrated: 0,
    deduped: 0,
    skippedNeedsReview: 0,
    conflicts: 0,
  };

  for (const assessment of snap.docs) {
    const data = assessment.data() ?? {};
    if (data.isTemplate === true) continue;
    summary.assessments += 1;

    const itemsSnap = await assessment.ref.collection('items').get();
    for (const itemDoc of itemsSnap.docs) {
      summary.itemsTotal += 1;
      const item = itemDoc.data() ?? {};
      const itemId = typeof item.itemId === 'string' ? item.itemId : '';

      if (!itemId) {
        summary.skippedNeedsReview += 1;
        console.error(`SKIP ${assessment.id}/items/${itemDoc.id}: item has no itemId field`);
        continue;
      }
      if (isCanonicalItemId(itemId)) {
        summary.alreadyCanonical += 1;
        continue;
      }

      const parsed = parseLegacyItemId(itemId);
      const unitId = typeof item.unitId === 'string' ? item.unitId : '';
      if (!parsed || !unitId || item.kind !== parsed.kind) {
        summary.skippedNeedsReview += 1;
        console.error(
          `SKIP ${assessment.id}/items/${itemDoc.id}: cannot map legacy id ${JSON.stringify(itemId)} ` +
            `(unitId=${JSON.stringify(item.unitId)} kind=${JSON.stringify(item.kind)}) — NOT guessing`
        );
        continue;
      }

      const newItemId = itemIdFor(unitId, parsed.kind, parsed.index);
      const newDocId = firestoreItemId(newItemId);
      const itemsRef = assessment.ref.collection('items');

      if (itemDoc.id === newDocId) {
        // Doc id already canonical; only the itemId FIELD is legacy.
        summary.migrated += 1;
        console.log(
          `${WRITE ? 'FIX' : 'PLAN'} ${assessment.id}/items/${newDocId}: itemId ${itemId} -> ${newItemId}`
        );
        if (WRITE) await itemDoc.ref.set({ itemId: newItemId }, { merge: true });
        continue;
      }

      const target = await itemsRef.doc(newDocId).get();
      if (target.exists) {
        if (sameScore(target.data() ?? {}, item)) {
          summary.deduped += 1;
          console.log(
            `${WRITE ? 'DEDUPE' : 'PLAN'} ${assessment.id}: delete legacy duplicate ${itemDoc.id} ` +
              `(canonical ${newDocId} already has the same score)`
          );
          if (WRITE) await itemDoc.ref.delete();
        } else {
          summary.conflicts += 1;
          console.error(
            `CONFLICT ${assessment.id}: legacy ${itemDoc.id} (${itemId}) and canonical ${newDocId} ` +
              `(${newItemId}) BOTH exist with DIFFERENT scores — left untouched for manual review`
          );
        }
        continue;
      }

      summary.migrated += 1;
      console.log(
        `${WRITE ? 'MOVE' : 'PLAN'} ${assessment.id}/items: ${itemDoc.id} (${itemId}) -> ${newDocId} (${newItemId})`
      );
      if (WRITE) {
        // Create canonical FIRST, then delete legacy: no data-loss window.
        await itemsRef.doc(newDocId).set({ ...item, itemId: newItemId }, { merge: false });
        await itemDoc.ref.delete();
      }
    }
  }

  console.log('--- SUMMARY ---');
  console.log(`assessments considered:  ${summary.assessments}`);
  console.log(`items considered:        ${summary.itemsTotal}`);
  console.log(`already canonical:       ${summary.alreadyCanonical}`);
  console.log(`${WRITE ? 'migrated:   ' : 'to migrate:'}             ${summary.migrated}`);
  console.log(`${WRITE ? 'deduped:    ' : 'to dedupe:'}              ${summary.deduped}`);
  console.log(`skipped (needs review):  ${summary.skippedNeedsReview}`);
  console.log(`conflicts (untouched):   ${summary.conflicts}`);
  if (summary.skippedNeedsReview > 0 || summary.conflicts > 0) {
    console.error('ATTENTION: some items were skipped/conflicted — resolve them manually, then re-run.');
  }
  console.log(WRITE ? 'migration complete.' : 'dry-run complete: nothing written. Re-run with --write to apply.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
