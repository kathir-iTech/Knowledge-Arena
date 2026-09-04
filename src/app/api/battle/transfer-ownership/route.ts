import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS, PS_BLOCKED } from '@/lib/constants';
import { writeBattleLog, isCreator, battleErrorResponse } from '@/lib/battle-server';
import { notificationService } from '@/services/notification.service';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'commander');
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const rateLimitResponse = await enforceRateLimit(`battle:${auth.uid}`, Limits.BATTLE_ACTION_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await req.json().catch(() => ({}));
    const quizId = typeof body.quizId === 'string' ? body.quizId.trim() : '';
    const newOwnerId = typeof body.newOwnerId === 'string' ? body.newOwnerId.trim() : '';
    if (!quizId || !newOwnerId) {
      return NextResponse.json({ error: 'Missing quizId or newOwnerId' }, { status: 400 });
    }

    const db = getAdminDb();
    const quizRef = db.collection(COLLECTIONS.QUIZZES).doc(quizId);
    const quizSnap = await quizRef.get();
    if (!quizSnap.exists) throw new Error('Arena not found');
    const quiz = quizSnap.data() as Record<string, any>;
    if (!isCreator(quiz, auth.uid)) {
      throw new Error('Only the Commander can transfer ownership');
    }
    if (quiz.created_by === newOwnerId) {
      throw new Error('This gladiator already owns this arena');
    }

    const targetUserRef = db.collection(COLLECTIONS.USERS).doc(newOwnerId);
    const targetUserSnap = await targetUserRef.get();
    if (!targetUserSnap.exists) {
      throw new Error('Target gladiator is not a registered user');
    }

    const partRef = db
      .collection(COLLECTIONS.QUIZZES).doc(quizId)
      .collection(COLLECTIONS.PARTICIPANTS).doc(newOwnerId);
    const partSnap = await partRef.get();
    if (!partSnap.exists) {
      throw new Error('Target gladiator is not a participant in this arena');
    }
    if (partSnap.data()?.status === PS_BLOCKED) {
      throw new Error('Target gladiator is blocked from this arena');
    }

    const now = Date.now();
    await quizRef.update({
      created_by: newOwnerId,
      owner_transferred_at: now,
    });

    const link = `/battle/${quizId}`;
    await notificationService.create({
      userId: newOwnerId,
      type: 'ownership_transferred',
      title: 'Arena Ownership Transferred',
      description: `You are now the Commander of arena ${quizId}.`,
      createdAt: now,
      link,
    });
    await notificationService.create({
      userId: quiz.created_by,
      type: 'ownership_transferred',
      title: 'Arena Ownership Transferred',
      description: `Ownership of arena ${quizId} was transferred to another Commander.`,
      createdAt: now,
      link,
    });

    await writeBattleLog({
      quizId,
      event: 'ownership_transferred',
      actor: auth.uid,
      actorRole: 'commander',
      metadata: { from: quiz.created_by, to: newOwnerId },
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return battleErrorResponse(err);
  }
}
