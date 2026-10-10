// RPL demo seeder — node scripts/rpl/seed-rpl-demo.mjs [--dry-run] [--wipe] [--production]
// Seeds three workers, conflicting assessor scores (Suresh ELE/Q1301),
// consistency docs, competency rollup + certification, and Meena AI-assisted
// scenario. Idempotent: all writes are set-merge. Defaults to emulator-safe.
//
// Doc-level score fields (overallScore/unitScores/scores, 0-100) are computed
// with the SHARED lib src/lib/rpl/scores.ts — the same computeAssessmentScores
// POST /api/rpl/assess uses — never hard-coded (D2/D3).
//
// Admin init mirrors src/lib/firebase-admin.ts (emulator vs service-account
// vs ADC + env vars) and scripts/seed-demo.ts (emulator projectId pattern).
// Collection names use the string values from src/lib/rpl/rpl-collections.ts.
// Criterion texts / unit ids mirror src/lib/rpl/nsqf-packs.ts in order.
// Kappa import pattern copied from scripts/test-kappa.mjs (Node type-stripping).
//
//   --dry-run     print every planned write, write nothing
//   --wipe        delete all rpl_* collections first, then seed
//   --production  allow touching production (requires SA key or ADC);
//                 without it the script refuses unless FIRESTORE_EMULATOR_HOST is set.

import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Collection names — string values from src/lib/rpl/rpl-collections.ts
// (RPL_WORKERS, RPL_ASSESSMENTS, RPL_CONSISTENCY, RPL_CERTIFICATIONS,
//  RPL_FORGE_CACHE). Items/evidence live in subcollections:
//  rpl_assessments/{assessmentId}/items/{itemId} (per-criterion scores ONLY).
// ---------------------------------------------------------------------------
const RPL_WORKERS = 'rpl_workers';
const RPL_ASSESSMENTS = 'rpl_assessments';
const RPL_CONSISTENCY = 'rpl_consistency';
const RPL_CERTIFICATIONS = 'rpl_certifications';
const RPL_FORGE_CACHE = 'rpl_forge_cache';
const RPL_COLLECTIONS = [RPL_WORKERS, RPL_ASSESSMENTS, RPL_CONSISTENCY, RPL_CERTIFICATIONS, RPL_FORGE_CACHE];

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const WIPE = args.has('--wipe');
const PRODUCTION = args.has('--production');

// ---------------------------------------------------------------------------
// Canonical NSQF ids + criterion texts (verbatim from src/lib/rpl/nsqf-packs.ts,
// mapped IN ORDER onto each unit's 4 performanceCriteria).
// ---------------------------------------------------------------------------
const ELE_Q1301 = 'ELE/Q1301';
const CON_Q0304 = 'CON/Q0304';
const SSC_Q2212 = 'SSC/Q2212';

const ELE_N1301_CRITERIA = [
  'Identify electrical tools and materials',
  'Follow safety procedures for electrical work',
  'Install wiring and conduit as per drawing',
  'Test installed electrical circuits',
];
const ELE_N1302_CRITERIA = [
  'Diagnose faults in electrical systems',
  'Replace defective components safely',
  'Test repaired circuits',
  'Document repair work',
];
const CON_N0304_1_CRITERIA = [
  'Interpret plumbing drawings',
  'Select appropriate pipes and fittings',
  'Install water supply lines',
  'Test water supply system for leaks',
];
const CON_N0304_2_CRITERIA = [
  'Lay drainage pipes with correct slope',
  'Install traps and sanitary fittings',
  'Connect to main drainage',
  'Test drainage system',
];

// Assessor rubric arrays — KEEP EXACTLY as specified.
const ASSESSOR1_EU1 = [4, 3, 4, 4]; // ELE/N1301
const ASSESSOR1_EU2 = [3, 3, 2, 4]; // ELE/N1302
const ASSESSOR2_EU1 = [3, 3, 3, 4]; // ELE/N1301
const ASSESSOR2_EU2 = [2, 3, 2, 3]; // ELE/N1302
const RATINGS_A = [...ASSESSOR1_EU1, ...ASSESSOR1_EU2];
const RATINGS_B = [...ASSESSOR2_EU1, ...ASSESSOR2_EU2];

// Meena (CON/Q0304, AI-assisted) rubric arrays — TWO assessors so the pack
// has a REAL pairwise kappa (a single assessment cannot produce one, D3).
const MEENA_U1 = [3, 3, 4, 3]; // CON/N0304-1, assessor 1
const MEENA_U2 = [3, 2, 3, 3]; // CON/N0304-2, assessor 1
const MEENA2_U1 = [3, 3, 4, 2]; // CON/N0304-1, assessor 2
const MEENA2_U2 = [3, 2, 3, 3]; // CON/N0304-2, assessor 2
const CON_RATINGS_A = [...MEENA_U1, ...MEENA_U2];
const CON_RATINGS_B = [...MEENA2_U1, ...MEENA2_U2];

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

// Firestore doc IDs cannot contain '/'. Canonical NSQF pack ids (ELE/Q1301)
// and unit ids (ELE/N1301) DO contain '/'. Established pattern in
// src/app/api/rpl/forge/route.ts sanitizeDocId(): doc IDs replace '/' with
// '_' while the packId/unitId FIELDS keep the canonical 'ELE/Q1301' value
// (the consistency API + admin aggregation key by the packId FIELD).
function sanitizeDocId(raw) {
  return String(raw).replace(/\//g, '_').slice(0, 200) || 'untitled';
}
function sanitizeItemId(unitId, idx) {
  return `${String(unitId).replace(/\//g, '-')}-p${idx}`;
}

// ---------------------------------------------------------------------------
// TS module loader — pattern copied from scripts/test-kappa.mjs (Node type-
// stripping of .ts). Candidates ordered for scripts/rpl/ depth first.
// scores.ts / nsqf-packs.ts / kappa.ts all use type-only imports internally,
// so plain `node` (>=22.13) can strip-load them; no tsx required.
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

async function loadKappa() {
  return loadTsModule(['../../src/lib/rpl/kappa.ts', '../src/lib/rpl/kappa.ts'], 'kappa');
}

// Shared scoring lib (src/lib/rpl/scores.ts) + NSQF packs: the SAME
// computeAssessmentScores() the app calls in POST /api/rpl/assess, so
// seeded docs and live docs can never disagree on scale or formula.
async function loadSharedScoring() {
  const scoresMod = await loadTsModule(
    ['../../src/lib/rpl/scores.ts', '../src/lib/rpl/scores.ts'],
    'scores'
  );
  const packsMod = await loadTsModule(
    ['../../src/lib/rpl/nsqf-packs.ts', '../src/lib/rpl/nsqf-packs.ts'],
    'nsqf-packs'
  );
  return {
    computeAssessmentScores: scoresMod.computeAssessmentScores,
    NSQF_PACKS: packsMod.NSQF_PACKS,
  };
}

// ---------------------------------------------------------------------------
// Admin init — mirrors src/lib/firebase-admin.ts:
//   emulator (FIRESTORE_EMULATOR_HOST et al) -> initializeApp({projectId})
//   else service-account (FIREBASE_SERVICE_ACCOUNT_KEY / SERVICE_ACCOUNT_PATH /
//   service-account.json) -> cert(sa)
//   else ADC via applicationDefault().
// scripts/seed-demo.ts establishes the same emulator-first pattern.
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

function buildPlannedWrites(shared, kappaLib) {
  const writes = [];
  // Structured refs avoid '/' splitting bugs: doc ids with '/' are sanitized,
  // canonical ids live in the FIELDS (packId/unitId).
  const pushDoc = (collection, docId, data) => {
    const path = `${collection}/${docId}`;
    writes.push({ collection, docId, path, fields: Object.keys(data).sort(), data });
  };
  const pushItem = (assessmentId, itemId, data) => {
    const path = `${RPL_ASSESSMENTS}/${assessmentId}/items/${itemId}`;
    writes.push({
      collection: RPL_ASSESSMENTS,
      docId: assessmentId,
      subcollection: 'items',
      subDocId: itemId,
      path,
      fields: Object.keys(data).sort(),
      data,
    });
  };
  const pushConsistency = (packId, data) => {
    const docId = sanitizeDocId(packId);
    const path = `${RPL_CONSISTENCY}/${docId}`;
    writes.push({ collection: RPL_CONSISTENCY, docId, path, packId, fields: Object.keys(data).sort(), data });
  };

  // -- 1. Workers ------------------------------------------------------------
  const sureshDeclarationAt = NOW - 6 * DAY;
  const meenaDeclarationAt = NOW - 5 * DAY;
  const raviDeclarationAt = NOW - 4 * DAY;

  const sureshWorker = {
    uid: 'demo-suresh-kumar',
    name: 'Suresh Kumar',
    trade: 'Electrician',
    sector: 'Construction',
    yearsExperience: 8,
    location: 'Maharashtra',
    employerType: 'informal',
    declarationSubmittedAt: sureshDeclarationAt,
    assessmentReferenceCode: 'RPL-2026-SK-001',
    status: 'declared',
    declaration: {
      workerId: 'demo-suresh-kumar',
      trade: 'Electrician',
      sector: 'Construction',
      yearsExperience: 8,
      location: 'Maharashtra',
      employerType: 'informal',
      declarationText:
        'I have worked as an electrician for 8 years in Maharashtra doing house wiring, conduit installation, fault repair and circuit testing.',
      declarationsByPack: {
        [ELE_Q1301]: [
          { unitId: 'ELE/N1301', status: 'done' },
          { unitId: 'ELE/N1302', status: 'can-do' },
          { unitId: 'ELE/N1303', status: 'can-do' },
          { unitId: 'ELE/N1304', status: 'done' },
        ],
      },
      evidenceTextByPack: {
        [ELE_Q1301]:
          '8 years house and site wiring in Nashik; installed conduit and distribution boards; repaired motors and fans; can test circuits with multimeter.',
      },
      matchedPacks: [ELE_Q1301],
    },
    createdAt: sureshDeclarationAt,
    updatedAt: NOW,
  };

  const meenaWorker = {
    uid: 'demo-meena-devi',
    name: 'Meena Devi',
    trade: 'Plumber',
    sector: 'Construction',
    yearsExperience: 5,
    location: 'Rajasthan',
    employerType: 'self-employed',
    declarationSubmittedAt: meenaDeclarationAt,
    assessmentReferenceCode: 'RPL-2026-MD-002',
    status: 'declared',
    declaration: {
      workerId: 'demo-meena-devi',
      trade: 'Plumber',
      sector: 'Construction',
      yearsExperience: 5,
      location: 'Rajasthan',
      employerType: 'self-employed',
      declarationText:
        'I have done plumbing work for 5 years in Jaipur: water supply lines, drainage fitting, leak repair and sanitary installation.',
      declarationsByPack: {
        [CON_Q0304]: [
          { unitId: 'CON/N0304-1', status: 'done' },
          { unitId: 'CON/N0304-2', status: 'can-do' },
          { unitId: 'CON/N0304-3', status: 'done' },
          { unitId: 'CON/N0304-4', status: 'can-do' },
        ],
      },
      evidenceTextByPack: {
        [CON_Q0304]:
          '5 years residential plumbing in Jaipur; fitted tanks, taps and traps; cleared blockages; tested supply lines for leaks.',
      },
      matchedPacks: [CON_Q0304],
    },
    createdAt: meenaDeclarationAt,
    updatedAt: NOW,
  };

  const raviWorker = {
    uid: 'demo-ravi-shankar',
    name: 'Ravi Shankar',
    trade: 'Data Entry Operator',
    sector: 'IT-ITeS',
    yearsExperience: 3,
    location: 'Tamil Nadu',
    employerType: 'formal',
    declarationSubmittedAt: raviDeclarationAt,
    assessmentReferenceCode: 'RPL-2026-RS-003',
    status: 'declared',
    declaration: {
      workerId: 'demo-ravi-shankar',
      trade: 'Data Entry Operator',
      sector: 'IT-ITeS',
      yearsExperience: 3,
      location: 'Tamil Nadu',
      employerType: 'formal',
      declarationText:
        'I have done data entry for 3 years in Chennai: typing from registers, validating formats, file backup and basic computer operation.',
      declarationsByPack: {
        [SSC_Q2212]: [
          { unitId: 'SSC/N2212-1', status: 'done' },
          { unitId: 'SSC/N2212-2', status: 'can-do' },
          { unitId: 'SSC/N2212-3', status: 'can-do' },
          { unitId: 'SSC/N2212-4', status: 'done' },
        ],
      },
      evidenceTextByPack: {
        [SSC_Q2212]:
          '3 years back-office data entry in Chennai; 30 wpm with validation; maintained Excel logs and daily backups.',
      },
      matchedPacks: [SSC_Q2212],
    },
    createdAt: raviDeclarationAt,
    updatedAt: NOW,
  };

  pushDoc(RPL_WORKERS, 'demo-suresh-kumar', sureshWorker);
  pushDoc(RPL_WORKERS, 'demo-meena-devi', meenaWorker);
  pushDoc(RPL_WORKERS, 'demo-ravi-shankar', raviWorker);

  // -- 2. Suresh conflicting assessments (ELE/Q1301) ------------------------
  const a1Id = 'demo-suresh-ele-a1';
  const a2Id = 'demo-suresh-ele-a2';
  const submittedAt = NOW - 1 * DAY;

  // Items are built FIRST so the doc-level score fields come from the
  // SHARED scoring lib (src/lib/rpl/scores.ts, same formula/scale the app
  // uses) instead of hard-coded demo numbers (D2/D3).
  const itemWrites = (assessmentId, assessorId, unitId, unitName, criteria, scores) => {
    const items = [];
    criteria.forEach((criterionText, i) => {
      const itemId = sanitizeItemId(unitId, i);
      const doc = {
        itemId,
        assessmentId,
        unitId,
        unitName,
        kind: 'performance',
        criterionText,
        rubricScore: scores[i],
        scoredBy: assessorId,
        scoredAt: submittedAt,
      };
      pushItem(assessmentId, itemId, doc);
      items.push(doc);
    });
    return items;
  };

  const elePack = shared.NSQF_PACKS.find((p) => p.id === ELE_Q1301);
  const a1Items = [
    ...itemWrites(a1Id, 'demo-assessor-1', 'ELE/N1301', 'Installation of electrical systems', ELE_N1301_CRITERIA, ASSESSOR1_EU1),
    ...itemWrites(a1Id, 'demo-assessor-1', 'ELE/N1302', 'Maintenance and repair of electrical systems', ELE_N1302_CRITERIA, ASSESSOR1_EU2),
  ];
  const a2Items = [
    ...itemWrites(a2Id, 'demo-assessor-2', 'ELE/N1301', 'Installation of electrical systems', ELE_N1301_CRITERIA, ASSESSOR2_EU1),
    ...itemWrites(a2Id, 'demo-assessor-2', 'ELE/N1302', 'Maintenance and repair of electrical systems', ELE_N1302_CRITERIA, ASSESSOR2_EU2),
  ];
  const a1Scores = shared.computeAssessmentScores(a1Items, elePack);
  const a2Scores = shared.computeAssessmentScores(a2Items, elePack);

  const a1Doc = {
    assessorId: 'demo-assessor-1',
    workerId: 'demo-suresh-kumar',
    assessmentId: a1Id,
    packId: ELE_Q1301,
    ...a1Scores,
    status: 'submitted',
    aiSuggestionUsed: false,
    createdAt: NOW - 2 * DAY,
    submittedAt,
    workerName: 'Suresh Kumar',
    referenceCode: 'RPL-2026-SK-001',
  };
  const a2Doc = {
    assessorId: 'demo-assessor-2',
    workerId: 'demo-suresh-kumar',
    assessmentId: a2Id,
    packId: ELE_Q1301,
    ...a2Scores,
    status: 'submitted',
    aiSuggestionUsed: false,
    createdAt: NOW - 2 * DAY,
    submittedAt,
    workerName: 'Suresh Kumar',
    referenceCode: 'RPL-2026-SK-001',
  };
  pushDoc(RPL_ASSESSMENTS, a1Id, a1Doc);
  pushDoc(RPL_ASSESSMENTS, a2Id, a2Doc);

  // -- 3. Consistency ELE/Q1301 (canonical pack id in FIELD; doc id sanitized
  // because Firestore doc ids cannot contain '/').
  // kappa/interpretation/CI are COMPUTED with the app's own computeKappa from
  // src/lib/rpl/kappa.ts — never hard-coded (D3: the old 0.58 "Moderate"
  // contradicted the same arrays' real 0.385 "Fair").
  const eleKappa = kappaLib.computeKappa(RATINGS_A, RATINGS_B);
  pushConsistency(ELE_Q1301, {
    packId: ELE_Q1301,
    kappa: eleKappa.kappa,
    interpretation: eleKappa.interpretation,
    confidenceLower: eleKappa.confidence[0],
    confidenceUpper: eleKappa.confidence[1],
    // Both assessors are unassisted, so the unassisted split equals the
    // overall pool; there is no assisted pair to measure.
    unassistedKappa: eleKappa.kappa,
    assistedKappa: null,
    assessmentCount: 2,
    computedAt: NOW,
  });

  // -- 4. Certification (rollup fields now ride on a2Doc via the shared lib;
  //        scores are 0-100, e.g. EU1 assessor means 3.5 -> 83) ------------
  pushDoc(RPL_CERTIFICATIONS, 'demo-suresh-kumar', {
    workerId: 'demo-suresh-kumar',
    executiveUid: 'demo-executive-1',
    recommendedLevel: 4,
    status: 'pending_human_signoff',
    rationale:
      'Assessor 1 scores 92/100 on installation (competent) and 67/100 on maintenance (partial); units N1303/N1304 are part of the pack but carry no demo items, so the pack-wide overall is 40/100. Assessor 2 scores lower on the same worker (75 and 50). NSQF level 4 recommended pending human sign-off with gap training on fault diagnosis.',
    requiredGapTraining: [],
    signedAt: NOW,
  });

  // -- 5. Meena AI-assisted scenario (CON/Q0304) — TWO assessors so the pack
  //        yields a REAL assisted pairwise kappa (D3) ------------------------
  const meenaAId = 'demo-meena-con-a1';
  const meenaA2Id = 'demo-meena-con-a2';
  const meenaSubmittedAt = NOW - 1 * DAY;

  const meenaItems = (assessmentId, assessorId, scoredAt, unitId, unitName, criteria, scores, aiFlags) => {
    const items = [];
    criteria.forEach((criterionText, i) => {
      const itemId = sanitizeItemId(unitId, i);
      const doc = {
        itemId,
        assessmentId,
        unitId,
        unitName,
        kind: 'performance',
        criterionText,
        rubricScore: scores[i],
        scoredBy: assessorId,
        scoredAt,
      };
      if (aiFlags[i]) {
        doc.aiProposedScore = scores[i];
        doc.aiAccepted = true;
      }
      pushItem(assessmentId, itemId, doc);
      items.push(doc);
    });
    return items;
  };

  const conPack = shared.NSQF_PACKS.find((p) => p.id === CON_Q0304);
  const meenaItemsA1 = [
    ...meenaItems(meenaAId, 'demo-assessor-1', meenaSubmittedAt, 'CON/N0304-1', 'Installation of water supply systems', CON_N0304_1_CRITERIA, MEENA_U1, [true, true, false, true]),
    ...meenaItems(meenaAId, 'demo-assessor-1', meenaSubmittedAt, 'CON/N0304-2', 'Installation of drainage systems', CON_N0304_2_CRITERIA, MEENA_U2, [true, false, true, false]),
  ];
  const meenaItemsA2 = [
    ...meenaItems(meenaA2Id, 'demo-assessor-2', meenaSubmittedAt, 'CON/N0304-1', 'Installation of water supply systems', CON_N0304_1_CRITERIA, MEENA2_U1, [false, true, false, true]),
    ...meenaItems(meenaA2Id, 'demo-assessor-2', meenaSubmittedAt, 'CON/N0304-2', 'Installation of drainage systems', CON_N0304_2_CRITERIA, MEENA2_U2, [true, false, false, false]),
  ];
  const meenaScores = shared.computeAssessmentScores(meenaItemsA1, conPack);
  const meena2Scores = shared.computeAssessmentScores(meenaItemsA2, conPack);

  pushDoc(RPL_ASSESSMENTS, meenaAId, {
    assessorId: 'demo-assessor-1',
    workerId: 'demo-meena-devi',
    assessmentId: meenaAId,
    packId: CON_Q0304,
    ...meenaScores,
    status: 'submitted',
    aiSuggestionUsed: true,
    createdAt: NOW - 2 * DAY,
    submittedAt: meenaSubmittedAt,
    workerName: 'Meena Devi',
    referenceCode: 'RPL-2026-MD-002',
  });
  pushDoc(RPL_ASSESSMENTS, meenaA2Id, {
    assessorId: 'demo-assessor-2',
    workerId: 'demo-meena-devi',
    assessmentId: meenaA2Id,
    packId: CON_Q0304,
    ...meena2Scores,
    status: 'submitted',
    aiSuggestionUsed: true,
    createdAt: NOW - 2 * DAY,
    submittedAt: meenaSubmittedAt,
    workerName: 'Meena Devi',
    referenceCode: 'RPL-2026-MD-002',
  });

  // CON consistency: computed, not hard-coded. Both assessors accepted AI
  // suggestions, so the measured pair feeds the ASSISTED split and the
  // unassisted baseline stays null (genuinely unmeasured).
  const conKappa = kappaLib.computeKappa(CON_RATINGS_A, CON_RATINGS_B);
  pushConsistency(CON_Q0304, {
    packId: CON_Q0304,
    kappa: conKappa.kappa,
    interpretation: conKappa.interpretation,
    confidenceLower: conKappa.confidence[0],
    confidenceUpper: conKappa.confidence[1],
    unassistedKappa: null,
    assistedKappa: conKappa.kappa,
    assessmentCount: 2,
    computedAt: NOW,
  });

  return writes;
}

async function wipeAll(db) {
  let total = 0;
  for (const col of RPL_COLLECTIONS) {
    const snap = await db.collection(col).get();
    console.log(`wipe ${col}: ${snap.size} doc(s)`);
    for (const d of snap.docs) {
      await db.recursiveDelete(d.ref);
      total += 1;
    }
  }
  console.log(`wipe complete: ${total} top-level doc(s) recursively deleted`);
}

async function main() {
  console.log('RPL demo seeder');
  console.log(`flags: dry-run=${DRY_RUN} wipe=${WIPE} production=${PRODUCTION}`);
  console.log(`node ${process.version}`);

  const kappaMod = await loadKappa();
  const shared = await loadSharedScoring();
  const seedKappa = kappaMod.computeKappa(RATINGS_A, RATINGS_B);
  console.log(
    `seed-array kappa: kappa=${seedKappa.kappa.toFixed(4)} ` +
    `interpretation=${seedKappa.interpretation} ` +
    `CI=[${seedKappa.confidence[0].toFixed(4)}, ${seedKappa.confidence[1].toFixed(4)}] ` +
    `(A=[${RATINGS_A}] B=[${RATINGS_B}])`
  );

  const writes = buildPlannedWrites(shared, kappaMod);

  // -- dry-run: print everything, write nothing ------------------------------
  if (DRY_RUN) {
    if (WIPE) {
      console.log('--- PLANNED WIPE (dry-run, nothing deleted) ---');
      for (const col of RPL_COLLECTIONS) console.log(`DELETE collection ${col} (recursive, incl. items/evidence subcollections)`);
    }
    console.log(`--- PLANNED WRITES (${writes.length}, dry-run, nothing written) ---`);
    for (const w of writes) {
      const extra = w.packId && w.docId !== w.packId ? ` packId=${w.packId}` : '';
      console.log(`SET-MERGE ${w.path}${extra} fields=[${w.fields.join(',')}]`);
    }
    printSummary(writes, seedKappa, true);
    return;
  }

  // -- safety gate ------------------------------------------------------------
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (!emulatorHost && !PRODUCTION) {
    console.error(
      'REFUSING to touch production: FIRESTORE_EMULATOR_HOST is not set and --production was not passed. ' +
      'Set FIRESTORE_EMULATOR_HOST (emulator) or re-run with --production.'
    );
    process.exit(1);
  }
  if (PRODUCTION && emulatorHost) {
    console.log(`warning: --production passed but FIRESTORE_EMULATOR_HOST=${emulatorHost} is set; proceeding against production credentials as requested`);
  }

  initAdminForTarget();
  const db = getFirestore();

  if (WIPE) await wipeAll(db);

  // Execute writes with set-merge (idempotent, safe to re-run).
  for (const w of writes) {
    let ref = db.collection(w.collection).doc(w.docId);
    if (w.subcollection && w.subDocId) {
      ref = ref.collection(w.subcollection).doc(w.subDocId);
    }
    await ref.set(w.data, { merge: true });
    console.log(`SET-MERGE ${w.path}`);
  }

  printSummary(writes, seedKappa, false);
}

function printSummary(writes, seedKappa, dryRun) {
  const byCollection = {};
  for (const w of writes) byCollection[w.collection] = (byCollection[w.collection] || 0) + 1;
  console.log(`--- SUMMARY ${dryRun ? '(dry-run)' : ''} ---`);
  console.log('demo UIDs (fixed):');
  console.log('  Suresh Kumar  uid=demo-suresh-kumar   (Electrician, 8y, Maharashtra)');
  console.log('  Meena Devi    uid=demo-meena-devi     (Plumber, 5y, Rajasthan)');
  console.log('  Ravi Shankar  uid=demo-ravi-shankar   (Data Entry/IT, 3y, Tamil Nadu)');
  console.log('assessments:');
  console.log('  demo-suresh-ele-a1 (assessor demo-assessor-1, ELE/Q1301, submitted, aiSuggestionUsed=false)');
  console.log('  demo-suresh-ele-a2 (assessor demo-assessor-2, ELE/Q1301, submitted, aiSuggestionUsed=false)');
  console.log('  demo-meena-con-a1  (assessor demo-assessor-1, CON/Q0304, submitted, aiSuggestionUsed=true)');
  console.log('  demo-meena-con-a2  (assessor demo-assessor-2, CON/Q0304, submitted, aiSuggestionUsed=true)');
  for (const w of writes) {
    if (w.collection === RPL_ASSESSMENTS && typeof w.data.overallScore === 'number') {
      const units = Object.fromEntries(
        Object.entries(w.data.unitScores ?? {}).map(([k, v]) => [k, v.score])
      );
      console.log(`  score fields (${w.docId}): overallScore=${w.data.overallScore} unitScores=${JSON.stringify(units)} (0-100, shared lib)`);
    }
  }
  console.log(`computed seed kappa (app computeKappa): ELE pair=${seedKappa.kappa.toFixed(4)} (${seedKappa.interpretation})`);
  console.log('writes by collection:');
  for (const col of RPL_COLLECTIONS) {
    console.log(`  ${col}: ${byCollection[col] || 0}`);
  }
  console.log(`total planned writes: ${writes.length}`);
  console.log('consistency docs (canonical packId in FIELD; doc id sanitized as Firestore ids cannot contain "/"; kappa COMPUTED, never hard-coded):');
  for (const w of writes) {
    if (w.collection !== RPL_CONSISTENCY) continue;
    const d = w.data;
    console.log(
      `  rpl_consistency/${w.docId} packId=${d.packId} kappa=${d.kappa} (${d.interpretation}) ` +
        `CI=[${Number(d.confidenceLower).toFixed(4)}, ${Number(d.confidenceUpper).toFixed(4)}] ` +
        `unassistedKappa=${d.unassistedKappa} assistedKappa=${d.assistedKappa} assessmentCount=${d.assessmentCount}`
    );
  }
  console.log('certification: rpl_certifications/demo-suresh-kumar status=pending_human_signoff recommendedLevel=4');
  console.log(dryRun ? 'dry-run complete: nothing written.' : 'seed complete.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
