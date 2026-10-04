import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import { NSQF_PACKS } from '@/lib/rpl/nsqf-packs';
import { RPL_ASSESSMENTS, RPL_CERTIFICATIONS } from '@/lib/rpl/rpl-collections';
import {
  generateCertificationRecommendation,
  generateCompetencyProfile,
} from '@/lib/rpl/competency-profile';
import type {
  AssessmentItem,
  RPLAssessmentDoc,
  RPLCertificationDoc,
} from '@/lib/rpl/types';

export const runtime = 'nodejs';

// POST /api/rpl/certify — executive-only certification sign-off.
// Body: { workerId, packId, assessorNotes, decision: 'certify' | 'reassess' }.
// The profile is recomputed server-side with the same lib as the profile GET
// (never trusted from the client). The stored status comes ONLY from the
// executive decision plus this signed write (executiveUid + signedAt) — the
// lib's draft recommendation is advisory text and can never auto-approve.
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // INLINE rate-limit config (do not touch Limits).
    const rl = await enforceRateLimit(`rpl:certify:${auth.uid}`, {
      maxRequests: 15,
      windowMs: 60000,
      message: 'Too many certification operations. Please slow down.',
    });
    if (rl) return rl;

    const body = (await req.json().catch(() => null)) as {
      workerId?: unknown;
      packId?: unknown;
      assessorNotes?: unknown;
      decision?: unknown;
    } | null;
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const workerId = typeof body.workerId === 'string' ? body.workerId.trim() : '';
    if (!workerId) {
      return NextResponse.json({ error: 'workerId is required' }, { status: 400 });
    }
    const packId = typeof body.packId === 'string' ? body.packId.trim() : '';
    if (!packId) {
      return NextResponse.json({ error: 'packId is required' }, { status: 400 });
    }
    const assessorNotes = typeof body.assessorNotes === 'string' ? body.assessorNotes : '';
    if (assessorNotes.length > 2000) {
      return NextResponse.json(
        { error: 'assessorNotes must be at most 2000 characters' },
        { status: 400 },
      );
    }
    if (body.decision !== 'certify' && body.decision !== 'reassess') {
      return NextResponse.json({ error: "decision must be 'certify' or 'reassess'" }, { status: 400 });
    }
    const decision = body.decision;

    const pack = NSQF_PACKS.find((p) => p.id === packId);
    if (!pack) {
      return NextResponse.json({ error: 'Unknown packId' }, { status: 400 });
    }

    const db = getAdminDb();

    // Single-field where() on workerId; submitted/non-template/pack filtering
    // in memory (never touch firestore.indexes.json).
    const snap = await db.collection(RPL_ASSESSMENTS).where('workerId', '==', workerId).get();
    const submitted = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Partial<RPLAssessmentDoc>) }))
      .filter((a) => a.status === 'submitted' && a.isTemplate !== true && a.packId === packId)
      .sort((a, b) => (b.submittedAt ?? b.createdAt ?? 0) - (a.submittedAt ?? a.createdAt ?? 0));
    if (submitted.length === 0) {
      return NextResponse.json(
        { error: 'No submitted assessments found for worker and pack' },
        { status: 404 },
      );
    }

    // Pool items across the worker's submitted assessments for this pack.
    const items: AssessmentItem[] = [];
    await Promise.all(
      submitted.map(async (a) => {
        try {
          const itemsSnap = await db
            .collection(RPL_ASSESSMENTS)
            .doc(a.id)
            .collection('items')
            .get();
          for (const doc of itemsSnap.docs) {
            const data = doc.data() as Partial<AssessmentItem>;
            if (typeof data.itemId !== 'string' || !data.itemId) continue;
            if (typeof data.unitId !== 'string' || !data.unitId) continue;
            if (typeof data.criterionText !== 'string' || !data.criterionText) continue;
            if (data.kind !== 'performance' && data.kind !== 'knowledge') continue;
            items.push({ ...(data as AssessmentItem), assessmentId: a.id });
          }
        } catch {
          // Missing items subcollection -> treat as zero items for this doc.
        }
      }),
    );

    // Recompute server-side with the shared lib (same functions as GET).
    const profile = generateCompetencyProfile(items, pack);
    profile.workerId = workerId;

    // Advisory rationale text from the lib (cites scores + assessorNotes).
    // The persisted status/requiredGapTraining below are set from the
    // executive decision, not from the draft advisory status.
    const draft = generateCertificationRecommendation(profile, assessorNotes);
    const nonCompetentUnitNames = Object.entries(profile.unitScores ?? {})
      .filter(([, u]) => u.status !== 'competent')
      .map(([unitId, u]) => u.unitName ?? unitId);

    const doc: RPLCertificationDoc = {
      workerId,
      recommendedLevel: profile.nsqfLevelRecommended,
      status: decision === 'certify' ? 'recommend_certification' : 'recommend_reassessment',
      rationale: draft.rationale,
      requiredGapTraining: decision === 'certify' ? [] : nonCompetentUnitNames,
      executiveUid: auth.uid,
      signedAt: Date.now(),
      assessorNotes,
    };

    await db.collection(RPL_CERTIFICATIONS).doc(workerId).set(doc, { merge: true });

    return NextResponse.json(doc);
  } catch (err) {
    console.error('[RPL Certify POST] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
