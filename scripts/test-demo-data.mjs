// SIH-26242 RPL — Part C demo-data builder tests.
//
// Asserts the in-app demo dataset is complete, correctly tagged for
// idempotent load / safe remove, uses canonical reference codes and item ids,
// and produces the REQUIRED low-agreement kappa (< 0.4) computed by the app's
// own math — never a typed number.
//
// Run: npx tsx scripts/test-demo-data.mjs
// (demo-data.ts uses extension-less relative imports, so plain `node` cannot
// type-strip it; tsx is already in the dependency tree.)

import {
  DEMO_BATCH_ID,
  DEMO_PACK_IDS,
  DEMO_RATINGS,
  DEMO_REFERENCE_CODES,
  DEMO_ASSESSOR_EMAILS,
  DEMO_CANDIDATE_EMAIL,
  DEMO_ID_FALLBACK,
  buildDemoWritePlan,
} from '../src/lib/rpl/demo-data.ts';
import { computeKappa } from '../src/lib/rpl/kappa.ts';
import { isReferenceCode } from '../src/lib/rpl/reference-code.ts';
import { isCanonicalItemId } from '../src/lib/rpl/item-ids.ts';

let pass = 0;
let fail = 0;
function ok(name, condition, detail) {
  if (condition) {
    pass += 1;
    console.log(`  \u2713 ${name}`);
  } else {
    fail += 1;
    console.error(`  \u2717 ${name}${detail ? ' — ' + detail : ''}`);
  }
}

const identity = {
  adminUid: 'admin-uid-test',
  assessor1Id: 'assessor-uid-1',
  assessor2Id: 'assessor-uid-2',
  candidate1Id: 'candidate-uid-1',
};
const plan = buildDemoWritePlan(identity);

console.log('\nC — demo data builder');

// ── volume + shape ─────────────────────────────────────────────────────────
const workers = plan.filter((w) => w.collection === 'rpl_workers');
const assessments = plan.filter((w) => w.collection === 'rpl_assessments' && !w.subcollection);
const items = plan.filter((w) => w.subcollection === 'items');
const evidence = plan.filter((w) => w.subcollection === 'evidence');
const certs = plan.filter((w) => w.collection === 'rpl_certifications');
const consistency = plan.filter((w) => w.collection === 'rpl_consistency');

ok('exactly 6 candidate worker docs', workers.length === 6, `found ${workers.length}`);
ok('every worker has a name', workers.every((w) => typeof w.data.name === 'string' && w.data.name.length > 0));

// ── every write tagged for idempotent load + safe remove ─────────────────────
ok(
  'every write carries isDemoData:true',
  plan.every((w) => w.data.isDemoData === true),
);
ok(
  'every write carries the canonical demoBatchId',
  plan.every((w) => w.data.demoBatchId === DEMO_BATCH_ID),
);

// ── deterministic (idempotent) doc ids ──────────────────────────────────────
const plan2 = buildDemoWritePlan(identity);
ok(
  'builder is deterministic for a given identity',
  JSON.stringify(plan.map((w) => [w.collection, w.docId, w.subcollection, w.subDocId])) ===
    JSON.stringify(plan2.map((w) => [w.collection, w.docId, w.subcollection, w.subDocId])),
);
ok('no duplicate write targets', (() => {
  const seen = new Set();
  for (const w of plan) {
    const key = `${w.collection}/${w.docId}/${w.subcollection ?? ''}/${w.subDocId ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
})());

// ── canonical reference codes (never a UID) ─────────────────────────────────
const codes = workers.map((w) => w.data.assessmentReferenceCode);
ok('every worker has a canonical RPL-XXXX-XXXX reference code', codes.every(isReferenceCode));
ok(
  'reference codes are unique',
  new Set(codes).size === codes.length,
);
ok(
  'the six canonical codes match the exported constants',
  new Set(Object.values(DEMO_REFERENCE_CODES)).size === 6 &&
    Object.values(DEMO_REFERENCE_CODES).every(isReferenceCode) &&
    Object.values(DEMO_REFERENCE_CODES).every((c) => codes.includes(c)),
);

// ── assessments: two assessors rating the SAME criteria ─────────────────────
function subsFor(prefix, sub) {
  return plan.filter((w) => w.collection === 'rpl_assessments' && w.docId.startsWith(prefix) && w.subcollection === sub);
}
function assessorIdsFor(prefix) {
  return assessments.filter((a) => a.docId.startsWith(prefix)).map((a) => a.data.assessorId);
}

const elePair = assessorIdsFor('demo-suresh-ele-');
ok('ELE submission has exactly 2 assessors', elePair.length === 2, `found ${elePair.length}`);
ok('ELE pair uses two DISTINCT assessors', new Set(elePair).size === 2);
ok(
  'ELE pair uses the resolved assessor identities',
  elePair.includes(identity.assessor1Id) && elePair.includes(identity.assessor2Id),
);

const eleItemsA = subsFor('demo-suresh-ele-a1', 'items').map((w) => w.data.itemId).sort();
const eleItemsB = subsFor('demo-suresh-ele-a2', 'items').map((w) => w.data.itemId).sort();
ok('ELE pair rates 8 items each', eleItemsA.length === 8 && eleItemsB.length === 8);
ok('ELE pair rates the SAME itemIds', JSON.stringify(eleItemsA) === JSON.stringify(eleItemsB));
ok('every item id is canonical', plan.filter((w) => w.subcollection === 'items').every((w) => isCanonicalItemId(w.data.itemId)));

// ── CON pair: 8+ overlapping items ──────────────────────────────────────────
const conItemsA = subsFor('demo-meena-con-a1', 'items').map((w) => w.data.itemId).sort();
const conItemsB = subsFor('demo-meena-con-a2', 'items').map((w) => w.data.itemId).sort();
ok('CON pair overlaps on 8+ items', conItemsA.length >= 8 && conItemsB.length >= 8);
ok('CON pair rates the SAME itemIds', JSON.stringify(conItemsA) === JSON.stringify(conItemsB));

// ── drafts -> populated assessor queues ─────────────────────────────────────
const drafts = assessments.filter((a) => a.data.status === 'draft');
ok('at least one draft per demo assessor', drafts.some((d) => d.data.assessorId === identity.assessor1Id) && drafts.some((d) => d.data.assessorId === identity.assessor2Id));

// ── AI suggestion used AND not used ─────────────────────────────────────────
const submitted = assessments.filter((a) => a.data.status === 'submitted');
ok('at least one submitted assessment used an AI suggestion', submitted.some((a) => a.data.aiSuggestionUsed === true));
ok('at least one submitted assessment did NOT use AI', submitted.some((a) => a.data.aiSuggestionUsed === false));

// ── evidence + certifications ───────────────────────────────────────────────
ok('at least one evidence image', evidence.length >= 1);
ok('evidence carries a renderable data URL', evidence.every((e) => String(e.data.dataUrl).startsWith('data:image/')));
ok('one pending sign-off certification', certs.filter((c) => c.data.status === 'pending_human_signoff').length >= 1);
ok('one certified (recommend_certification) profile', certs.filter((c) => c.data.status === 'recommend_certification').length >= 1);

// ── packs covered ───────────────────────────────────────────────────────────
ok('covers all three demo packs', DEMO_PACK_IDS.every((p) => submitted.some((a) => a.data.packId === p)));

// ── kappa is COMPUTED and below 0.4 (required low-agreement alert) ──────────
const eleKappa = computeKappa([...DEMO_RATINGS.ele.a], [...DEMO_RATINGS.ele.b]);
ok('ELE kappa computes below 0.4 (produces the required alert)', eleKappa.kappa < 0.4, `kappa=${eleKappa.kappa}`);
ok('ELE kappa interpretation is Poor/Fair', eleKappa.interpretation === 'Poor' || eleKappa.interpretation === 'Fair', eleKappa.interpretation);
const conKappa = computeKappa([...DEMO_RATINGS.con.a], [...DEMO_RATINGS.con.b]);
ok('CON kappa is a finite number in [-1,1]', Number.isFinite(conKappa.kappa) && conKappa.kappa >= -1 && conKappa.kappa <= 1, `kappa=${conKappa.kappa}`);

// ── operator docs constants ─────────────────────────────────────────────────
ok('two demo assessor emails documented', DEMO_ASSESSOR_EMAILS.length === 2 && DEMO_ASSESSOR_EMAILS.every((e) => e.endsWith('@rplcompass.test')));
ok('demo candidate email documented', DEMO_CANDIDATE_EMAIL.endsWith('@rplcompass.test'));
ok('synthetic fallbacks exist for missing accounts', Object.values(DEMO_ID_FALLBACK).every((v) => typeof v === 'string' && v.length > 0));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
