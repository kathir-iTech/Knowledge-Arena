import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { auditService } from '@/services/audit.service';
import { notificationService } from '@/services/notification.service';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const executiveAuth = await verifyFirebaseTokenWithRole(req, 'executive');
  const commanderAuth = await verifyFirebaseTokenWithRole(req, 'commander');
  if (!executiveAuth && !commanderAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const auth = executiveAuth || commanderAuth!;
  const role = executiveAuth ? 'executive' : 'commander';

  try {
    const snapshot = await getAdminDb().collection('announcements')
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();
    let announcements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (role === 'commander') {
      announcements = announcements.filter((a: any) =>
        a.targetRole === 'all_commanders' || (a.targetRole === 'specific' && a.targetId === auth.uid)
      );
    }

    return NextResponse.json({ announcements });
  } catch (err: any) {
    console.error('[Announcements GET] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const executiveAuth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!executiveAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { text, targetCommanderId } = await req.json();
    if (!text?.trim()) {
      return NextResponse.json({ error: 'Announcement text is required' }, { status: 400 });
    }

    const docRef = getAdminDb().collection('announcements').doc();
    await docRef.set({
      senderId: executiveAuth.uid,
      text: text.trim(),
      targetRole: targetCommanderId ? 'specific' : 'all_commanders',
      targetId: targetCommanderId || null,
      readBy: [],
      createdAt: Date.now(),
    });

    await auditService.record({
      timestamp: Date.now(),
      actor: executiveAuth.uid,
      actorRole: 'executive',
      action: 'announcement_sent',
      target: docRef.id,
      metadata: { targetRole: targetCommanderId ? 'specific' : 'all' },
    });
    await notificationService.create({
      type: 'new_announcement',
      title: 'Announcement Published',
      description: `${text.trim().slice(0, 80)}${text.trim().length > 80 ? '...' : ''}`,
      createdAt: Date.now(),
      userId: executiveAuth.uid,
      link: '/executive/messages',
      metadata: { announcementId: docRef.id },
    });

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (err: any) {
    console.error('[Announcements POST] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const executiveAuth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!executiveAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id, text } = await req.json();
    if (!id || !text?.trim()) {
      return NextResponse.json({ error: 'id and text are required' }, { status: 400 });
    }

    const ref = getAdminDb().collection('announcements').doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
    }

    const existing = doc.data()!;
    if (existing.senderId !== executiveAuth.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await ref.update({
      text: text.trim(),
      editedAt: Date.now(),
    });

    await auditService.record({
      timestamp: Date.now(),
      actor: executiveAuth.uid,
      actorRole: 'executive',
      action: 'announcement_edited',
      target: id,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Announcements PUT] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const executiveAuth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!executiveAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    let id = searchParams.get('id');
    if (!id) {
      try {
        const body = await req.json();
        id = body?.id;
      } catch {}
    }

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const ref = getAdminDb().collection('announcements').doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
    }

    const existing = doc.data()!;
    if (existing.senderId !== executiveAuth.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await ref.delete();

    await auditService.record({
      timestamp: Date.now(),
      actor: executiveAuth.uid,
      actorRole: 'executive',
      action: 'announcement_deleted',
      target: id,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Announcements DELETE] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
