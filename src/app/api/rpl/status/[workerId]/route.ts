import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { NSQF_PACKS, findBestMatchingPacks } from '@/lib/rpl/nsqf-packs';
import {
  RPL_ASSESSMENTS,
  RPL_CERTIFICATIONS,
  RPL_WORKERS,
} from '@/lib/rpl/rpl-collections';
import type {
  MatchedPackSummary,
  RPLAssessmentDoc,
  RPLStage,
  RPLWorkerDoc,
  StatusResponse,
} from '@/lib/rpl/types';

export const runtime = 'nodejs';

// GET /api/rpl/status/[workerId] — worker declaration status.
// Auth: 401 when unauthenticated; commander/executive may read any record,
// any other authenticated caller may read ONLY their own (uid == workerId).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workerId: string }> },
) {
  try {
    const caller = await verifyFirebaseToken(req);
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workerId: rawParam } = await params;
    const workerIdParam = (rawParam ?? '').trim();
    if (!workerIdParam) {
      return NextResponse.json({ error: 'Missing workerId' }, { status: 400 });
    }

    const db = getAdminDb();

    // Primary path: direct read of rpl_workers/{workerId}. Fallback: the
    // ?ref= contract may carry the human-readable assessmentReferenceCode,
    // so resolve it via a single-field where() when the direct read misses.
    let docId = workerIdParam;
    let workerSnap = await db.collection(RPL_WORKERS).doc(workerIdParam).get();
    if (!workerSnap.exists) {
      const byRef = await db
        .collection(RPL_WORKERS)
        .where('assessmentReferenceCode', '==', workerIdParam)
        .limit(1)
        .get();
      if (byRef.empty) {
        return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
      }
      docId = byRef.docs[0].id;
      workerSnap = byRef.docs[0];
    }

    // Role check AFTER resolving the record so the ?ref= fallback still
    // enforces "worker sees only own record" against the resolved id.
    let role: string | undefined;
    try {
      const callerDoc = await db.collection('users').doc(caller.uid).get();
      role = callerDoc.exists
        ? (callerDoc.data()?.role as string | undefined)
        : undefined;
    } catch {
      role = undefined;
    }
    const isPrivileged = role === 'commander' || role === 'executive';
    if (!isPrivileged && caller.uid !== docId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const worker = workerSnap.data() as RPLWorkerDoc;
    const declaration = worker.declaration;
    const trade = (declaration?.trade ?? worker.trade ?? '').trim();

    // Resolve matched packs against NSQF_PACKS. Stored pack ids win; the
    // matcher (findBestMatchingPacks) runs ONLY when the stored doc lacks
    // usable pack ids, in which case its implicated units are used directly.
    // Otherwise matchedUnits = all unit names of each stored pack.
    const storedPackIds = Array.isArray(declaration?.matchedPacks)
      ? declaration.matchedPacks.filter(
          (id): id is string => typeof id === 'string' && id.trim().length > 0,
        )
      : [];
    let matchedPacks: MatchedPackSummary[] = [];
    if (storedPackIds.length > 0) {
      for (const packId of storedPackIds) {
        const pack = NSQF_PACKS.find((p) => p.id === packId);
        if (!pack) continue;
        matchedPacks.push({
          packId: pack.id,
          title: pack.title,
          nsqfLevel: pack.nsqfLevel,
          matchedUnits: pack.competencyUnits.map((u) => u.name),
        });
      }
    }
    if (matchedPacks.length === 0) {
      const recomputed = findBestMatchingPacks({
        keywords: trade ? [trade] : [],
        trade,
      });
      matchedPacks = recomputed.map((r) => ({
        packId: r.pack.id,
        title: r.pack.title,
        nsqfLevel: r.pack.nsqfLevel,
        matchedUnits: r.matchedUnits,
      }));
    }

    // Single-field where() on workerId; status/latest derived in memory
    // (never touch firestore.indexes.json).
    const assessSnap = await db
      .collection(RPL_ASSESSMENTS)
      .where('workerId', '==', docId)
      .get();
    const assessDocs = assessSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Partial<RPLAssessmentDoc>) }))
      .filter((a) => a.isTemplate !== true)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const latest = assessDocs[0];
    const hasSubmitted = assessDocs.some((a) => a.status === 'submitted');

    let assessorAssigned: string | undefined;
    let assessmentScheduledAt: number | undefined;
    if (latest) {
      if (typeof latest.assessorId === 'string' && latest.assessorId) {
        assessorAssigned = latest.assessorId;
      }
      const raw = latest as unknown as Record<string, unknown>;
      const scheduled =
        raw.assessmentScheduledAt ?? raw.scheduledAt ?? latest.submittedAt ?? latest.createdAt;
      if (typeof scheduled === 'number' && Number.isFinite(scheduled)) {
        assessmentScheduledAt = scheduled;
      }
    }

    let certExists = false;
    try {
      const certSnap = await db.collection(RPL_CERTIFICATIONS).doc(docId).get();
      certExists = certSnap.exists;
    } catch {
      certExists = false;
    }

    // Stage derivation: 'declared' default; any submitted assessment ->
    // 'assessed'; certification doc present -> 'certified' (overrides).
    let stage: RPLStage = 'declared';
    if (hasSubmitted) stage = 'assessed';
    if (certExists) stage = 'certified';

    const response: StatusResponse = {
      workerId: docId,
      stage,
      referenceCode: worker.assessmentReferenceCode ?? docId,
      matchedPacks,
      certified: certExists,
    };
    if (assessorAssigned) response.assessorAssigned = assessorAssigned;
    if (typeof assessmentScheduledAt === 'number') {
      response.assessmentScheduledAt = assessmentScheduledAt;
    }
    if (typeof worker.declarationSubmittedAt === 'number') {
      response.declarationSubmittedAt = worker.declarationSubmittedAt;
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error('[RPL Status GET] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
