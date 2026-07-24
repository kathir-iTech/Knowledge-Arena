import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { auditService } from '@/services/audit.service';
import { notificationService } from '@/services/notification.service';

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'commander');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { title, type, description } = await req.json();

    if (!title || !type) {
      return NextResponse.json({ error: 'Title and type are required' }, { status: 400 });
    }

    const validTypes = ['question_bank', 'student_report', 'arena_approval', 'other'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Invalid request type' }, { status: 400 });
    }

    const docRef = await getAdminDb().collection('executive_requests').add({
      title,
      type,
      description: description || '',
      status: 'pending',
      commanderId: auth.uid,
      commanderEmail: auth.email,
      createdAt: Date.now(),
      handledAt: null,
      handledBy: null,
      executiveComment: null,
    });

    await auditService.record({
      timestamp: Date.now(),
      actor: auth.uid,
      actorRole: 'commander',
      action: 'request_created',
      target: docRef.id,
      metadata: { title, type },
    });
    await notificationService.create({
      type: 'commander_request',
      title: 'New Commander Request',
      description: `${title} (${type})`,
      createdAt: Date.now(),
      link: '/executive/requests',
      metadata: { requestId: docRef.id, type },
    });

    return NextResponse.json({ id: docRef.id, success: true });
  } catch (err: any) {
    console.error('[CommanderRequests POST] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'commander');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const snapshot = await getAdminDb()
      .collection('executive_requests')
      .where('commanderId', '==', auth.uid)
      .orderBy('createdAt', 'desc')
      .get();

    const requests = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ requests });
  } catch (err: any) {
    console.error('[CommanderRequests GET] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
