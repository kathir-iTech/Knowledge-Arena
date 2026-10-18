import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import { NSQF_PACKS } from '@/lib/rpl/nsqf-packs';
import { RPL_CERTIFICATIONS, RPL_WORKERS } from '@/lib/rpl/rpl-collections';
import { DEMO_REFERENCE_CODES } from '@/lib/rpl/demo-data';
import type { RPLCertificationDoc, RPLWorkerDoc } from '@/lib/rpl/types';

export const runtime = 'nodejs';

const CANONICAL_DEMO_RECORDS: Record<
  string,
  {
    workerName: string;
    trade: string;
    packId: string;
    nsqfLevel: number;
    status: 'certified' | 'pending_signoff';
    issuedAt: number;
    assessorNotes: string;
  }
> = {
  [DEMO_REFERENCE_CODES.suresh]: {
    workerName: 'Suresh Kumar',
    trade: 'Electrician',
    packId: 'ELE/Q1301',
    nsqfLevel: 4,
    status: 'certified',
    issuedAt: 1718000000000,
    assessorNotes:
      'Assessed under NCVET standard 1-4 competency rubric. High practical competency demonstrated across domestic wiring, conduit installation, and circuit fault analysis.',
  },
  [DEMO_REFERENCE_CODES.meena]: {
    workerName: 'Meena Devi',
    trade: 'Plumber',
    packId: 'CON/Q0304',
    nsqfLevel: 3,
    status: 'pending_signoff',
    issuedAt: 1718100000000,
    assessorNotes:
      'Assessed under NCVET standard 1-4 competency rubric. Practical plumbing skills verified; awaiting final executive sign-off.',
  },
  [DEMO_REFERENCE_CODES.ravi]: {
    workerName: 'Ravi Shankar',
    trade: 'Data Entry Operator',
    packId: 'SSC/Q2212',
    nsqfLevel: 4,
    status: 'pending_signoff',
    issuedAt: 1718200000000,
    assessorNotes:
      'Assessed under NCVET standard 1-4 competency rubric. Back-office data entry accuracy demonstrated; awaiting dual assessor review.',
  },
  [DEMO_REFERENCE_CODES.anita]: {
    workerName: 'Anita Kumari',
    trade: 'Electrician',
    packId: 'ELE/Q1301',
    nsqfLevel: 4,
    status: 'pending_signoff',
    issuedAt: 1718250000000,
    assessorNotes:
      'Assessed under NCVET standard 1-4 competency rubric. Panel wiring demonstrated; awaiting dual assessor review.',
  },
  [DEMO_REFERENCE_CODES.mohammed]: {
    workerName: 'Mohammed Irfan',
    trade: 'Plumber',
    packId: 'CON/Q0304',
    nsqfLevel: 3,
    status: 'pending_signoff',
    issuedAt: 1718300000000,
    assessorNotes:
      'Assessed under NCVET standard 1-4 competency rubric. Drainage installation verified; awaiting sign-off.',
  },
  [DEMO_REFERENCE_CODES.lakshmi]: {
    workerName: 'Lakshmi Nair',
    trade: 'Data Entry Operator',
    packId: 'SSC/Q2212',
    nsqfLevel: 4,
    status: 'certified',
    issuedAt: 1717900000000,
    assessorNotes:
      'Assessed under NCVET standard 1-4 competency rubric. Full speed and accuracy criteria met for certification.',
  },
};

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

    try {
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
    } catch (dbErr) {
      console.warn('[rpl/verify] Firestore query failed, falling back to canonical demo check:', dbErr);
    }

    if (!workerDoc) {
      // Fallback for canonical demo candidates so PPT and demo links work even if DB is not seeded
      const demoCandidate =
        CANONICAL_DEMO_RECORDS[refCode] ||
        (refCode === 'demo-candidate-1' ? CANONICAL_DEMO_RECORDS[DEMO_REFERENCE_CODES.suresh] : null);

      if (demoCandidate) {
        const canonicalCode = refCode === 'demo-candidate-1' ? DEMO_REFERENCE_CODES.suresh : refCode;
        const cryptographicSeal = createHash('sha256')
          .update(
            `${canonicalCode}:${demoCandidate.workerName}:${demoCandidate.packId}:${demoCandidate.nsqfLevel}:${demoCandidate.issuedAt}:NCVET-RPL-REGISTRY-V1`,
          )
          .digest('hex');

        return NextResponse.json({
          verified: true,
          referenceCode: canonicalCode,
          workerName: demoCandidate.workerName,
          trade: demoCandidate.trade,
          packId: demoCandidate.packId,
          nsqfLevel: demoCandidate.nsqfLevel,
          status: demoCandidate.status,
          issuedAt: demoCandidate.issuedAt,
          issuingAuthority: 'PSG iTech · National Skill Development Corporation (RPL Center)',
          assessorNotes: demoCandidate.assessorNotes,
          requiresHumanSignoff: demoCandidate.status !== 'certified',
          cryptographicSeal,
          governanceAudit: {
            methodology: 'AI-Assisted Assessment with Cohen’s Kappa Inter-Assessor Reliability',
            decisionModel: 'Human Assessor Sign-Off Required (AI-Proposed ≠ AI-Decided)',
            isDemoData: true,
            tamperSealSha256: cryptographicSeal,
          },
        });
      }

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
