import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import { auditService } from '@/services/audit.service';
import { notificationService } from '@/services/notification.service';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const executiveAuth = await verifyFirebaseTokenWithRole(req, 'executive');
    const commanderAuth = await verifyFirebaseTokenWithRole(req, 'commander');
    if (!executiveAuth && !commanderAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const auth = executiveAuth || commanderAuth!;

    const db = getAdminDb();
    const snapshot = await db.collection('conversations')
      .where('participants', 'array-contains', auth.uid)
      .limit(200)
      .get();

    let conversations = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a: any, b: any) => (b.lastActivity || 0) - (a.lastActivity || 0));

    const allUids = new Set<string>();
    for (const conv of conversations) {
      const participants: string[] = (conv as any).participants || [];
      for (const uid of participants) allUids.add(uid);
    }

    if (allUids.size > 0) {
      const userRefs = Array.from(allUids).map(uid => db.collection('users').doc(uid));
      const userSnaps = await db.getAll(...userRefs);
      const userMap: Record<string, { displayName?: string; email?: string; role?: string; deleted?: boolean }> = {};
      for (const snap of userSnaps) {
        if (snap.exists) {
          userMap[snap.id] = snap.data() as any;
        }
      }

      conversations = conversations.filter((conv: any) => {
        const participants: string[] = conv.participants || [];
        return !participants.some(uid => userMap[uid]?.deleted === true);
      });

      const participantNames: Record<string, string> = {};
      for (const uid of allUids) {
        const user = userMap[uid];
        participantNames[uid] = user?.displayName || user?.email || 'Unknown User';
      }

      conversations = conversations.map((conv: any) => ({
        ...conv,
        participantNames,
      }));
    }

    return NextResponse.json({ conversations });
  } catch (err: any) {
    console.error('[Conversations GET] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const executiveAuth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!executiveAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimitResponse = enforceRateLimit(`messaging:${executiveAuth.uid}`, Limits.MESSAGE_POST_PER_USER);
  if (rateLimitResponse) return rateLimitResponse;

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
      userId: commanderId,
      link: '/commander/messages',
      metadata: { conversationId: result.id },
    });

    return NextResponse.json({ conversation: result });
  } catch (err: any) {
    console.error('[Conversations POST] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
