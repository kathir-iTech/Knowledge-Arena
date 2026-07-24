import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET(req: NextRequest) {
  const executiveAuth = await verifyFirebaseTokenWithRole(req, 'executive');
  const commanderAuth = await verifyFirebaseTokenWithRole(req, 'commander');
  if (!executiveAuth && !commanderAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const auth = executiveAuth || commanderAuth!;
  const role = executiveAuth ? 'executive' : 'commander';

  try {
    let query = getAdminDb().collection('announcements').orderBy('createdAt', 'desc');

    const snapshot = await query.get();
    let announcements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (role === 'commander') {
      announcements = announcements.filter((a: any) =>
        a.targetRole === 'all_commanders' || (a.targetRole === 'specific' && a.targetId === auth.uid)
      );
    }

    return NextResponse.json({ announcements });
  } catch (err: any) {
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

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
