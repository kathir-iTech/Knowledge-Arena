import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const _rl = await enforceRateLimit(`read:${auth.uid}`, Limits.READ_PER_USER);
    if (_rl) return _rl;

    const snap = await getAdminDb()
      .collection(COLLECTIONS.QUESTION_BANK)
      .select('category')
      .limit(300)
      .get();

    const categories = new Set<string>();
    for (const doc of snap.docs) {
      const raw = doc.data()?.category;
      if (typeof raw === 'string' && raw.trim()) categories.add(raw.trim());
    }

    return NextResponse.json({ categories: Array.from(categories).sort((a, b) => a.localeCompare(b)) });
  } catch (err: any) {
    console.error('[QuestionBank Categories] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}