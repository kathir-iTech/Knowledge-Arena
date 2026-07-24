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

    let query: FirebaseFirestore.Query = getAdminDb()
      .collection('auditLogs')
      .orderBy('timestamp', 'desc');

    if (action) {
      query = query.where('action', '==', action);
    }
    if (actorRole) {
      query = query.where('actorRole', '==', actorRole);
    }
    if (dateFrom) {
      query = query.where('timestamp', '>=', parseInt(dateFrom, 10));
    }
    if (dateTo) {
      query = query.where('timestamp', '<=', parseInt(dateTo, 10));
    }

    const snap = await query.limit(limit).get();
    const logs = snap.docs.map(d => {
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
