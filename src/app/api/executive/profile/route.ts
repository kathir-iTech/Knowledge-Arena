import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { auditService } from '@/services/audit.service';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const userDoc = await getAdminDb().collection('users').doc(auth.uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const data = userDoc.data()!;
    const firebaseUser = await getAdminAuth().getUser(auth.uid);

    const auditSnap = await getAdminDb().collection('auditLogs')
      .where('actor', '==', auth.uid)
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();

    const recentActivity = auditSnap.docs.map(d => ({
      id: d.id,
      action: d.data().action,
      target: d.data().target,
      timestamp: d.data().timestamp,
    }));

    return NextResponse.json({
      profile: {
        uid: auth.uid,
        name: data.name || '',
        email: data.email || auth.email || '',
        avatar: data.avatar || '',
        role: data.role || 'executive',
        lastLogin: firebaseUser.metadata.lastSignInTime || null,
        createdAt: firebaseUser.metadata.creationTime || null,
        lastActivity: recentActivity[0]?.timestamp || null,
        actionCount: recentActivity.length,
      },
      recentActivity: recentActivity.slice(0, 20),
    });
  } catch (err: any) {
    console.error('[Profile] Error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length < 1 || body.name.length > 100) {
        return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
      }
      updateData.name = body.name.trim();
    }

    if (body.avatar !== undefined) {
      if (typeof body.avatar !== 'string' || body.avatar.length > 10) {
        return NextResponse.json({ error: 'Invalid avatar' }, { status: 400 });
      }
      updateData.avatar = body.avatar;
    }

    if (body.password !== undefined) {
      if (typeof body.password !== 'string' || body.password.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
      }
      await getAdminAuth().updateUser(auth.uid, { password: body.password });
    }

    if (Object.keys(updateData).length > 0) {
      await getAdminDb().collection('users').doc(auth.uid).update(updateData);
    }

    await auditService.record({
      timestamp: Date.now(),
      actor: auth.uid,
      actorRole: 'executive',
      action: 'profile_updated',
      target: auth.uid,
      metadata: { updatedFields: Object.keys(body) },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Profile] Update error:', err?.message);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
