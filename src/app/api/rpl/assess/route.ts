import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithAnyRole } from '@/lib/verify-auth';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import { RPL_ASSESSMENTS } from '@/lib/rpl/rpl-collections';
import { NSQF_PACKS } from '@/lib/rpl/nsqf-packs';
import { computeAssessmentScores } from '@/lib/rpl/scores';
import { firestoreItemId } from '@/lib/rpl/item-ids';
import type { AssessmentItem, RPLAssessmentDoc } from '@/lib/rpl/types';

export const runtime = 'nodejs';

// RPL assessor queue + save endpoint (Assessor/Admin, both vocabs, read;
// Assessor/Admin write).
// - GET: assessor/commander see own assessments (assessorId == uid),
//   executive/admin see all. Single-field where() only + in-memory filter; docs
//   with isTemplate == true (forge template contract) are always excluded.
//   Sorted by createdAt desc.
// - POST: assessor/commander/executive/admin. Writes rpl_assessments/{assessmentId}
//   (set-merge) plus all items into the items subcollection via batched
//   writes (chunk 500).

type AssessmentRow = Partial<RPLAssessmentDoc> & { id: string };

const QUEUE_ROLES = ['commander', 'executive', 'assessor', 'admin'] as const;
const WRITER_ROLES = ['commander', 'assessor', 'executive', 'admin'] as const;

function toRow(id: string, data: Record<string, unknown>): AssessmentRow {
  return { id, ...(data as Partial<RPLAssessmentDoc>) };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithAnyRole(req, QUEUE_ROLES);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // INLINE rate-limit config (do not touch Limits).
    const rl = await enforceRateLimit(`rpl:assess-list:${auth.uid}`, {
      maxRequests: 30,
      windowMs: 60000,
      message: 'Too many assessment requests. Please slow down.',
    });
    if (rl) return rl;

    const db = getAdminDb();
    // Privileged callers (executive/admin) see all; assessor/commander only ever see their OWN queue.
    const snap =
      auth.role !== 'executive' && auth.role !== 'admin'
        ? await db.collection(RPL_ASSESSMENTS).where('assessorId', '==', auth.uid).get()
        : await db.collection(RPL_ASSESSMENTS).get();

    const rows = snap.docs
      .map((d) => toRow(d.id, d.data() as Record<string, unknown>))
      .filter((row) => row.isTemplate !== true)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    return NextResponse.json({ assessments: rows });
  } catch (err) {
    console.error('[RPL Assess GET] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function isRubricScore(v: unknown): v is 1 | 2 | 3 | 4 {
  return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 4;
}

function isValidItem(raw: unknown): raw is AssessmentItem {
  if (typeof raw !== 'object' || raw === null) return false;
  const item = raw as Record<string, unknown>;
  if (typeof item.itemId !== 'string' || !item.itemId.trim()) return false;
  if (typeof item.unitId !== 'string' || !item.unitId.trim()) return false;
  if (typeof item.criterionText !== 'string' || !item.criterionText.trim()) return false;
  if (item.kind !== 'performance' && item.kind !== 'knowledge') return false;
  if (typeof item.rubricScore !== 'undefined' && !isRubricScore(item.rubricScore)) return false;
  if (typeof item.note !== 'undefined') {
    if (typeof item.note !== 'string' || item.note.length > 200) return false;
  }
  if (typeof item.knowledgePass !== 'undefined' && typeof item.knowledgePass !== 'boolean') {
    return false;
  }
  if (typeof item.aiProposedScore !== 'undefined' && typeof item.aiProposedScore !== 'number') {
    return false;
  }
  if (typeof item.aiAccepted !== 'undefined' && typeof item.aiAccepted !== 'boolean') return false;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithAnyRole(req, WRITER_ROLES);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // INLINE rate-limit config (do not touch Limits).
    const rl = await enforceRateLimit(`rpl:assess-save:${auth.uid}`, {
      maxRequests: 15,
      windowMs: 60000,
      message: 'Assessment save limit reached (15/min). Please wait.',
    });
    if (rl) return rl;

    const body = (await req.json().catch(() => null)) as {
      assessmentId?: unknown;
      workerId?: unknown;
      packId?: unknown;
      items?: unknown;
      status?: unknown;
      notes?: unknown;
      workerName?: unknown;
      referenceCode?: unknown;
    } | null;
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

    const { assessmentId, workerId, packId, items, status, notes, workerName, referenceCode } = body;

    if (typeof assessmentId !== 'string' || !assessmentId.trim() || assessmentId.includes('/')) {
      return NextResponse.json({ error: 'assessmentId must be a non-empty doc id (no slashes)' }, { status: 400 });
    }
    if (typeof workerId !== 'string' || !workerId.trim()) {
      return NextResponse.json({ error: 'workerId is required' }, { status: 400 });
    }
    if (typeof packId !== 'string' || !packId.trim()) {
      return NextResponse.json({ error: 'packId is required' }, { status: 400 });
    }
    // Score fields are computed from the pack's units (shared scoring lib),
    // so an unknown packId must fail visibly — never write an unscored doc.
    const pack = NSQF_PACKS.find((p) => p.id === packId);
    if (!pack) {
      return NextResponse.json({ error: `Unknown packId: ${packId}` }, { status: 400 });
    }
    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'items must be an array' }, { status: 400 });
    }
    if (status !== 'draft' && status !== 'submitted') {
      return NextResponse.json({ error: "status must be 'draft' or 'submitted'" }, { status: 400 });
    }
    if (typeof notes !== 'undefined' && (typeof notes !== 'string' || notes.length > 200)) {
      return NextResponse.json({ error: 'notes must be a string of max 200 chars' }, { status: 400 });
    }
    const invalidIndex = items.findIndex((item) => !isValidItem(item));
    if (invalidIndex >= 0) {
      return NextResponse.json(
        { error: `items[${invalidIndex}] invalid: rubricScore must be 1-4 and notes max 200 chars` },
        { status: 400 },
      );
    }
    const validItems = items as AssessmentItem[];

    // aiSuggestionUsed drives the kappa baseline split: true only when the
    // assessor ACCEPTED an AI-proposed score AND it was actually applied —
    // i.e. the persisted rubricScore equals the aiProposedScore on at least
    // one item. A stray/forged `aiAccepted:true` with a different (or missing)
    // score does NOT count, so a client cannot inflate the assisted baseline.
    const aiSuggestionUsed = validItems.some(
      (item) =>
        item.aiAccepted === true &&
        typeof item.rubricScore === 'number' &&
        item.aiProposedScore === item.rubricScore,
    );

    const db = getAdminDb();
    const now = Date.now();
    const docRef = db.collection(RPL_ASSESSMENTS).doc(assessmentId);
    const existing = await docRef.get().catch(() => null);
    const existingData =
      existing && existing.exists ? (existing.data() as Partial<RPLAssessmentDoc>) : null;
    const createdAt =
      existingData && typeof existingData.createdAt === 'number' ? existingData.createdAt : now;

    // D2 fix: persist the score fields the admin overview reads. Same
    // formula as the competency profile (shared src/lib/rpl/scores.ts), so
    // doc-level scores can never disagree with the profile/certify path.
    const scoreFields = computeAssessmentScores(validItems, pack);

    const parentData: Record<string, unknown> = {
      assessorId: auth.uid,
      workerId,
      packId,
      status,
      aiSuggestionUsed,
      overallScore: scoreFields.overallScore,
      unitScores: scoreFields.unitScores,
      scores: scoreFields.scores,
      createdAt,
      updatedAt: now,
    };
    if (status === 'submitted') {
      parentData.submittedAt = now;
    } else if (existingData && typeof existingData.submittedAt === 'number') {
      parentData.submittedAt = existingData.submittedAt;
    }
    // workerName / referenceCode are display passthrough from the queue.
    if (typeof workerName === 'string' && workerName.trim()) parentData.workerName = workerName;
    if (typeof referenceCode === 'string' && referenceCode.trim()) {
      parentData.referenceCode = referenceCode;
    }
    if (typeof notes === 'string' && notes.length > 0) parentData.notes = notes;

    const ops: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }> = [
      { ref: docRef, data: parentData },
    ];
    for (const item of validItems) {
      const itemData: Record<string, unknown> = {
        itemId: item.itemId,
        assessmentId,
        unitId: item.unitId,
        kind: item.kind,
        criterionText: item.criterionText,
        scoredBy: auth.uid,
        scoredAt: now,
      };
      if (typeof item.unitName === 'string' && item.unitName) itemData.unitName = item.unitName;
      if (isRubricScore(item.rubricScore)) itemData.rubricScore = item.rubricScore;
      if (typeof item.note === 'string' && item.note.length > 0) itemData.note = item.note;
      if (typeof item.knowledgePass === 'boolean') itemData.knowledgePass = item.knowledgePass;
      if (typeof item.aiProposedScore === 'number') itemData.aiProposedScore = item.aiProposedScore;
      if (typeof item.aiAccepted === 'boolean') itemData.aiAccepted = item.aiAccepted;
      ops.push({
        ref: docRef.collection('items').doc(firestoreItemId(item.itemId)),
        data: itemData,
      });
    }
    // ONE logical batch: parent doc + all items, committed in 500-op chunks.
    for (let i = 0; i < ops.length; i += 500) {
      const batch = db.batch();
      for (const op of ops.slice(i, i + 500)) batch.set(op.ref, op.data, { merge: true });
      await batch.commit();
    }

    // [SIH-RPL] post-save hooks run here
    // (a later agent appends the kappa-recompute trigger after the batch commit).
    // Kappa-recompute trigger (P15): awaited for demo determinism, never fails the save.
    try {
      const { recomputePackConsistency } = await import('@/lib/rpl/recompute-consistency');
      await recomputePackConsistency(packId as string);
    } catch (err) {
      console.warn(
        '[RPL Assess POST] consistency recompute failed (non-fatal):',
        err instanceof Error ? err.message : String(err),
      );
    }

    return NextResponse.json({
      assessmentId,
      status,
      aiSuggestionUsed,
      itemCount: validItems.length,
      overallScore: scoreFields.overallScore,
    });
  } catch (err) {
    console.error('[RPL Assess POST] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
