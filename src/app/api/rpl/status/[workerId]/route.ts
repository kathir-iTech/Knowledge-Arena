import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verify-auth';
import { enforceRateLimit } from '@/lib/rate-limiter';
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

    // INLINE rate-limit config (do not touch Limits).
    const rl = await enforceRateLimit(`rpl:status:${caller.uid}`, {
      maxRequests: 30,
      windowMs: 60000,
      message: 'Too many status requests. Please slow down.',
    });
    if (rl) return rl;

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
        // B3: a worker asking about their OWN record that does not exist yet
        // gets an explicit 200 "not started" state, not a 404 error. Only a
        // privileged caller requesting someone ELSE's missing record 404s.
        if (workerIdParam === caller.uid) {
          return NextResponse.json({ status: 'none' }, { status: 200 });
        }
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
    const isPrivileged =
      role === 'commander' || role === 'executive' || role === 'assessor' || role === 'admin';
    if (!isPrivileged && caller.uid !== docId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const worker = workerSnap.data() as RPLWorkerDoc;
    const declaration = worker.declaration;

    // B3: a doc can exist for a signed-in candidate before they declare (or a
    // legacy placeholder). No declaration + no submission timestamp for the
    // caller's OWN record means "not started", not a fabricated stage.
    if (
      docId === caller.uid &&
      !declaration &&
      typeof worker.declarationSubmittedAt !== 'number'
    ) {
      return NextResponse.json({ status: 'none' }, { status: 200 });
    }

    const trade = (declaration?.trade ?? worker.trade ?? '').trim();

    // B4: match packs from the worker's ACTUAL claims. A pack appears only if
    // the worker marked at least one of its units can-do/done; its matchScore
    // is the share of the pack's units claimed, and matchedUnits lists only
    // the claimed units. A declaration with no claims (or none at all) shows
    // NO packs — never a fabricated match. Legacy docs without per-unit claims
    // fall back to the previous stored-id / keyword behavior.
    const storedPackIds = Array.isArray(declaration?.matchedPacks)
      ? declaration.matchedPacks.filter(
          (id): id is string => typeof id === 'string' && id.trim().length > 0,
        )
      : [];
    const declarationsByPack =
      declaration?.declarationsByPack && typeof declaration.declarationsByPack === 'object'
        ? declaration.declarationsByPack
        : null;
    const hasClaimData = declarationsByPack !== null && Object.keys(declarationsByPack).length > 0;

    let matchedPacks: MatchedPackSummary[] = [];
    if (hasClaimData) {
      for (const [packId, entries] of Object.entries(declarationsByPack)) {
        const pack = NSQF_PACKS.find((p) => p.id === packId);
        if (!pack) continue;
        const claimedIds = new Set<string>();
        for (const e of Array.isArray(entries) ? entries : []) {
          if (
            e &&
            typeof e.unitId === 'string' &&
            (e.status === 'can-do' || e.status === 'done')
          ) {
            claimedIds.add(e.unitId);
          }
        }
        if (claimedIds.size === 0) continue;
        const claimedUnits = pack.competencyUnits.filter((u) => claimedIds.has(u.id));
        const total = pack.competencyUnits.length || 1;
        const claimedCount = claimedUnits.length;
        matchedPacks.push({
          packId: pack.id,
          title: pack.title,
          nsqfLevel: pack.nsqfLevel,
          matchedUnits: claimedUnits.map((u) => u.name),
          matchScore: Math.round((claimedCount / total) * 100),
          matchReason: `You declared ${claimedCount} of ${total} skills for this pack.`,
        });
      }
      matchedPacks.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
    } else if (storedPackIds.length > 0) {
      // Legacy: packs recorded before per-unit claims existed. Keep the units
      // visible but do not invent a match score.
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
    if (matchedPacks.length === 0 && !hasClaimData && storedPackIds.length === 0) {
      const recomputed = findBestMatchingPacks({
        keywords: trade ? [trade] : [],
        trade,
      });
      matchedPacks = recomputed.map((r) => ({
        packId: r.pack.id,
        title: r.pack.title,
        nsqfLevel: r.pack.nsqfLevel,
        matchedUnits: r.matchedUnits,
        matchScore: r.score,
        matchReason: `Matched on your trade “${trade || 'your declaration'}”.`,
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
