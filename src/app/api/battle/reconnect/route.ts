import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { COLLECTIONS, RECONNECT_SUSPICION_WINDOW_MS } from '@/lib/constants';
import { writeBattleLog, getMs } from '@/lib/battle-server';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import { logSecurityViolation } from '@/lib/security-log';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseToken(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rateLimitResponse = enforceRateLimit(`battle:reconnect:${auth.uid}`, Limits.BATTLE_ACTION_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await req.json().catch(() => ({}));
    const quizId = typeof body.quizId === 'string' ? body.quizId.trim() : '';
    const sessionToken = typeof body.sessionToken === 'string' && body.sessionToken.length > 0 ? body.sessionToken : '';
    if (!quizId) return NextResponse.json({ error: 'Missing quizId' }, { status: 400 });

    const db = getAdminDb();
    const partRef = db
      .collection(COLLECTIONS.QUIZZES).doc(quizId)
      .collection(COLLECTIONS.PARTICIPANTS).doc(auth.uid);
    const partSnap = await partRef.get();
    if (!partSnap.exists) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
    }

    const now = Date.now();
    const lastReconnect = getMs(partSnap.data()?.last_reconnected_at);
    const suspicious =
      partSnap.data()?.last_reconnected_at != null && now - lastReconnect < RECONNECT_SUSPICION_WINDOW_MS;

    const storedSessionToken = partSnap.data()?.session_token;
    const sessionReplaced =
      sessionToken !== '' &&
      typeof storedSessionToken === 'string' &&
      storedSessionToken !== '' &&
      storedSessionToken !== sessionToken;

    if (suspicious) {
      logSecurityViolation(auth.uid, 'suspicious_reconnect', `quiz=${quizId}`, {
        quizId,
        reconnectWindowMs: now - lastReconnect,
      });
    }
    if (sessionReplaced) {
      logSecurityViolation(auth.uid, 'session_replaced', `quiz=${quizId}`, { quizId });
    }

    await partRef.update({
      reconnect_count: FieldValue.increment(1),
      last_reconnected_at: now,
      ...(suspicious ? { suspicious_reconnects: FieldValue.increment(1) } : {}),
    });

    await writeBattleLog({
      quizId,
      event: 'reconnect',
      actor: auth.uid,
      actorRole: 'gladiator',
      metadata: { suspicious, sessionReplaced },
    });

    return NextResponse.json({ ok: true, suspicious, sessionReplaced });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[Battle/reconnect]', message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
