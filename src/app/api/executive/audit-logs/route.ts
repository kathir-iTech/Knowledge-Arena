import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

const PAGE_SIZE = 50;
// When filters are applied, we fetch a bounded window of the most recent logs
// and filter in memory. This keeps filter correctness for recent data without
// requiring new composite indexes per (action, actorRole, timestamp) combo.
const FILTER_WINDOW = 1000;

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const _rl = await enforceRateLimit(`executive:audit:${auth.uid}`, Limits.READ_PER_USER);
    if (_rl) return _rl;

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action')?.trim() || '';
    const actorRole = searchParams.get('actorRole')?.trim() || '';
    const actor = searchParams.get('actor')?.trim() || '';
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const cursor = searchParams.get('cursor');
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);

    const hasFilters = !!(action || actorRole || actor || dateFrom || dateTo);
    const db = getAdminDb();

    let snap;
    if (hasFilters) {
      snap = await db.collection('auditLogs').orderBy('timestamp', 'desc').limit(FILTER_WINDOW).get();
    } else {
      let query = db.collection('auditLogs').orderBy('timestamp', 'desc').limit(PAGE_SIZE + 1);
      if (cursor) {
        const cursorDoc = await db.collection('auditLogs').doc(cursor).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }
      snap = await query.get();
    }

    let docs = snap.docs;

    // Gather filter metadata from the full window (not just the current page)
    const allActions = new Set<string>();
    const allRoles = new Set<string>();
    const from = dateFrom ? parseInt(dateFrom, 10) : null;
    const to = dateTo ? parseInt(dateTo, 10) : null;

    let logs = docs.map(d => {
      const data = d.data();
      const timestamp = typeof data.timestamp === 'number' ? data.timestamp : 0;
      const log = {
        id: d.id,
        timestamp,
        actor: data.actor || '',
        actorRole: data.actorRole || '',
        action: data.action || '',
        target: data.target || '',
        metadata: data.metadata || {},
      };
      if (log.action) allActions.add(log.action);
      if (log.actorRole) allRoles.add(log.actorRole);
      return log;
    });

    if (action) logs = logs.filter(l => l.action === action);
    if (actorRole) logs = logs.filter(l => l.actorRole === actorRole);
    if (actor) logs = logs.filter(l => l.actor.toLowerCase().includes(actor.toLowerCase()));
    if (from) logs = logs.filter(l => l.timestamp >= from);
    if (to) logs = logs.filter(l => l.timestamp <= to);

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
        actions: Array.from(allActions).sort(),
        roles: Array.from(allRoles).sort(),
      },
    });
  } catch (err: any) {
    console.error('[AuditLogs] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}