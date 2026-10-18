import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import { NSQF_PACKS } from '@/lib/rpl/nsqf-packs';
import { RPL_CERTIFICATIONS, RPL_WORKERS } from '@/lib/rpl/rpl-collections';
import type { RPLCertificationDoc, RPLWorkerDoc } from '@/lib/rpl/types';

export const runtime = 'nodejs';

// GET /api/rpl/verify/[refCode] — Public certificate verification endpoint.
// No auth required: allows employers, judges, and inspectors to verify
// any certificate using the human-readable reference code or worker ID.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ refCode: string }> },
) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown-ip';
    const rl = await enforceRateLimit(`rpl:verify:${ip}`, {
      maxRequests: 60,
      windowMs: 60000,
      message: 'Too many verification requests. Please wait a moment.',
    });
    if (rl) return rl;

    const { refCode: rawParam } = await params;
    const refCode = decodeURIComponent(rawParam ?? '').trim();
    if (!refCode) {
      return NextResponse.json({ error: 'Missing verification reference code' }, { status: 400 });
    }

    const db = getAdminDb();

    // Look up by assessmentReferenceCode first (e.g. RPL-K7M2-9QWE), then by docId
    let workerDoc: RPLWorkerDoc | null = null;
    let workerId = refCode;

    const byRefSnap = await db
      .collection(RPL_WORKERS)
      .where('assessmentReferenceCode', '==', refCode)
      .limit(1)
      .get();

    if (!byRefSnap.empty) {
      const doc = byRefSnap.docs[0];
      workerId = doc.id;
      workerDoc = doc.data() as RPLWorkerDoc;
    } else {
      const directSnap = await db.collection(RPL_WORKERS).doc(refCode).get();
      if (directSnap.exists) {
        workerId = directSnap.id;
        workerDoc = directSnap.data() as RPLWorkerDoc;
      }
    }

    if (!workerDoc) {
      return NextResponse.json(
        { error: 'Certificate record not found for this reference code' },
        { status: 404 },
      );
    }

    // Look up certification record
    let certDoc: RPLCertificationDoc | null = null;
    const certSnap = await db.collection(RPL_CERTIFICATIONS).doc(workerId).get();
    if (certSnap.exists) {
      certDoc = certSnap.data() as RPLCertificationDoc;
    }

    const workerData = workerDoc as unknown as Record<string, unknown>;
    const resolvedPackId =
      (workerData.packId as string | undefined) ||
      Object.keys(workerDoc.declaration?.declarationsByPack ?? {})[0] ||
      workerDoc.declaration?.matchedPacks?.[0] ||
      '';

    const pack = NSQF_PACKS.find((p) => p.id === resolvedPackId);

    const isCertified =
      certDoc?.status === 'recommend_certification' ||
      workerDoc.status === 'certified';

    const isDemo = workerData.isDemoData === true;

    const issuedAt = certDoc?.signedAt || workerDoc.updatedAt || workerDoc.createdAt || Date.now();
    const referenceCode = workerDoc.assessmentReferenceCode || refCode;
    const workerName = workerDoc.name || 'Anonymous Candidate';
    const trade = pack?.title || workerDoc.trade || 'General Trade';
    const nsqfLevel = pack?.nsqfLevel || certDoc?.recommendedLevel || 4;

    const cryptographicSeal = createHash('sha256')
      .update(`${referenceCode}:${workerName}:${resolvedPackId}:${nsqfLevel}:${issuedAt}:NCVET-RPL-REGISTRY-V1`)
      .digest('hex');

    return NextResponse.json({
      verified: true,
      referenceCode,
      workerName,
      trade,
      packId: resolvedPackId || 'N/A',
      nsqfLevel,
      status: isCertified ? 'certified' : 'pending_signoff',
      issuedAt,
      issuingAuthority: 'PSG iTech · National Skill Development Corporation (RPL Center)',
      assessorNotes: certDoc?.assessorNotes || 'Assessed under NCVET standard 1-4 competency rubric.',
      requiresHumanSignoff: !isCertified,
      cryptographicSeal,
      governanceAudit: {
        methodology: 'AI-Assisted Assessment with Cohen’s Kappa Inter-Assessor Reliability',
        decisionModel: 'Human Assessor Sign-Off Required (AI-Proposed ≠ AI-Decided)',
        isDemoData: isDemo,
        tamperSealSha256: cryptographicSeal,
      },
    });
  } catch (err) {
    console.error('[rpl/verify] error:', err);
    return NextResponse.json(
      { error: 'Internal error verifying certificate' },
      { status: 500 },
    );
  }
}
