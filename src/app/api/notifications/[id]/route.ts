import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verify-auth';
import { notificationService } from '@/services/notification.service';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyFirebaseToken(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  try {
    const ref = getAdminDb().collection(COLLECTIONS.NOTIFICATIONS).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    const data = snap.data();
    if (!data || data.userId !== auth.uid) {
      // Allow executive to read any? For generic route, only owner can read.
      // Check exec role via token? Fail if not owner.
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({
      notification: {
        id,
        ...data,
        createdAt: data.createdAt?.toMillis?.() ?? data.createdAt ?? null,
      },
    });
  } catch (err: any) {
    console.error('[Notification GET] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Failed to fetch notification' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyFirebaseToken(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rateLimitResponse = await enforceRateLimit(`write:${auth.uid}`, Limits.WRITE_PER_USER);
  if (rateLimitResponse) return rateLimitResponse;

  const { id } = await params;
  try {
    const ref = getAdminDb().collection(COLLECTIONS.NOTIFICATIONS).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    const data = snap.data();
    if (!data || data.userId !== auth.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await notificationService.delete(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Notification DELETE] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Failed to delete notification' }, { status: 500 });
  }
}
