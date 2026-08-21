import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithAnyRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { notificationService } from '@/services/notification.service';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithAnyRole(req, ['commander', 'executive']);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const rateLimitResponse = enforceRateLimit(`arena-notify:${auth.uid}`, Limits.WRITE_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await req.json().catch(() => ({}));
    const roomCode = typeof body.roomCode === 'string' ? body.roomCode.trim() : typeof body.quizId === 'string' ? body.quizId.trim() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!roomCode) return NextResponse.json({ error: 'Missing roomCode/quizId' }, { status: 400 });
    if (!title) return NextResponse.json({ error: 'Missing title' }, { status: 400 });

    const db = getAdminDb();
    // Fetch all gladiators
    const snap = await db.collection(COLLECTIONS.USERS).where('role', '==', 'gladiator').get();
    const gladiators = snap.docs.filter(d => !d.data().deleted);
    if (gladiators.length === 0) {
      return NextResponse.json({ success: true, notified: 0 });
    }

    const now = Date.now();
    const link = `/battle/${roomCode}`;

    // Fan-out via notificationService.create per gladiator (batched concurrency 20)
    const CHUNK = 20;
    let notified = 0;
    for (let i = 0; i < gladiators.length; i += CHUNK) {
      const chunk = gladiators.slice(i, i + CHUNK);
      const results = await Promise.all(
        chunk.map(doc =>
          notificationService.create({
            type: 'new_arena',
            title: 'New Arena Published',
            description: `Arena "${title}" is now open — join with code ${roomCode}`,
            createdAt: now,
            userId: doc.id,
            link,
            metadata: { quizId: roomCode, title, roomCode },
          })
        )
      );
      notified += results.filter(id => !!id).length;
    }

    return NextResponse.json({ success: true, notified });
  } catch (err: any) {
    console.error('[ArenaNotify POST] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
