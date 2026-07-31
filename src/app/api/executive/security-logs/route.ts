import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';

export const runtime = 'nodejs';

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const event = searchParams.get('event');
    const actor = searchParams.get('actor');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const cursor = searchParams.get('cursor');

    let query = getAdminDb().collection(COLLECTIONS.SECURITY_LOGS).orderBy('createdAt', 'desc').limit(PAGE_SIZE + 1);
    if (cursor) {
      const cursorDoc = await getAdminDb().collection(COLLECTIONS.SECURITY_LOGS).doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }
    const snap = await query.get();

    const hasMore = snap.docs.length > PAGE_SIZE;
    const docs = snap.docs.slice(0, PAGE_SIZE);

    let logs = docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        event: data.event,
        actor: data.actor,
        actorRole: data.actorRole,
        target: data.target,
        detail: data.detail,
        metadata: data.metadata || {},
        timestamp: data.createdAt?.toMillis?.() ?? data.timestamp ?? null,
      };
    });

    if (event) logs = logs.filter(l => l.event === event);
    if (actor) logs = logs.filter(l => (l.actor || '').toLowerCase().includes(actor.toLowerCase()));
    if (dateFrom) logs = logs.filter(l => l.timestamp && l.timestamp >= parseInt(dateFrom, 10));
    if (dateTo) logs = logs.filter(l => l.timestamp && l.timestamp <= parseInt(dateTo, 10));

    const nextCursor = hasMore && docs.length > 0 ? docs[docs.length - 1].id : null;

    const allEvents = new Set<string>();
    logs.forEach(l => {
      if (l.event) allEvents.add(l.event);
    });

    return NextResponse.json({
      logs,
      nextCursor,
      hasMore,
      filters: {
        events: Array.from(allEvents).sort(),
      },
    });
  } catch (err: any) {
    console.error('[SecurityLogs] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
