import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verify-auth';
import { notificationService } from '@/services/notification.service';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseToken(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const cursorId = searchParams.get('cursor');
    const cursorCreatedAt = searchParams.get('cursorCreatedAt');
    const cursor =
      cursorId && cursorCreatedAt && Number.isFinite(Number(cursorCreatedAt))
        ? { id: cursorId, createdAt: Number(cursorCreatedAt) }
        : null;
    const { notifications, nextCursor } = await notificationService.getAll({
      limit: 100,
      unreadOnly,
      userId: auth.uid,
      cursor,
    });
    const unreadCount = await notificationService.getUnreadCount(auth.uid);
    return NextResponse.json({ notifications, unreadCount, nextCursor });
  } catch (err: any) {
    console.error('[Notifications GET] Error:', err?.name, err?.message, err?.stack);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await verifyFirebaseToken(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const rateLimitResponse = enforceRateLimit(`write:${auth.uid}`, Limits.WRITE_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (body.markAllRead) {
      await notificationService.markAllRead(auth.uid);
    } else if (body.ids && Array.isArray(body.ids)) {
      await notificationService.markRead(body.ids, auth.uid);
    } else {
      return NextResponse.json({ error: 'Provide markAllRead or ids array' }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Notifications PATCH] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
  }
}
