import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { auditService } from '@/services/audit.service';
import { notificationService } from '@/services/notification.service';

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
    console.error('[Messages GET] Error:', err?.name, err?.message);
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

    const { text, attachments } = await req.json();
    if (!text?.trim() && (!attachments || attachments.length === 0)) {
      return NextResponse.json({ error: 'Message text or attachment is required' }, { status: 400 });
    }

    if (attachments && Array.isArray(attachments)) {
      const totalSize = attachments.reduce((sum: number, f: any) => sum + (f.size || 0), 0);
      if (totalSize > 5 * 1024 * 1024) {
        return NextResponse.json({ error: 'Total attachment size exceeds 5MB limit' }, { status: 400 });
      }
      for (const f of attachments) {
        if (!f.name || !f.type || !f.data) {
          return NextResponse.json({ error: 'Each attachment must have name, type, and data' }, { status: 400 });
        }
      }
    }

    const now = Date.now();

    // Use transaction to atomically add message + update conversation
    const result = await getAdminDb().runTransaction(async (transaction) => {
      const msgRef = verified.convRef.collection('messages').doc();
      const msgData: Record<string, unknown> = {
        text: text?.trim() || '',
        senderId: verified.auth.uid,
        senderRole: verified.role,
        timestamp: now,
      };
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        msgData.attachments = attachments;
      }
      transaction.set(msgRef, msgData);

      const convSnap = await transaction.get(verified.convRef);
      const convData = convSnap.data()!;
      const otherParticipant = convData.participants.find((p: string) => p !== verified.auth.uid);

      const displayText = text?.trim() || (attachments?.length ? `📎 ${attachments[0].name}${attachments.length > 1 ? ` +${attachments.length - 1} more` : ''}` : '');
      const updateData: Record<string, unknown> = {
        lastMessage: { text: displayText, senderId: verified.auth.uid, senderRole: verified.role, timestamp: now, hasAttachments: !!(attachments?.length) },
        lastActivity: now,
      };
      if (otherParticipant) {
        const currentUnread = convData.unreadCount?.[otherParticipant] || 0;
        updateData[`unreadCount.${otherParticipant}`] = currentUnread + 1;
      }

      transaction.update(verified.convRef, updateData);

      return { id: msgRef.id, ...msgData };
    });

    await auditService.record({
      timestamp: Date.now(),
      actor: verified.auth.uid,
      actorRole: verified.role,
      action: 'message_sent',
      target: convId,
      metadata: { textLength: text.trim().length },
    });
    const notifDesc = text?.trim() ? `${text.trim().slice(0, 80)}${text.trim().length > 80 ? '...' : ''}` : '📎 File attachment';
    await notificationService.create({
      type: 'new_message',
      title: 'New Message',
      description: notifDesc,
      createdAt: Date.now(),
      link: '/executive/messages',
      metadata: { conversationId: convId },
    });

    return NextResponse.json({ message: result });
  } catch (err: any) {
    console.error('[Messages POST] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
