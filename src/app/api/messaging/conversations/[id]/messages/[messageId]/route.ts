import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  try {
    const executiveAuth = await verifyFirebaseTokenWithRole(req, 'executive');
    const commanderAuth = await verifyFirebaseTokenWithRole(req, 'commander');
    if (!executiveAuth && !commanderAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const auth = executiveAuth || commanderAuth!;

    const { id, messageId } = await params;
    const db = getAdminDb();

    const convRef = db.collection('conversations').doc(id);
    const conv = await convRef.get();
    if (!conv.exists) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const convData = conv.data()!;
    if (!executiveAuth && !convData.participants?.includes(auth.uid)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const msgRef = convRef.collection('messages').doc(messageId);
    const msg = await msgRef.get();
    if (!msg.exists) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    const msgData = msg.data()!;
    if (!executiveAuth && msgData.senderId !== auth.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await msgRef.delete();

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Message DELETE] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
