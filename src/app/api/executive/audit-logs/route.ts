import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    const actorRole = searchParams.get('actorRole');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const cursor = searchParams.get('cursor');

    let query = getAdminDb().collection('auditLogs').orderBy('timestamp', 'desc').limit(PAGE_SIZE + 1);
    if (cursor) {
      const cursorDoc = await getAdminDb().collection('auditLogs').doc(cursor).get();
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
        timestamp: data.timestamp,
        actor: data.actor,
        actorRole: data.actorRole,
        action: data.action,
        target: data.target,
        metadata: data.metadata || {},
      };
    });

    if (action) logs = logs.filter(l => l.action === action);
    if (actorRole) logs = logs.filter(l => l.actorRole === actorRole);
    if (dateFrom) logs = logs.filter(l => l.timestamp >= parseInt(dateFrom, 10));
    if (dateTo) logs = logs.filter(l => l.timestamp <= parseInt(dateTo, 10));

    const nextCursor = hasMore && docs.length > 0 ? docs[docs.length - 1].id : null;

    const allActions = new Set<string>();
    const allRoles = new Set<string>();
    logs.forEach(l => {
      if (l.action) allActions.add(l.action);
      if (l.actorRole) allRoles.add(l.actorRole);
    });

    return NextResponse.json({
      logs,
      nextCursor,
      hasMore,
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
