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

    try {
      await getAdminDb().collection('users').doc(userRecord.uid).set({
        email,
        displayName: displayName || email.split('@')[0],
        role: 'commander',
        createdAt: Date.now(),
        createdBy: auth.uid,
        disabled: false,
      });
    } catch (firestoreErr) {
      // Auth user created but Firestore write failed — clean up the orphan
      await getAdminAuth().deleteUser(userRecord.uid).catch(() => {});
      return NextResponse.json({ error: 'Failed to create user profile. Please try again.' }, { status: 500 });
    }

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
    if (message.includes('WEAK_PASSWORD') || message.includes('password')) {
      return NextResponse.json({ error: 'Password is too weak. Use at least 6 characters.' }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  let auth;
  try {
    auth = await verifyFirebaseTokenWithRole(req, 'executive');
  } catch {
    return NextResponse.json({ error: 'Authentication service unavailable' }, { status: 503 });
  }
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role') || 'commander';

    if (!['commander', 'gladiator'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role filter' }, { status: 400 });
    }

    let snapshot;
    try {
      snapshot = await getAdminDb()
        .collection('users')
        .where('role', '==', role)
        .get();
    } catch (queryErr: any) {
      console.error('GET /api/admin/users Firestore query failed', queryErr?.message || queryErr);
      return NextResponse.json({ error: 'Database query failed', details: 'users' }, { status: 500 });
    }

    const users = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        uid: doc.id,
        email: data.email || null,
        displayName: data.displayName || data.name || null,
        role: data.role || role,
        disabled: typeof data.disabled === 'boolean' ? data.disabled : false,
        createdAt: data.createdAt || null,
      };
    });

    users.sort((a, b) => {
      if (!a.createdAt || !b.createdAt) return a.createdAt ? -1 : b.createdAt ? 1 : 0;
      return b.createdAt - a.createdAt;
    });

    const enriched = users.map(u => ({ ...u }));

    if (role === 'commander' && users.length > 0) {
      const uids = users.map(u => u.uid);
      try {
        const quizzesSnap = await getAdminDb()
          .collection('quizzes')
          .where('created_by', 'in', uids.slice(0, 30))
          .get();

        const arenaCounts: Record<string, number> = {};
        const lastActiveMap: Record<string, number | null> = {};
        for (const qDoc of quizzesSnap.docs) {
          const qData = qDoc.data();
          const creator = qData.created_by;
          if (creator) {
            arenaCounts[creator] = (arenaCounts[creator] || 0) + 1;
            if (qData.created_at && (!lastActiveMap[creator] || qData.created_at > lastActiveMap[creator]!)) {
              lastActiveMap[creator] = qData.created_at;
            }
          }
        }

        for (const u of enriched) {
          (u as any).arenaCount = arenaCounts[u.uid] || 0;
          (u as any).lastActive = lastActiveMap[u.uid] || null;
        }
      } catch (enrichErr: any) {
        console.error('GET /api/admin/users commander enrichment failed', enrichErr?.message || enrichErr);
      }
    }

    if (role === 'gladiator' && users.length > 0) {
      const uids = users.map(u => u.uid);
      try {
        const partSnapshot = await getAdminDb()
          .collectionGroup('participants')
          .where('user_id', 'in', uids.slice(0, 30))
          .get();

        const battleCounts: Record<string, number> = {};
        const scoreSums: Record<string, number> = {};

        for (const pDoc of partSnapshot.docs) {
          const pData = pDoc.data();
          const userId = pData.user_id;
          if (userId) {
            battleCounts[userId] = (battleCounts[userId] || 0) + 1;
            scoreSums[userId] = (scoreSums[userId] || 0) + (pData.score || 0);
          }
        }

        for (const u of enriched) {
          (u as any).totalBattles = battleCounts[u.uid] || 0;
          const totalScore = scoreSums[u.uid] || 0;
          const totalCount = battleCounts[u.uid] || 0;
          (u as any).avgScore = totalCount > 0 ? Math.round(totalScore / totalCount) : 0;
          (u as any).lastActive = null;
        }
      } catch (enrichErr: any) {
        console.error('GET /api/admin/users gladiator enrichment failed', enrichErr?.message || enrichErr);
      }
    }

    return NextResponse.json({ users: enriched });
  } catch (err: any) {
    console.error('GET /api/admin/users unexpected error', err?.message || err);
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 });
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
