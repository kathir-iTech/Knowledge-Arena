import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { notificationService } from '@/services/notification.service';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const notifications = await notificationService.getAll({ limit: 100, unreadOnly });
    const unreadCount = await notificationService.getUnreadCount();
    return NextResponse.json({ notifications, unreadCount });
  } catch (err: any) {
    console.error('[Notifications GET] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    if (body.markAllRead) {
      await notificationService.markAllRead();
    } else if (body.ids && Array.isArray(body.ids)) {
      await notificationService.markRead(body.ids);
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Notifications PATCH] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
  }
}
