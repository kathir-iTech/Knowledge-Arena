import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET(req: NextRequest) {
  const executiveAuth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!executiveAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    let query = getAdminDb().collection('users').where('role', '==', 'commander');
    const snapshot = await query.get();
    let commanders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (search) {
      const lower = search.toLowerCase();
      commanders = commanders.filter((c: any) =>
        c.name?.toLowerCase().includes(lower) || c.email?.toLowerCase().includes(lower)
      );
    }

    return NextResponse.json({ commanders });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
