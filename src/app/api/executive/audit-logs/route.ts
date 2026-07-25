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

    const snap = await getAdminDb().collection('auditLogs')
      .orderBy('timestamp', 'desc')
      .limit(limit * 2)
      .get();
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
    logs = logs.slice(0, limit);

    // Get unique actions and actor roles for filters
    const allActionsSnap = await getAdminDb().collection('auditLogs')
      .select('action', 'actorRole')
      .get();
    const allActions = new Set<string>();
    const allRoles = new Set<string>();
    allActionsSnap.docs.forEach(d => {
      const data = d.data();
      if (data.action) allActions.add(data.action);
      if (data.actorRole) allRoles.add(data.actorRole);
    });

    return NextResponse.json({
      logs,
      filters: {
        actions: Array.from(allActions).sort(),
        roles: Array.from(allRoles).sort(),
        total: allActionsSnap.docs.length,
      },
    });
  } catch (err: any) {
    console.error('[AuditLogs] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
