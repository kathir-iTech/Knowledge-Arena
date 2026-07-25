import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const executiveAuth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!executiveAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    const snapshot = await getAdminDb().collection('users')
      .where('role', '==', 'commander')
      .select('name', 'email', 'avatar', 'displayName', 'lastActive')
      .limit(200)
      .get();
    let commanders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (search) {
      const lower = search.toLowerCase();
      commanders = commanders.filter((c: any) =>
        c.name?.toLowerCase().includes(lower) || c.email?.toLowerCase().includes(lower)
      );
    }

    return NextResponse.json({ commanders });
  } catch (err: any) {
    console.error('[Commanders GET] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
