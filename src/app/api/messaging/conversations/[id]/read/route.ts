import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  const executiveAuth = await verifyFirebaseTokenWithRole(req, 'executive');
  const commanderAuth = await verifyFirebaseTokenWithRole(req, 'commander');
  if (!executiveAuth && !commanderAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const auth = executiveAuth || commanderAuth!;

  try {
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const convId = segments[segments.length - 2];

    if (!convId) {
      return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 });
    }

    const db = getAdminDb();
    const convRef = db.collection('conversations').doc(convId);
    const conv = await convRef.get();
    if (!conv.exists) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    if (!conv.data()!.participants?.includes(auth.uid)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    updateData[`unreadCount.${auth.uid}`] = 0;
    await convRef.update(updateData);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
