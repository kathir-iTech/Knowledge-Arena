import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verify-auth';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import { NSQF_PACKS } from '@/lib/rpl/nsqf-packs';
import { RPL_ASSESSMENTS, RPL_WORKERS } from '@/lib/rpl/rpl-collections';
import { isReferenceCode } from '@/lib/rpl/reference-code';
import {
  generateCertificationRecommendation,
  generateCompetencyProfile,
} from '@/lib/rpl/competency-profile';
import type { AssessmentItem, EvidenceImageDoc, RPLAssessmentDoc } from '@/lib/rpl/types';

export const runtime = 'nodejs';

// GET /api/rpl/profile/[workerId] — competency profile + draft recommendation.
// Auth: 401 when unauthenticated; worker (candidate/gladiator) may read ONLY
// their own record (uid == workerId), assessor/admin (both vocabs) may read
// any record (403 otherwise). ?packId selects the pack; default is the
// pack of the latest submitted non-template assessment.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workerId: string }> },
) {
  try {
    const caller = await verifyFirebaseToken(req);
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // INLINE rate-limit config (do not touch Limits).
    const rl = await enforceRateLimit(`rpl:profile:${caller.uid}`, {
      maxRequests: 30,
      windowMs: 60000,
      message: 'Too many profile requests. Please slow down.',
    });
    if (rl) return rl;

    const { workerId: rawParam } = await params;
    const rawWorkerId = (rawParam ?? '').trim();
    if (!rawWorkerId) {
      return NextResponse.json({ error: 'Missing workerId' }, { status: 400 });
    }

    const db = getAdminDb();

    // B2: the URL param may be the caller's own uid OR a human reference code.
    // Resolve a reference code to its worker doc id so /rpl/profile/<code>
    // never exposes (or requires) a UID in the browser URL. Authorization is
    // checked below against the RESOLVED id.
    let workerId = rawWorkerId;
    let referenceCode: string | null = isReferenceCode(rawWorkerId) ? rawWorkerId : null;
    if (isReferenceCode(rawWorkerId)) {
      const byRef = await db
        .collection(RPL_WORKERS)
        .where('assessmentReferenceCode', '==', rawWorkerId)
        .limit(1)
        .get();
      if (byRef.empty) {
        return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
      }
      workerId = byRef.docs[0].id;
    } else {
      // uid (or legacy id): try to surface the human code for display only.
      try {
        const workerDoc = await db.collection(RPL_WORKERS).doc(workerId).get();
        const code = workerDoc.data()?.assessmentReferenceCode;
        if (isReferenceCode(code)) referenceCode = code;
      } catch {
        referenceCode = null;
      }
    }

    let role: string | undefined;
    try {
      const callerDoc = await db.collection('users').doc(caller.uid).get();
      role = callerDoc.exists ? (callerDoc.data()?.role as string | undefined) : undefined;
    } catch {
      role = undefined;
    }
    const isPrivileged =
      role === 'commander' || role === 'executive' || role === 'assessor' || role === 'admin';
    if (!isPrivileged && caller.uid !== workerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Single-field where() on workerId; submitted/non-template/newest-pack
    // filtering happens in memory (never touch firestore.indexes.json).
    const snap = await db.collection(RPL_ASSESSMENTS).where('workerId', '==', workerId).get();
    const submitted = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Partial<RPLAssessmentDoc>) }))
      .filter((a) => a.status === 'submitted' && a.isTemplate !== true)
      .sort((a, b) => (b.submittedAt ?? b.createdAt ?? 0) - (a.submittedAt ?? a.createdAt ?? 0));
    if (submitted.length === 0) {
      return NextResponse.json(
        { error: 'No submitted assessments found for worker' },
        { status: 404 },
      );
    }

    const { searchParams } = new URL(req.url);
    const requestedPackId = (searchParams.get('packId') ?? '').trim();
    const defaultPackId = typeof submitted[0].packId === 'string' ? submitted[0].packId : '';
    const packId = requestedPackId || defaultPackId;
    if (!packId) {
      return NextResponse.json({ error: 'Could not resolve packId' }, { status: 400 });
    }
    const pack = NSQF_PACKS.find((p) => p.id === packId);
    if (!pack) {
      return NextResponse.json({ error: 'Unknown packId' }, { status: 400 });
    }

    const packAssessments = submitted.filter((a) => a.packId === packId);
    if (packAssessments.length === 0) {
      return NextResponse.json(
        { error: 'No submitted assessments found for worker and pack' },
        { status: 404 },
      );
    }
    const newest = packAssessments[0];

    // Pool items across all submitted assessments for this worker+pack.
    const items: AssessmentItem[] = [];
    await Promise.all(
      packAssessments.map(async (a) => {
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

    const profile = generateCompetencyProfile(items, pack);
    profile.workerId = workerId;

    const assessorNotes = typeof newest.notes === 'string' ? newest.notes : '';
    const recommendation = generateCertificationRecommendation(profile, assessorNotes);

    // Rollup onto the newest assessment doc (set-merge). The admin overview
    // aggregation reads overallScore / unitScores defensively, so this keeps
    // the pack averages fresh without a dedicated aggregation job.
    try {
      await db
        .collection(RPL_ASSESSMENTS)
        .doc(newest.id)
        .set({ overallScore: profile.overallScore, unitScores: profile.unitScores }, { merge: true });
    } catch (err) {
      console.error(
        '[RPL Profile] rollup write failed:',
        err instanceof Error ? err.message : String(err),
      );
    }

    // Defensive evidence read: a LATER agent stores evidence images under
    // rpl_assessments/{id}/evidence; absent subcollections yield [].
    const evidence: EvidenceImageDoc[] = [];
    await Promise.all(
      packAssessments.map(async (a) => {
        try {
          const evSnap = await db
            .collection(RPL_ASSESSMENTS)
            .doc(a.id)
            .collection('evidence')
            .get();
          for (const doc of evSnap.docs) {
            const data = doc.data() as Partial<EvidenceImageDoc>;
            evidence.push({
              imageId: typeof data.imageId === 'string' && data.imageId ? data.imageId : doc.id,
              assessmentId: a.id,
              workerId,
              unitId: typeof data.unitId === 'string' ? data.unitId : '',
              dataUrl: typeof data.dataUrl === 'string' ? data.dataUrl : '',
              mimeType: typeof data.mimeType === 'string' ? data.mimeType : '',
              sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : 0,
              uploadedBy: typeof data.uploadedBy === 'string' ? data.uploadedBy : '',
              uploadedAt: typeof data.uploadedAt === 'number' ? data.uploadedAt : 0,
            });
          }
        } catch {
          // Absent evidence subcollection -> contributes nothing.
        }
      }),
    );

    return NextResponse.json({ profile, recommendation, evidence, referenceCode });
  } catch (err) {
    console.error('[RPL Profile GET] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
