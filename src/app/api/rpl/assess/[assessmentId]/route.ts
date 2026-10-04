import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithAnyRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { RPL_ASSESSMENTS, RPL_WORKERS } from '@/lib/rpl/rpl-collections';
import { NSQF_PACKS } from '@/lib/rpl/nsqf-packs';
import type { AssessmentItem, RPLAssessmentDoc, RPLWorkerDoc } from '@/lib/rpl/types';

export const runtime = 'nodejs';

// Single-assessment detail (Commander owns-own + Executive sees-all).
// Returns { assessment, items, worker (rpl_workers doc), pack (NSQF_PACKS by packId) }.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assessmentId: string }> },
) {
  try {
    const auth = await verifyFirebaseTokenWithAnyRole(req, ['commander', 'executive']);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { assessmentId } = await params;
    if (!assessmentId) {
      return NextResponse.json({ error: 'Missing assessmentId' }, { status: 400 });
    }

    const db = getAdminDb();
    const docRef = db.collection(RPL_ASSESSMENTS).doc(assessmentId);
    const snap = await docRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }
    const data = snap.data() as Partial<RPLAssessmentDoc>;

    // Commander may read only their own assessments; executives may read any.
    if (auth.role === 'commander' && data.assessorId !== auth.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const itemsSnap = await docRef.collection('items').get().catch(() => null);
    const items: AssessmentItem[] = (itemsSnap?.docs ?? []).map((d) => {
      const item = d.data() as Partial<AssessmentItem>;
      return {
        ...(item as AssessmentItem),
        itemId: typeof item.itemId === 'string' ? item.itemId : d.id,
        assessmentId,
        unitId: typeof item.unitId === 'string' ? item.unitId : '',
        kind: item.kind === 'knowledge' ? 'knowledge' : 'performance',
        criterionText: typeof item.criterionText === 'string' ? item.criterionText : '',
      } as AssessmentItem;
    });

    let worker: (Partial<RPLWorkerDoc> & { id: string }) | null = null;
    if (typeof data.workerId === 'string' && data.workerId) {
      const workerSnap = await db.collection(RPL_WORKERS).doc(data.workerId).get().catch(() => null);
      if (workerSnap && workerSnap.exists) {
        worker = { id: workerSnap.id, ...(workerSnap.data() as Partial<RPLWorkerDoc>) };
      }
    }

    const packId = typeof data.packId === 'string' ? data.packId : '';
    const pack = NSQF_PACKS.find((p) => p.id === packId) ?? null;

    return NextResponse.json({
      assessment: { id: snap.id, ...data },
      items,
      worker,
      pack,
    });
  } catch (err) {
    console.error('[RPL Assess GET one] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
