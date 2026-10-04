import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithAnyRole } from '@/lib/verify-auth';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import { RPL_ASSESSMENTS } from '@/lib/rpl/rpl-collections';
import type { EvidenceImageDoc, RPLAssessmentDoc } from '@/lib/rpl/types';

export const runtime = 'nodejs';

// SIH-26242 RPL evidence images — base64 data-URLs in
// rpl_assessments/{assessmentId}/evidence/{imageId} (Admin SDK only;
// Firestore rules deny clients). Storage rules are inert future-proofing.
const MAX_DATAURL_CHARS = 750 * 1024;
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

function isDocId(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0 && !v.includes('/');
}

function toEvidenceDoc(
  id: string,
  assessmentId: string,
  workerId: string,
  data: Record<string, unknown>,
): EvidenceImageDoc {
  return {
    imageId: typeof data.imageId === 'string' && data.imageId ? data.imageId : id,
    assessmentId,
    workerId,
    unitId: typeof data.unitId === 'string' ? data.unitId : '',
    dataUrl: typeof data.dataUrl === 'string' ? data.dataUrl : '',
    mimeType: typeof data.mimeType === 'string' ? data.mimeType : '',
    sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : 0,
    uploadedBy: typeof data.uploadedBy === 'string' ? data.uploadedBy : '',
    uploadedAt: typeof data.uploadedAt === 'number' ? data.uploadedAt : 0,
  };
}

// POST /api/rpl/evidence — commander/executive only.
// Body: { assessmentId, workerId, unitId, dataUrl, mimeType, sizeBytes }.
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithAnyRole(req, ['commander', 'executive']);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // INLINE rate-limit config (do not touch Limits).
    const rl = await enforceRateLimit(`rpl:evidence:${auth.uid}`, {
      maxRequests: 15,
      windowMs: 60000,
      message: 'Too many evidence uploads. Please slow down.',
    });
    if (rl) return rl;

    const body = (await req.json().catch(() => null)) as {
      assessmentId?: unknown;
      workerId?: unknown;
      unitId?: unknown;
      dataUrl?: unknown;
      mimeType?: unknown;
      sizeBytes?: unknown;
    } | null;
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

    const { assessmentId, workerId, unitId, dataUrl, mimeType, sizeBytes } = body;

    if (!isDocId(assessmentId)) {
      return NextResponse.json(
        { error: 'assessmentId must be a non-empty doc id (no slashes)' },
        { status: 400 },
      );
    }
    if (typeof workerId !== 'string' || !workerId.trim()) {
      return NextResponse.json({ error: 'workerId is required' }, { status: 400 });
    }
    if (typeof unitId !== 'string' || !unitId.trim()) {
      return NextResponse.json({ error: 'unitId is required' }, { status: 400 });
    }
    if (
      typeof dataUrl !== 'string' ||
      !dataUrl.startsWith('data:image/') ||
      !dataUrl.includes(';base64,')
    ) {
      return NextResponse.json({ error: 'dataUrl must be a data:image/* URL' }, { status: 400 });
    }
    if (dataUrl.length > MAX_DATAURL_CHARS) {
      return NextResponse.json({ error: 'Image is too large (max ~750KB data URL).' }, { status: 400 });
    }
    if (typeof mimeType !== 'string' || !mimeType.startsWith('image/')) {
      return NextResponse.json({ error: 'mimeType must be an image/* type' }, { status: 400 });
    }
    if (typeof sizeBytes !== 'number' || !(sizeBytes > 0) || sizeBytes > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'sizeBytes must be between 1 and 5MB' }, { status: 400 });
    }

    const db = getAdminDb();
    const assessRef = db.collection(RPL_ASSESSMENTS).doc(assessmentId);
    const assessSnap = await assessRef.get().catch(() => null);
    if (!assessSnap || !assessSnap.exists) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }
    const assessment = assessSnap.data() as Partial<RPLAssessmentDoc>;
    // Privacy/consistency: body workerId must match the assessment's workerId.
    if (typeof assessment.workerId !== 'string' || assessment.workerId !== workerId) {
      return NextResponse.json(
        { error: 'workerId does not match the assessment' },
        { status: 400 },
      );
    }

    const evRef = assessRef.collection('evidence').doc();
    const doc: EvidenceImageDoc = {
      imageId: evRef.id,
      assessmentId,
      workerId,
      unitId,
      dataUrl,
      mimeType,
      sizeBytes,
      uploadedBy: auth.uid,
      uploadedAt: Date.now(),
    };
    await evRef.set(doc);

    return NextResponse.json({ imageId: evRef.id });
  } catch (err) {
    console.error('[RPL Evidence POST] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/rpl/evidence?assessmentId= — commander/executive any; gladiator
// ONLY when the assessment's workerId == requester uid (never leak others).
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithAnyRole(req, ['commander', 'executive', 'gladiator']);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // INLINE rate-limit config (do not touch Limits).
    const rl = await enforceRateLimit(`rpl:evidence-read:${auth.uid}`, {
      maxRequests: 30,
      windowMs: 60000,
      message: 'Too many evidence requests. Please slow down.',
    });
    if (rl) return rl;

    const { searchParams } = new URL(req.url);
    const assessmentId = (searchParams.get('assessmentId') ?? '').trim();
    if (!isDocId(assessmentId)) {
      return NextResponse.json({ error: 'assessmentId is required' }, { status: 400 });
    }

    const db = getAdminDb();
    const assessSnap = await db.collection(RPL_ASSESSMENTS).doc(assessmentId).get().catch(() => null);
    if (!assessSnap || !assessSnap.exists) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }
    const assessment = assessSnap.data() as Partial<RPLAssessmentDoc>;

    // Explicit privacy check: non-privileged callers see only their own worker record.
    const isPrivileged = auth.role === 'commander' || auth.role === 'executive';
    if (!isPrivileged && assessment.workerId !== auth.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const evSnap = await db
      .collection(RPL_ASSESSMENTS)
      .doc(assessmentId)
      .collection('evidence')
      .get()
      .catch(() => null);
    const workerId = typeof assessment.workerId === 'string' ? assessment.workerId : '';
    const evidence: EvidenceImageDoc[] = (evSnap?.docs ?? []).map((d) =>
      toEvidenceDoc(d.id, assessmentId, workerId, d.data() as Record<string, unknown>),
    );

    return NextResponse.json({ evidence });
  } catch (err) {
    console.error('[RPL Evidence GET] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/rpl/evidence — commander/executive only. Body: { assessmentId, imageId }.
export async function DELETE(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithAnyRole(req, ['commander', 'executive']);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // INLINE rate-limit config (do not touch Limits).
    const rl = await enforceRateLimit(`rpl:evidence-del:${auth.uid}`, {
      maxRequests: 15,
      windowMs: 60000,
      message: 'Too many evidence operations. Please slow down.',
    });
    if (rl) return rl;

    const body = (await req.json().catch(() => null)) as {
      assessmentId?: unknown;
      imageId?: unknown;
    } | null;
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

    const { assessmentId, imageId } = body;
    if (!isDocId(assessmentId)) {
      return NextResponse.json(
        { error: 'assessmentId must be a non-empty doc id (no slashes)' },
        { status: 400 },
      );
    }
    if (!isDocId(imageId)) {
      return NextResponse.json(
        { error: 'imageId must be a non-empty doc id (no slashes)' },
        { status: 400 },
      );
    }

    const db = getAdminDb();
    await db
      .collection(RPL_ASSESSMENTS)
      .doc(assessmentId)
      .collection('evidence')
      .doc(imageId)
      .delete();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[RPL Evidence DELETE] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
