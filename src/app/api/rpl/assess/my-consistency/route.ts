import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithAnyRole } from '@/lib/verify-auth';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import { RPL_ASSESSMENTS, RPL_CONSISTENCY, sanitizeRplDocId } from '@/lib/rpl/rpl-collections';
import type { AssessmentItem, RPLAssessmentDoc, RPLConsistencyDoc } from '@/lib/rpl/types';

export const runtime = 'nodejs';

// GET /api/rpl/assess/my-consistency — commander (own) or executive (?assessorId= to inspect).
// Derives the target assessor's packIds from their submitted assessments, reads
// rpl_consistency/{packId} keeping pairs involving them, and computes
// per-criterion calibration deltas (own mean vs panel mean on shared itemIds).
// Single-field where() only + in-memory filtering; never touches firestore.indexes.json.

interface MyPair {
  assessorA: string;
  assessorB: string;
  kappa: number;
}

interface MyPack {
  packId: string;
  packKappa: number | null;
  myPairs: MyPair[];
}

interface CriterionDelta {
  criterionId: string;
  criterionText: string;
  mine: number;
  panelAvg: number;
  delta: number;
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function isValidScore(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 4;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithAnyRole(req, ['commander', 'executive']);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // INLINE rate-limit config (do not touch Limits).
    const rl = await enforceRateLimit(`rpl:my-consistency:${auth.uid}`, {
      maxRequests: 30,
      windowMs: 60000,
      message: 'Too many requests. Please slow down.',
    });
    if (rl) return rl;

    const url = new URL(req.url);
    const requested = url.searchParams.get('assessorId');
    const targetAssessorId =
      auth.role === 'executive' && requested && requested.trim()
        ? requested.trim()
        : auth.uid;

    const db = getAdminDb();

    // Derive the target's packIds from their submitted, non-template assessments.
    const ownSnap = await db
      .collection(RPL_ASSESSMENTS)
      .where('assessorId', '==', targetAssessorId)
      .get();
    const ownSubmitted = ownSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Partial<RPLAssessmentDoc>) }))
      .filter((a) => a.status === 'submitted' && a.isTemplate !== true);
    const packIds = Array.from(
      new Set(
        ownSubmitted
          .map((a) => (typeof a.packId === 'string' ? a.packId : ''))
          .filter((p) => p.length > 0),
      ),
    ).sort();

    const packs: MyPack[] = [];
    for (const packId of packIds) {
      let packKappa: number | null = null;
      let myPairs: MyPair[] = [];
      try {
        const cSnap = await db.collection(RPL_CONSISTENCY).doc(sanitizeRplDocId(packId)).get();
        if (cSnap.exists) {
          const cData = cSnap.data() as Partial<RPLConsistencyDoc>;
          packKappa = finiteNumber(cData.kappa);
          const pairs = Array.isArray(cData.assessorPairs) ? cData.assessorPairs : [];
          myPairs = pairs
            .filter((p) => {
              if (typeof p !== 'object' || p === null) return false;
              const pair = p as { assessorA?: unknown; assessorB?: unknown; kappa?: unknown };
              return (
                (pair.assessorA === targetAssessorId || pair.assessorB === targetAssessorId) &&
                finiteNumber(pair.kappa) !== null
              );
            })
            .map((p) => {
              const pair = p as { assessorA: string; assessorB: string; kappa: number };
              return { assessorA: pair.assessorA, assessorB: pair.assessorB, kappa: pair.kappa };
            })
            .sort((x, y) => x.assessorA.localeCompare(y.assessorA) || x.assessorB.localeCompare(y.assessorB));
        }
      } catch {
        // Missing/unreadable consistency doc -> packKappa stays null, pairs empty.
      }
      packs.push({ packId, packKappa, myPairs });
    }

    // Per-criterion calibration: own mean vs panel mean on shared itemIds.
    // Panel = all other assessors' submitted, non-template assessments for the same packs.
    const mineByCriterion = new Map<string, { scores: number[]; text: string }>();
    const panelByCriterion = new Map<string, { scores: number[]; text: string }>();

    for (const packId of packIds) {
      const packSnap = await db.collection(RPL_ASSESSMENTS).where('packId', '==', packId).get();
      const relevant = packSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Partial<RPLAssessmentDoc>) }))
        .filter((a) => a.status === 'submitted' && a.isTemplate !== true);

      await Promise.all(
        relevant.map(async (a) => {
          const assessmentId = a.id;
          if (!assessmentId || typeof a.assessorId !== 'string' || !a.assessorId) return;
          const isMine = a.assessorId === targetAssessorId;
          let itemsSnap;
          try {
            itemsSnap = await db
              .collection(RPL_ASSESSMENTS)
              .doc(assessmentId)
              .collection('items')
              .get();
          } catch {
            return;
          }
          for (const itemDoc of itemsSnap.docs) {
            const item = itemDoc.data() as Partial<AssessmentItem>;
            const itemId = typeof item.itemId === 'string' ? item.itemId : itemDoc.id;
            if (!itemId || !isValidScore(item.rubricScore)) continue;
            const score = item.rubricScore as number;
            const text =
              typeof item.criterionText === 'string' && item.criterionText
                ? item.criterionText
                : itemId;
            const bucket = isMine ? mineByCriterion : panelByCriterion;
            const entry = bucket.get(itemId) ?? { scores: [], text };
            entry.scores.push(score);
            if (!entry.text && text) entry.text = text;
            bucket.set(itemId, entry);
          }
        }),
      );
    }

    const perCriterionDeltas: CriterionDelta[] = [];
    for (const [criterionId, mineEntry] of mineByCriterion.entries()) {
      const panelEntry = panelByCriterion.get(criterionId);
      if (!panelEntry) continue;
      const mine = mean(mineEntry.scores);
      const panelAvg = mean(panelEntry.scores);
      if (mine === null || panelAvg === null) continue;
      perCriterionDeltas.push({
        criterionId,
        criterionText: mineEntry.text || panelEntry.text || criterionId,
        mine,
        panelAvg,
        delta: mine - panelAvg,
      });
    }
    perCriterionDeltas.sort(
      (a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.criterionId.localeCompare(b.criterionId),
    );

    return NextResponse.json({ packs, perCriterionDeltas });
  } catch (err) {
    console.error('[RPL MyConsistency GET] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
