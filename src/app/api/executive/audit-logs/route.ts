import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

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
    const limitParam = parseInt(searchParams.get('limit') || '100', 10);
    const limit = Number.isNaN(limitParam) ? 100 : Math.min(limitParam, 500);

    const pageSize = Math.min(limit, 500);
    const cursor = searchParams.get('cursor');

    let query = getAdminDb().collection('auditLogs').orderBy('timestamp', 'desc').limit(pageSize * 2);
    if (cursor) {
      const cursorDoc = await getAdminDb().collection('auditLogs').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }
    const snap = await query.get();

    let logs = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        timestamp: data.timestamp,
        actor: data.actor,
        actorRole: data.actorRole,
        action: data.action,
        target: data.target,
        metadata: data.metadata || {},
        createdAt: data.createdAt,
      };
    });

    if (action) logs = logs.filter(l => l.action === action);
    if (actorRole) logs = logs.filter(l => l.actorRole === actorRole);
    if (dateFrom) logs = logs.filter(l => l.timestamp >= parseInt(dateFrom, 10));
    if (dateTo) logs = logs.filter(l => l.timestamp <= parseInt(dateTo, 10));
    logs = logs.slice(0, pageSize);

    const allActions = new Set<string>();
    const allRoles = new Set<string>();
    logs.forEach(l => {
      if (l.action) allActions.add(l.action);
      if (l.actorRole) allRoles.add(l.actorRole);
    });

    return NextResponse.json({
      logs,
      nextCursor: logs.length === pageSize ? logs[logs.length - 1].id : null,
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
