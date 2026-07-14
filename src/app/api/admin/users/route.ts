import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { rateLimiter, getClientIp, buildRateLimitHeaders, Limits } from '@/lib/rate-limiter';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimiter.check(`admin:${ip}`, Limits.LOGIN_PER_IP);
  if (!rl.allowed) {
    return NextResponse.json({ error: Limits.LOGIN_PER_IP.message }, { status: 429, headers: buildRateLimitHeaders(rl) });
  }

  const auth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { email, password, displayName } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const userRecord = await getAdminAuth().createUser({
      email,
      password,
      displayName: displayName || email.split('@')[0],
    });

    await getAdminDb().collection('users').doc(userRecord.uid).set({
      email,
      displayName: displayName || email.split('@')[0],
      role: 'commander',
      createdAt: Date.now(),
      createdBy: auth.uid,
      disabled: false,
    });

    return NextResponse.json({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
    });
  } catch (err: any) {
    const message = err?.message || 'Failed to create user';
    if (message.includes('EMAIL_EXISTS')) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role') || 'commander';

    const snapshot = await getAdminDb()
      .collection('users')
      .where('role', '==', role)
      .orderBy('createdAt', 'desc')
      .get();

    const users = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        uid: doc.id,
        email: data.email,
        displayName: data.displayName,
        role: data.role,
        disabled: data.disabled ?? false,
        createdAt: data.createdAt,
      };
    });

    return NextResponse.json({ users });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to list users' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { uid, disabled } = await req.json();

    if (!uid || typeof disabled !== 'boolean') {
      return NextResponse.json({ error: 'uid and disabled are required' }, { status: 400 });
    }

    await getAdminDb().collection('users').doc(uid).update({ disabled });

    if (disabled) {
      await getAdminAuth().updateUser(uid, { disabled: true });
    } else {
      await getAdminAuth().updateUser(uid, { disabled: false });
    }

    return NextResponse.json({ success: true, uid, disabled });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to update user' }, { status: 500 });
  }
}
