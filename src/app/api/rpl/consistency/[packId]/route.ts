import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { recomputePackConsistency } from '@/lib/rpl/recompute-consistency';
import { sanitizeRplDocId } from '@/lib/rpl/rpl-collections';
import type { ConsistencyReport } from '@/lib/rpl/types';

export const runtime = 'nodejs';

interface HistoryEntry {
  at: number;
  kappa: number;
}

type ConsistencyResponse = ConsistencyReport & { history: HistoryEntry[] };

export async function GET(req: NextRequest, { params }: { params: Promise<{ packId: string }> }) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { packId: rawPackId } = await params;
    if (!rawPackId) {
      return NextResponse.json({ error: 'Missing packId' }, { status: 400 });
    }
    // Next.js does not decode %2F in route params (it would change segment
    // structure), but NSQF pack codes contain slashes (ELE/Q1301). Decode
    // defensively so encoded callers match the canonical packId FIELD.
    let packId = rawPackId;
    try {
      packId = decodeURIComponent(rawPackId);
    } catch {
      packId = rawPackId;
    }

    // Delegate to the shared helper (single source of truth). The helper
    // performs the full computation + history cap + set-merge store and
    // returns the report; history is read back here for an identical shape.
    const report = await recomputePackConsistency(packId);

    let history: HistoryEntry[] = [];
    try {
      const stored = await getAdminDb().collection('rpl_consistency').doc(sanitizeRplDocId(packId)).get();
      if (stored.exists) {
        const data = stored.data() as { history?: HistoryEntry[] };
        if (Array.isArray(data.history)) {
          history = data.history
            .filter((h) => typeof h?.at === 'number' && typeof h?.kappa === 'number')
            .slice(-20);
        }
      }
    } catch {
      history = [];
    }

    const response: ConsistencyResponse = { ...report, history };
    return NextResponse.json(response);
  } catch (err) {
    console.error('[Consistency GET] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
