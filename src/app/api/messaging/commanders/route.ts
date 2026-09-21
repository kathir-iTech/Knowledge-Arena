import { NextRequest, NextResponse } from 'next/server';
import type { DocumentData } from 'firebase-admin/firestore';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const executiveAuth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!executiveAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
    const _rl = await enforceRateLimit(`executive:commanders:${executiveAuth.uid}`, Limits.READ_PER_USER);
    if (_rl) return _rl;

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    const snapshot = await getAdminDb().collection('users')
      .where('role', '==', 'commander')
      .select('name', 'email', 'avatar', 'displayName', 'lastActive')
      .limit(200)
      .get();
    let commanders: Array<{ id: string } & DocumentData> = snapshot.docs
      .map((doc): { id: string } & DocumentData => ({ id: doc.id, ...doc.data() }))
      .filter((c) => c.deleted !== true);

    if (search) {
      const lower = search.toLowerCase();
      commanders = commanders.filter((c) =>
        c.name?.toLowerCase().includes(lower) || c.email?.toLowerCase().includes(lower)
      );
    }

    return NextResponse.json({ commanders }, { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=120' } });
  } catch (err) {
    const e = err as { message?: string; name?: string };
    console.error('[Commanders GET] Error:', e?.name, e?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}