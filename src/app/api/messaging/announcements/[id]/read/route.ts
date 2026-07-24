import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  const commanderAuth = await verifyFirebaseTokenWithRole(req, 'commander');
  if (!commanderAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const annId = segments[segments.length - 2];

    if (!annId) {
      return NextResponse.json({ error: 'Announcement ID is required' }, { status: 400 });
    }

    const ref = getAdminDb().collection('announcements').doc(annId);
    const doc = await ref.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
    }

    const data = doc.data()!;
    const targetRole = data.targetRole;
    const targetId = data.targetId;

    // Verify this announcement is intended for this commander
    const canRead = targetRole === 'all_commanders' ||
      (targetRole === 'specific' && targetId === commanderAuth.uid);
    if (!canRead) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const readBy: string[] = data.readBy || [];
    if (!readBy.includes(commanderAuth.uid)) {
      readBy.push(commanderAuth.uid);
      await ref.update({ readBy });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
