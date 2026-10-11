// SIH-26242 RPL — in-app demo data builder (Part C).
//
// PURE module: no Firestore, no auth, no network. It returns a deterministic
// write plan that POST /api/rpl/admin/demo persists with the Admin SDK. Keeping
// the content separate from the write path makes the demo unit-testable offline
// (scripts/test-demo-data.mjs) and guarantees the same docs every time.
//
// Ground rules (Part C):
//   - Every emitted doc carries `isDemoData: true` and `demoBatchId` so the
//     Remove action can delete ONLY demo data (never real records).
//   - Document ids are deterministic and the reference codes are canonical
//     RPL-XXXX-XXXX values (src/lib/rpl/reference-code.ts), so loading twice is
//     idempotent (set-merge) and never overwrites a real record's code.
//   - Assessment score fields come from the SHARED scoring lib
//     (src/lib/rpl/scores.ts) — never hard-coded 0-100 numbers.
//   - Inter-assessor kappa is NEVER stored here. The API route writes the
//     assessments, then calls the app's own recomputePackConsistency()
//     (src/lib/rpl/recompute-consistency.ts -> computeKappa in
//     src/lib/rpl/kappa.ts) so the consistency page is computed, not typed.
//
// Two assessors (assessor1/assessor2) rate the SAME criteria for the submitted
// pairs, which is what makes a real weighted kappa possible. The ELE pair uses
// the exact rubric arrays required by Part C and lands below 0.4, producing the
// required low-agreement alert.

import { NSQF_PACKS, type NSQFQualificationPack } from './nsqf-packs';
import { computeAssessmentScores } from './scores';
import { performanceItemId } from './item-ids';
import type { AssessmentItem } from './types';

/** Stable tag so repeated loads merge into one batch and Remove is deterministic. */
export const DEMO_BATCH_ID = 'sih-26242-rpl-demo-v1';

/** Demo accounts documented for the operator (README SIH section, Part C4). */
export const DEMO_ASSESSOR_EMAILS = [
  'assessor1@rplcompass.test',
  'assessor2@rplcompass.test',
] as const;
export const DEMO_CANDIDATE_EMAIL = 'candidate1@rplcompass.test';

/** Packs that receive a computed consistency report after the load. */
export const DEMO_PACK_IDS = ['ELE/Q1301', 'CON/Q0304', 'SSC/Q2212'] as const;

export interface DemoIdentity {
  /** The admin who triggered the load — stamped as executiveUid on certifications. */
  adminUid: string;
  assessor1Id: string;
  assessor2Id: string;
  /** Worker id for the primary candidate, so candidate1 sees their own profile. */
  candidate1Id: string;
}

/** Synthetic ids used when the demo accounts have not been created yet. */
export const DEMO_ID_FALLBACK = {
  assessor1Id: 'demo-assessor-1',
  assessor2Id: 'demo-assessor-2',
  candidate1Id: 'demo-candidate-1',
} as const;

export interface DemoWrite {
  collection: string;
  docId: string;
  subcollection?: string;
  subDocId?: string;
  data: Record<string, unknown>;
}

/** Canonical demo reference codes (unambiguous alphabet, no 0/1/I/L/O). */
export const DEMO_REFERENCE_CODES = {
  suresh: 'RPL-K7M2-9QWE',
  meena: 'RPL-P4XR-6TZA',
  ravi: 'RPL-D8HN-2VUB',
  anita: 'RPL-G5CY-7JKN',
  mohammed: 'RPL-T9FW-3MSE',
  lakshmi: 'RPL-B6QP-8RVY',
} as const;

/**
 * Assessor rubric arrays (1-4), in unit order (unit1 criteria then unit2).
 * ele matches the Part C requirement exactly:
 *   RATINGS_A=[4,3,4,4,3,3,2,4]  RATINGS_B=[3,3,3,4,2,3,2,3]  -> kappa < 0.4.
 */
export const DEMO_RATINGS = {
  ele: { a: [4, 3, 4, 4, 3, 3, 2, 4], b: [3, 3, 3, 4, 2, 3, 2, 3] },
  con: { a: [3, 3, 4, 3, 3, 2, 3, 3], b: [3, 3, 4, 2, 3, 2, 3, 3] },
  ssc: { a: [4, 3, 3, 4, 3, 3, 2, 3], b: [3, 4, 3, 4, 2, 3, 2, 3] },
} as const;

const RPL_WORKERS = 'rpl_workers';
const RPL_ASSESSMENTS = 'rpl_assessments';
const RPL_CERTIFICATIONS = 'rpl_certifications';

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

/** 1x1 transparent PNG — a real, renderable data: URL for the evidence gallery. */
const EVIDENCE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function packById(id: string): NSQFQualificationPack {
  const pack = NSQF_PACKS.find((p) => p.id === id);
  if (!pack) throw new Error(`demo-data: unknown pack ${id}`);
  return pack;
}

type DeclarationMark = 'can-do' | 'done' | 'never';

interface UnitClaim {
  unitId: string;
  status: DeclarationMark;
}

function declaration(
  workerId: string,
  trade: string,
  sector: string,
  yearsExperience: number,
  location: string,
  employerType: string,
  declarationText: string,
  packId: string,
  claims: UnitClaim[],
  evidenceText: string,
): Record<string, unknown> {
  return {
    workerId,
    trade,
    sector,
    yearsExperience,
    location,
    employerType,
    declarationText,
    declarationsByPack: { [packId]: claims },
    evidenceTextByPack: { [packId]: evidenceText },
    matchedPacks: [packId],
  };
}

function buildItems(
  pack: NSQFQualificationPack,
  assessmentId: string,
  assessorId: string,
  scoredAt: number,
  unitCount: number,
  ratings: readonly number[],
  aiFlags?: readonly boolean[],
): AssessmentItem[] {
  const items: AssessmentItem[] = [];
  const units = pack.competencyUnits.slice(0, unitCount);
  let cursor = 0;
  for (const unit of units) {
    unit.performanceCriteria.forEach((criterionText, i) => {
      const item: AssessmentItem = {
        itemId: performanceItemId(unit.id, i),
        assessmentId,
        unitId: unit.id,
        unitName: unit.name,
        kind: 'performance',
        criterionText,
        rubricScore: ratings[cursor] as AssessmentItem['rubricScore'],
        scoredBy: assessorId,
        scoredAt,
      };
      if (aiFlags && aiFlags[cursor]) {
        item.aiProposedScore = ratings[cursor];
        item.aiAccepted = true;
      }
      cursor += 1;
      items.push(item);
    });
  }
  return items;
}

/**
 * Build the full demo write plan. `identity` supplies the resolved demo account
 * uids (or fallbacks). Deterministic for a given identity.
 */
export function buildDemoWritePlan(identity: DemoIdentity): DemoWrite[] {
  const writes: DemoWrite[] = [];
  const tag = { isDemoData: true, demoBatchId: DEMO_BATCH_ID };

  const pushDoc = (collection: string, docId: string, data: Record<string, unknown>) => {
    writes.push({ collection, docId, data: { ...data, ...tag } });
  };
  const pushItem = (assessmentId: string, item: AssessmentItem) => {
    const subDocId = item.itemId.replace(/\//g, '_').slice(0, 200) || 'item';
    writes.push({
      collection: RPL_ASSESSMENTS,
      docId: assessmentId,
      subcollection: 'items',
      subDocId,
      data: { ...(item as unknown as Record<string, unknown>), ...tag },
    });
  };
  const pushEvidence = (
    assessmentId: string,
    imageId: string,
    workerId: string,
    unitId: string,
    uploadedAt: number,
  ) => {
    writes.push({
      collection: RPL_ASSESSMENTS,
      docId: assessmentId,
      subcollection: 'evidence',
      subDocId: imageId,
      data: {
        imageId,
        assessmentId,
        workerId,
        unitId,
        dataUrl: EVIDENCE_PNG,
        mimeType: 'image/png',
        sizeBytes: 95,
        uploadedBy: identity.assessor1Id,
        uploadedAt,
        ...tag,
      },
    });
  };

  // ------------------------------------------------------------------
  // 1. Six candidates.
  // ------------------------------------------------------------------
  const sureshId = identity.candidate1Id;
  const sureshDeclarationAt = NOW - 6 * DAY;

  const elePack = packById('ELE/Q1301');
  const conPack = packById('CON/Q0304');
  const sscPack = packById('SSC/Q2212');

  const workers: Array<{ id: string; data: Record<string, unknown> }> = [
    {
      id: sureshId,
      data: {
        uid: sureshId,
        name: 'Suresh Kumar',
        trade: 'Electrician',
        sector: 'Construction',
        yearsExperience: 8,
        location: 'Maharashtra',
        employerType: 'informal',
        declarationSubmittedAt: sureshDeclarationAt,
        assessmentReferenceCode: DEMO_REFERENCE_CODES.suresh,
        status: 'certified',
        declaration: declaration(
          sureshId,
          'Electrician',
          'Construction',
          8,
          'Maharashtra',
          'informal',
          'I have worked as an electrician for 8 years in Maharashtra doing house wiring, conduit installation, fault repair and circuit testing.',
          'ELE/Q1301',
          [
            { unitId: 'ELE/N1301', status: 'done' },
            { unitId: 'ELE/N1302', status: 'can-do' },
            { unitId: 'ELE/N1303', status: 'can-do' },
            { unitId: 'ELE/N1304', status: 'done' },
          ],
          '8 years house and site wiring in Nashik; installed conduit and distribution boards; repaired motors and fans; can test circuits with multimeter.',
        ),
        createdAt: sureshDeclarationAt,
        updatedAt: NOW,
      },
    },
    {
      id: 'demo-meena-devi',
      data: {
        uid: 'demo-meena-devi',
        name: 'Meena Devi',
        trade: 'Plumber',
        sector: 'Construction',
        yearsExperience: 5,
        location: 'Rajasthan',
        employerType: 'self-employed',
        declarationSubmittedAt: NOW - 5 * DAY,
        assessmentReferenceCode: DEMO_REFERENCE_CODES.meena,
        status: 'assessed',
        declaration: declaration(
          'demo-meena-devi',
          'Plumber',
          'Construction',
          5,
          'Rajasthan',
          'self-employed',
          'I have done plumbing work for 5 years in Jaipur: water supply lines, drainage fitting, leak repair and sanitary installation.',
          'CON/Q0304',
          [
            { unitId: 'CON/N0304-1', status: 'done' },
            { unitId: 'CON/N0304-2', status: 'can-do' },
            { unitId: 'CON/N0304-3', status: 'done' },
            { unitId: 'CON/N0304-4', status: 'can-do' },
          ],
          '5 years residential plumbing in Jaipur; fitted tanks, taps and traps; cleared blockages; tested supply lines for leaks.',
        ),
        createdAt: NOW - 5 * DAY,
        updatedAt: NOW,
      },
    },
    {
      id: 'demo-ravi-shankar',
      data: {
        uid: 'demo-ravi-shankar',
        name: 'Ravi Shankar',
        trade: 'Data Entry Operator',
        sector: 'IT-ITeS',
        yearsExperience: 3,
        location: 'Tamil Nadu',
        employerType: 'formal',
        declarationSubmittedAt: NOW - 4 * DAY,
        assessmentReferenceCode: DEMO_REFERENCE_CODES.ravi,
        status: 'declared',
        declaration: declaration(
          'demo-ravi-shankar',
          'Data Entry Operator',
          'IT-ITeS',
          3,
          'Tamil Nadu',
          'formal',
          'I have done data entry for 3 years in Chennai: typing from registers, validating formats, file backup and basic computer operation.',
          'SSC/Q2212',
          [
            { unitId: 'SSC/N2212-1', status: 'done' },
            { unitId: 'SSC/N2212-2', status: 'can-do' },
            { unitId: 'SSC/N2212-3', status: 'can-do' },
            { unitId: 'SSC/N2212-4', status: 'done' },
          ],
          '3 years back-office data entry in Chennai; 30 wpm with validation; maintained Excel logs and daily backups.',
        ),
        createdAt: NOW - 4 * DAY,
        updatedAt: NOW,
      },
    },
    {
      id: 'demo-anita-kumari',
      data: {
        uid: 'demo-anita-kumari',
        name: 'Anita Kumari',
        trade: 'Electrician',
        sector: 'Construction',
        yearsExperience: 6,
        location: 'Bihar',
        employerType: 'informal',
        declarationSubmittedAt: NOW - 3 * DAY,
        assessmentReferenceCode: DEMO_REFERENCE_CODES.anita,
        status: 'declared',
        declaration: declaration(
          'demo-anita-kumari',
          'Electrician',
          'Construction',
          6,
          'Bihar',
          'informal',
          'Six years of electrical installation and panel wiring in Patna, including safety checks and meter testing.',
          'ELE/Q1301',
          [
            { unitId: 'ELE/N1301', status: 'done' },
            { unitId: 'ELE/N1302', status: 'can-do' },
            { unitId: 'ELE/N1303', status: 'never' },
            { unitId: 'ELE/N1304', status: 'can-do' },
          ],
          'Panel wiring and safety audits on residential projects in Patna.',
        ),
        createdAt: NOW - 3 * DAY,
        updatedAt: NOW,
      },
    },
    {
      id: 'demo-mohammed-irfan',
      data: {
        uid: 'demo-mohammed-irfan',
        name: 'Mohammed Irfan',
        trade: 'Plumber',
        sector: 'Construction',
        yearsExperience: 4,
        location: 'Telangana',
        employerType: 'informal',
        declarationSubmittedAt: NOW - 3 * DAY,
        assessmentReferenceCode: DEMO_REFERENCE_CODES.mohammed,
        status: 'declared',
        declaration: declaration(
          'demo-mohammed-irfan',
          'Plumber',
          'Construction',
          4,
          'Telangana',
          'informal',
          'Four years of drainage and water supply work in Hyderabad, including fittings and blockage repair.',
          'CON/Q0304',
          [
            { unitId: 'CON/N0304-1', status: 'can-do' },
            { unitId: 'CON/N0304-2', status: 'done' },
            { unitId: 'CON/N0304-3', status: 'can-do' },
            { unitId: 'CON/N0304-4', status: 'can-do' },
          ],
          'Drainage layouts and sanitary fitting installations in Hyderabad.',
        ),
        createdAt: NOW - 3 * DAY,
        updatedAt: NOW,
      },
    },
    {
      id: 'demo-lakshmi-nair',
      data: {
        uid: 'demo-lakshmi-nair',
        name: 'Lakshmi Nair',
        trade: 'Data Entry Operator',
        sector: 'IT-ITeS',
        yearsExperience: 6,
        location: 'Kerala',
        employerType: 'formal',
        declarationSubmittedAt: NOW - 7 * DAY,
        assessmentReferenceCode: DEMO_REFERENCE_CODES.lakshmi,
        status: 'certified',
        declaration: declaration(
          'demo-lakshmi-nair',
          'Data Entry Operator',
          'IT-ITeS',
          6,
          'Kerala',
          'formal',
          'Six years of structured data entry and validation for a logistics firm, including reporting and backups.',
          'SSC/Q2212',
          [
            { unitId: 'SSC/N2212-1', status: 'done' },
            { unitId: 'SSC/N2212-2', status: 'done' },
            { unitId: 'SSC/N2212-3', status: 'can-do' },
            { unitId: 'SSC/N2212-4', status: 'done' },
          ],
          'Logistics data entry, validation and reporting in Kochi; strong accuracy record.',
        ),
        createdAt: NOW - 7 * DAY,
        updatedAt: NOW,
      },
    },
  ];

  for (const w of workers) pushDoc(RPL_WORKERS, w.id, w.data);

  // ------------------------------------------------------------------
  // 2. Submitted assessor pairs (two assessors per worker -> real kappa).
  // ------------------------------------------------------------------
  const submittedAt = NOW - 1 * DAY;

  const pushAssessment = (
    assessmentId: string,
    pack: NSQFQualificationPack,
    workerId: string,
    workerName: string,
    referenceCode: string,
    assessorId: string,
    ratings: readonly number[],
    aiFlags: readonly boolean[] | undefined,
    isDraft: boolean,
  ) => {
    const items = buildItems(pack, assessmentId, assessorId, submittedAt, 2, ratings, aiFlags);
    const scoreFields = computeAssessmentScores(items, pack);
    const aiSuggestionUsed = items.some((it) => it.aiAccepted === true);
    const base: Record<string, unknown> = {
      assessorId,
      workerId,
      assessmentId,
      packId: pack.id,
      status: isDraft ? 'draft' : 'submitted',
      aiSuggestionUsed,
      overallScore: scoreFields.overallScore,
      unitScores: scoreFields.unitScores,
      scores: scoreFields.scores,
      createdAt: NOW - 2 * DAY,
      workerName,
      referenceCode,
    };
    if (!isDraft) base.submittedAt = submittedAt;
    pushDoc(RPL_ASSESSMENTS, assessmentId, base);
    for (const item of items) pushItem(assessmentId, item);
    return { items, scoreFields };
  };

  // Suresh / ELE — the required conflicting pair (kappa < 0.4 -> alert).
  pushAssessment(
    'demo-suresh-ele-a1',
    elePack,
    sureshId,
    'Suresh Kumar',
    DEMO_REFERENCE_CODES.suresh,
    identity.assessor1Id,
    DEMO_RATINGS.ele.a,
    undefined,
    false,
  );
  pushAssessment(
    'demo-suresh-ele-a2',
    elePack,
    sureshId,
    'Suresh Kumar',
    DEMO_REFERENCE_CODES.suresh,
    identity.assessor2Id,
    DEMO_RATINGS.ele.b,
    undefined,
    false,
  );
  pushEvidence('demo-suresh-ele-a1', 'demo-evidence-suresh-1', sureshId, 'ELE/N1301', submittedAt);
  pushEvidence('demo-suresh-ele-a1', 'demo-evidence-suresh-2', sureshId, 'ELE/N1302', submittedAt);

  // Meena / CON — AI-assisted pair (aiSuggestionUsed = true) with 8 items each.
  pushAssessment(
    'demo-meena-con-a1',
    conPack,
    'demo-meena-devi',
    'Meena Devi',
    DEMO_REFERENCE_CODES.meena,
    identity.assessor1Id,
    DEMO_RATINGS.con.a,
    [true, true, false, true, false, true, false, false],
    false,
  );
  pushAssessment(
    'demo-meena-con-a2',
    conPack,
    'demo-meena-devi',
    'Meena Devi',
    DEMO_REFERENCE_CODES.meena,
    identity.assessor2Id,
    DEMO_RATINGS.con.b,
    [false, true, false, true, true, false, false, false],
    false,
  );

  // Lakshmi / SSC — a second submitted pair (feeds the average kappa).
  pushAssessment(
    'demo-lakshmi-ssc-a1',
    sscPack,
    'demo-lakshmi-nair',
    'Lakshmi Nair',
    DEMO_REFERENCE_CODES.lakshmi,
    identity.assessor1Id,
    DEMO_RATINGS.ssc.a,
    undefined,
    false,
  );
  pushAssessment(
    'demo-lakshmi-ssc-a2',
    sscPack,
    'demo-lakshmi-nair',
    'Lakshmi Nair',
    DEMO_REFERENCE_CODES.lakshmi,
    identity.assessor2Id,
    DEMO_RATINGS.ssc.b,
    undefined,
    false,
  );

  // ------------------------------------------------------------------
  // 3. Draft assessments -> populated assessor queues (assessor1 & assessor2).
  // ------------------------------------------------------------------
  pushAssessment(
    'demo-ravi-ssc-draft',
    sscPack,
    'demo-ravi-shankar',
    'Ravi Shankar',
    DEMO_REFERENCE_CODES.ravi,
    identity.assessor1Id,
    DEMO_RATINGS.ssc.a,
    undefined,
    true,
  );
  pushAssessment(
    'demo-anita-ele-draft',
    elePack,
    'demo-anita-kumari',
    'Anita Kumari',
    DEMO_REFERENCE_CODES.anita,
    identity.assessor2Id,
    DEMO_RATINGS.ele.b,
    undefined,
    true,
  );
  pushAssessment(
    'demo-mohammed-con-draft',
    conPack,
    'demo-mohammed-irfan',
    'Mohammed Irfan',
    DEMO_REFERENCE_CODES.mohammed,
    identity.assessor1Id,
    DEMO_RATINGS.con.a,
    undefined,
    true,
  );

  // ------------------------------------------------------------------
  // 4. Certifications: one pending sign-off (Suresh) + one certified (Lakshmi).
  // ------------------------------------------------------------------
  pushDoc(RPL_CERTIFICATIONS, sureshId, {
    workerId: sureshId,
    executiveUid: identity.adminUid,
    recommendedLevel: 4,
    status: 'pending_human_signoff',
    rationale:
      'Two assessors scored Suresh on ELE/Q1301 with low agreement (kappa < 0.4). Awaiting a calibration review and executive sign-off before certification.',
    requiredGapTraining: [],
    signedAt: NOW - 1 * DAY,
  });
  pushDoc(RPL_CERTIFICATIONS, 'demo-lakshmi-nair', {
    workerId: 'demo-lakshmi-nair',
    executiveUid: identity.adminUid,
    recommendedLevel: 3,
    status: 'recommend_certification',
    rationale:
      'Both assessors placed Lakshmi comfortably at NSQF Level 3 for SSC/Q2212 with substantial agreement. Certified for demonstration.',
    requiredGapTraining: [],
    signedAt: NOW - 1 * DAY,
  });

  return writes;
}
