import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { auditService } from '@/services/audit.service';
import { notificationService } from '@/services/notification.service';
import { validateAttachments } from '@/lib/file-security';

export const runtime = 'nodejs';

async function verifyParticipant(req: NextRequest, convId: string) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const idToken = authHeader.slice(7);
  let decodedToken;
  try {
    decodedToken = await getAdminAuth().verifyIdToken(idToken);
  } catch {
    return null;
  }

  try {
    const result = await getAdminDb().runTransaction(async (tx) => {
      const userRef = getAdminDb().collection('users').doc(decodedToken.uid);
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) return null;
      const role = userSnap.data()?.role;
      if (role !== 'executive' && role !== 'commander') return null;

      const convRef = getAdminDb().collection('conversations').doc(convId);
      const convSnap = await tx.get(convRef);
      if (!convSnap.exists) return null;
      const convData = convSnap.data()!;
      if (!convData.participants?.includes(decodedToken.uid)) return null;

      return { auth: { uid: decodedToken.uid, email: decodedToken.email ?? null }, role, convRef };
    });
    return result;
  } catch {
    return null;
  }
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

    const { searchParams } = url;
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 200);

    let query = verified.convRef.collection('messages')
      .orderBy('timestamp', 'asc')
      .limit(limit);

    if (cursor) {
      const cursorDoc = await verified.convRef.collection('messages').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();

    const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({
      messages,
      nextCursor: snapshot.docs.length === limit ? snapshot.docs[snapshot.docs.length - 1].id : null,
    });
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

    if (attachments) {
      const validation = validateAttachments(attachments);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
    }

    const now = Date.now();

    // Use transaction to atomically add message + update conversation
    const result = await getAdminDb().runTransaction(async (transaction) => {
      const convSnap = await transaction.get(verified.convRef);
      if (!convSnap.exists) {
        throw new Error('Conversation not found');
      }
      const convData = convSnap.data()!;
      const otherParticipant = (convData.participants || []).find((p: string) => p !== verified.auth.uid);

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
      metadata: { textLength: text?.trim()?.length || 0, attachmentsCount: attachments?.length || 0 },
    });
    const msgText = text?.trim() || '';
    const notifDesc = msgText ? `${msgText.slice(0, 80)}${msgText.length > 80 ? '...' : ''}` : '📎 File attachment';
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
