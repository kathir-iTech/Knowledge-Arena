import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { auditService } from '@/services/audit.service';
import { notificationService } from '@/services/notification.service';
import { validateAttachments } from '@/lib/file-security';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

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

    const snapshot = await query.limit(200).get();
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
    const rateLimitResponse = await enforceRateLimit(`write:${auth.uid}`, Limits.WRITE_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;
    const body = await req.json();
    const { id, status, comment, replyAttachments } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    }

    if (!['pending', 'approved', 'rejected', 'completed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    if (replyAttachments) {
      const validation = validateAttachments(replyAttachments);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
    }

    const updateData: Record<string, unknown> = {
      status,
      handledBy: auth.uid,
      handledAt: Date.now(),
    };
    if (comment !== undefined) updateData.executiveComment = comment;
    if (replyAttachments !== undefined) updateData.replyAttachments = replyAttachments;

    const docRef = getAdminDb().collection('executive_requests').doc(id);
    const existingDoc = await docRef.get();
    if (!existingDoc.exists) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }
    await docRef.update(updateData);

    await auditService.record({
      timestamp: Date.now(),
      actor: auth.uid,
      actorRole: 'executive',
      action: 'request_handled',
      target: id,
      metadata: { status, comment: comment || null },
    });

    // Notify the requesting commander, not the executive themselves.
    const requestData = existingDoc.data();
    const commanderId = requestData?.commanderId || null;
    if (commanderId) {
      await notificationService.create({
        type: 'commander_request',
        title: `Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        description: `Your request "${requestData?.title || id}" was ${status} by the executive team.`,
        createdAt: Date.now(),
        userId: commanderId,
        link: `/commander/requests?requestId=${id}`,
        metadata: { requestId: id, status },
      });
    }

    return NextResponse.json({ success: true, id, status });
  } catch (err: any) {
    console.error('[ExecutiveRequests PATCH] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const rateLimitResponse = await enforceRateLimit(`write:${auth.uid}`, Limits.WRITE_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Request id is required' }, { status: 400 });
    }

    const docRef = getAdminDb().collection('executive_requests').doc(id);
    const existingDoc = await docRef.get();
    if (!existingDoc.exists) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Delete the request document
    await docRef.delete();

    // Clean up related notifications
    const notifSnap = await getAdminDb().collection('notifications')
      .where('metadata.requestId', '==', id)
      .get();
    if (!notifSnap.empty) {
      const batch = getAdminDb().batch();
      notifSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    await auditService.record({
      timestamp: Date.now(),
      actor: auth.uid,
      actorRole: 'executive',
      action: 'request_deleted',
      target: id,
      metadata: {},
    });

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    console.error('[ExecutiveRequests DELETE] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
