import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { auditService } from '@/services/audit.service';
import { notificationService } from '@/services/notification.service';

const REQUIRED_INDEX_WARNING = 'Ensure a composite index exists: collection "conversations", fields "participants" (ARRAY_CONTAINS) + "lastActivity" (DESC).';

export async function GET(req: NextRequest) {
  const executiveAuth = await verifyFirebaseTokenWithRole(req, 'executive');
  const commanderAuth = await verifyFirebaseTokenWithRole(req, 'commander');
  if (!executiveAuth && !commanderAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const auth = executiveAuth || commanderAuth!;

  try {
    const snapshot = await getAdminDb().collection('conversations')
      .where('participants', 'array-contains', auth.uid)
      .orderBy('lastActivity', 'desc')
      .get();

    const conversations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ conversations });
  } catch (err: any) {
    if (err?.message?.includes('index')) {
      return NextResponse.json({ error: REQUIRED_INDEX_WARNING }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const executiveAuth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!executiveAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { commanderId } = await req.json();
    if (!commanderId) {
      return NextResponse.json({ error: 'commanderId is required' }, { status: 400 });
    }
    if (commanderId === executiveAuth.uid) {
      return NextResponse.json({ error: 'Cannot create conversation with yourself' }, { status: 400 });
    }

    const db = getAdminDb();
    const now = Date.now();
    const participants = [executiveAuth.uid, commanderId];

    // Atomic transaction: check both orderings and create if neither exists
    const result = await db.runTransaction(async (transaction) => {
      const existingQuery = await transaction.get(
        db.collection('conversations')
          .where('participants', '==', participants)
          .limit(1)
      );
      if (!existingQuery.empty) {
        const doc = existingQuery.docs[0];
        return { id: doc.id, ...doc.data() };
      }

      const reverseQuery = await transaction.get(
        db.collection('conversations')
          .where('participants', '==', [commanderId, executiveAuth.uid])
          .limit(1)
      );
      if (!reverseQuery.empty) {
        const doc = reverseQuery.docs[0];
        return { id: doc.id, ...doc.data() };
      }

      const docRef = db.collection('conversations').doc();
      const conversation = {
        participants,
        participantRoles: { [executiveAuth.uid]: 'executive', [commanderId]: 'commander' },
        unreadCount: { [executiveAuth.uid]: 0, [commanderId]: 0 },
        lastActivity: now,
        createdAt: now,
      };
      transaction.set(docRef, conversation);
      return { id: docRef.id, ...conversation };
    });

    await auditService.record({
      timestamp: Date.now(),
      actor: executiveAuth.uid,
      actorRole: 'executive',
      action: 'conversation_created',
      target: result.id,
      metadata: { participants: participants.join(',') },
    });
    await notificationService.create({
      type: 'new_message',
      title: 'Conversation Started',
      description: `New conversation with commander.`,
      createdAt: Date.now(),
      link: '/executive/messages',
      metadata: { conversationId: result.id },
    });

    return NextResponse.json({ conversation: result });
  } catch (err: any) {
    console.error('[Conversations POST] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
