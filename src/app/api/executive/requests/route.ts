import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { auditService } from '@/services/audit.service';
import { notificationService } from '@/services/notification.service';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    let query = getAdminDb().collection('executive_requests').orderBy('createdAt', 'desc');
    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.get();
    const requests = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ requests });
  } catch (err: any) {
    console.error('[ExecutiveRequests GET] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id, status, comment } = await req.json();

    if (!id || !status) {
      return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    }

    if (!['pending', 'approved', 'rejected', 'completed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      status,
      handledBy: auth.uid,
      handledAt: Date.now(),
    };
    if (comment !== undefined) updateData.executiveComment = comment;

    await getAdminDb().collection('executive_requests').doc(id).update(updateData);

    await auditService.record({
      timestamp: Date.now(),
      actor: auth.uid,
      actorRole: 'executive',
      action: 'request_handled',
      target: id,
      metadata: { status, comment: comment || null },
    });
    await notificationService.create({
      type: status === 'approved' ? 'gladiator_registration' : 'operation_failed',
      title: `Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      description: `Executive ${status} the request.`,
      createdAt: Date.now(),
      link: '/executive/requests',
      metadata: { requestId: id, status },
    });

    return NextResponse.json({ success: true, id, status });
  } catch (err: any) {
    console.error('[ExecutiveRequests PATCH] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
