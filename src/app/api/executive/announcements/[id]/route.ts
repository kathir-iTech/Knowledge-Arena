import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const _rl = await enforceRateLimit(`read:${auth.uid}`, Limits.READ_PER_USER);
    if (_rl) return _rl;

    const { id } = await params;
    const db = getAdminDb();

    const annSnap = await db.collection('announcements').doc(id).get();
    if (!annSnap.exists) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
    }
    const data = annSnap.data()!;

    // Sender info
    let sender: { name: string; email: string | null } | null = null;
    if (data.senderId) {
      const senderSnap = await db.collection('users').doc(data.senderId).get().catch(() => null);
      if (senderSnap?.exists) {
        const sData = senderSnap.data();
        if (sData) sender = { name: sData.displayName || sData.name || 'Unknown', email: sData.email || null };
      }
    }

    // Read receipts -> commander names
    const readBy: string[] = Array.isArray(data.readBy) ? data.readBy : [];
    const readReceipts: Array<{ uid: string; name: string }> = [];
    if (readBy.length > 0) {
      const readerSnaps = await Promise.allSettled(
        readBy.map(uid => db.collection('users').doc(uid).get())
      );
      readerSnaps.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value.exists) {
          const rData = r.value.data();
          if (rData) readReceipts.push({ uid: readBy[i], name: rData.displayName || rData.name || readBy[i].slice(0, 8) });
        }
      });
    }

    // Target commander info for 'specific' announcements
    let targetCommander: { uid: string; name: string } | null = null;
    if (data.targetRole === 'specific' && data.targetId) {
      const tSnap = await db.collection('users').doc(data.targetId).get().catch(() => null);
      if (tSnap?.exists) {
        const tData = tSnap.data();
        if (tData) targetCommander = { uid: data.targetId, name: tData.displayName || tData.name || 'Unknown' };
      }
    }

    return NextResponse.json({
      announcement: {
        id,
        text: data.text || '',
        senderId: data.senderId || null,
        sender,
        targetRole: data.targetRole || 'all_commanders',
        targetId: data.targetId || null,
        targetCommander,
        readBy,
        readReceipts,
        readCount: readBy.length,
        createdAt: data.createdAt ?? null,
        editedAt: data.editedAt ?? null,
      },
    });
  } catch (err: any) {
    console.error('[AnnouncementDetail GET] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}