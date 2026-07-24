import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';

async function verifyParticipant(req: NextRequest, convId: string) {
  const executiveAuth = await verifyFirebaseTokenWithRole(req, 'executive');
  const commanderAuth = await verifyFirebaseTokenWithRole(req, 'commander');
  if (!executiveAuth && !commanderAuth) return null;
  const auth = executiveAuth || commanderAuth!;
  const role = executiveAuth ? 'executive' : 'commander';

  // Verify user is a participant in this conversation
  const convRef = getAdminDb().collection('conversations').doc(convId);
  const conv = await convRef.get();
  if (!conv.exists) return null;
  const data = conv.data()!;
  if (!data.participants?.includes(auth.uid)) return null;

  return { auth, role, convRef, conv };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const convId = segments[segments.length - 2];

    const verified = await verifyParticipant(req, convId);
    if (!verified) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const snapshot = await verified.convRef.collection('messages')
      .orderBy('timestamp', 'asc')
      .get();

    const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ messages });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const convId = segments[segments.length - 2];

    const verified = await verifyParticipant(req, convId);
    if (!verified) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { text } = await req.json();
    if (!text?.trim()) {
      return NextResponse.json({ error: 'Message text is required' }, { status: 400 });
    }

    const now = Date.now();

    // Use transaction to atomically add message + update conversation
    const result = await getAdminDb().runTransaction(async (transaction) => {
      const msgRef = verified.convRef.collection('messages').doc();
      transaction.set(msgRef, {
        text: text.trim(),
        senderId: verified.auth.uid,
        senderRole: verified.role,
        timestamp: now,
      });

      const convSnap = await transaction.get(verified.convRef);
      const convData = convSnap.data()!;
      const otherParticipant = convData.participants.find((p: string) => p !== verified.auth.uid);

      const updateData: Record<string, unknown> = {
        lastMessage: { text: text.trim(), senderId: verified.auth.uid, senderRole: verified.role, timestamp: now },
        lastActivity: now,
      };
      if (otherParticipant) {
        const currentUnread = convData.unreadCount?.[otherParticipant] || 0;
        updateData[`unreadCount.${otherParticipant}`] = currentUnread + 1;
      }

      transaction.update(verified.convRef, updateData);

      return { id: msgRef.id, text: text.trim(), senderId: verified.auth.uid, senderRole: verified.role, timestamp: now };
    });

    return NextResponse.json({ message: result });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
