import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

const PAGE_SIZE = 50;
// When filters are applied, we fetch a bounded window of the most recent logs
// and filter in memory. This keeps filter correctness for recent data without
// requiring new composite indexes per (event, timestamp) combo.
const FILTER_WINDOW = 1000;

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const _rl = enforceRateLimit(`executive:security:${auth.uid}`, Limits.READ_PER_USER);
    if (_rl) return _rl;

    const { searchParams } = new URL(req.url);
    const event = searchParams.get('event')?.trim() || '';
    const actor = searchParams.get('actor')?.trim() || '';
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const cursor = searchParams.get('cursor');
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);

    const hasFilters = !!(event || actor || dateFrom || dateTo);
    const db = getAdminDb();

    let snap;
    if (hasFilters) {
      snap = await db.collection(COLLECTIONS.SECURITY_LOGS).orderBy('createdAt', 'desc').limit(FILTER_WINDOW).get();
    } else {
      let query = db.collection(COLLECTIONS.SECURITY_LOGS).orderBy('createdAt', 'desc').limit(PAGE_SIZE + 1);
      if (cursor) {
        const cursorDoc = await db.collection(COLLECTIONS.SECURITY_LOGS).doc(cursor).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }
      snap = await query.get();
    }

    const docs = snap.docs;

    const allEvents = new Set<string>();
    const from = dateFrom ? parseInt(dateFrom, 10) : null;
    const to = dateTo ? parseInt(dateTo, 10) : null;

    let logs = docs.map(d => {
      const data = d.data();
      const timestamp = data.createdAt?.toMillis?.() ?? data.timestamp ?? null;
      const log = {
        id: d.id,
        event: data.event || '',
        actor: data.actor || '',
        actorRole: data.actorRole || '',
        target: data.target || '',
        detail: data.detail || '',
        metadata: data.metadata || {},
        timestamp,
      };
      if (log.event) allEvents.add(log.event);
      return log;
    });

    if (event) logs = logs.filter(l => l.event === event);
    if (actor) logs = logs.filter(l => l.actor.toLowerCase().includes(actor.toLowerCase()));
    if (from) logs = logs.filter(l => l.timestamp && l.timestamp >= from);
    if (to) logs = logs.filter(l => l.timestamp && l.timestamp <= to);

    let paginated: typeof logs;
    let hasMore: boolean;
    let nextCursor: string | null = null;

    if (hasFilters) {
      const startIdx = (page - 1) * PAGE_SIZE;
      paginated = logs.slice(startIdx, startIdx + PAGE_SIZE);
      hasMore = startIdx + PAGE_SIZE < logs.length;
    } else {
      hasMore = docs.length > PAGE_SIZE;
      paginated = logs.slice(0, PAGE_SIZE);
      nextCursor = hasMore && paginated.length > 0 ? paginated[paginated.length - 1].id : null;
    }

    return NextResponse.json({
      logs: paginated,
      nextCursor,
      hasMore,
      page,
      filters: {
        events: Array.from(allEvents).sort(),
      },
    });
  } catch (err: any) {
    console.error('[SecurityLogs] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}