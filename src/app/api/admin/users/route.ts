import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { rateLimiter, getClientIp, buildRateLimitHeaders, Limits } from '@/lib/rate-limiter';
import { auditService } from '@/services/audit.service';
import { notificationService } from '@/services/notification.service';

export const runtime = 'nodejs';

async function authenticateExecutive(req: NextRequest) {
  try {
    return await verifyFirebaseTokenWithRole(req, 'executive');
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  console.log('[AdminUsers][POST] Start');
  try {
    const ip = getClientIp(req);
    const rl = rateLimiter.check(`admin:${ip}`, Limits.LOGIN_PER_IP);
    if (!rl.allowed) {
      return NextResponse.json({ error: Limits.LOGIN_PER_IP.message }, { status: 429, headers: buildRateLimitHeaders(rl) });
    }

    const auth = await authenticateExecutive(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email, password, displayName } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (!email.includes('@') || !email.includes('.')) {
      return NextResponse.json({ error: 'Invalid email format. Use a valid email address or a username (will be converted to email format).' }, { status: 400 });
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

      await auditService.record({
        timestamp: Date.now(),
        actor: auth.uid,
        actorRole: 'executive',
        action: 'commander_created',
        target: userRecord.uid,
        metadata: { email, displayName: displayName || email.split('@')[0] },
      });
      await notificationService.create({
        type: 'commander_request',
        title: 'Commander Created',
        description: `${displayName || email.split('@')[0]} has been added as a commander.`,
        createdAt: Date.now(),
        link: '/executive/commanders',
        metadata: { commanderId: userRecord.uid },
      });
    } catch (firestoreErr) {
      console.error('[AdminUsers][POST] Firestore write failed, cleaning up Auth user');
      await getAdminAuth().deleteUser(userRecord.uid).catch(() => {});
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    return NextResponse.json({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
    });
  } catch (err: any) {
    const message = err?.message || 'Failed to create user';
    console.error('[AdminUsers][POST] Error:', err?.name, err?.code);
    if (message.includes('EMAIL_EXISTS')) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
    }
    if (message.includes('WEAK_PASSWORD') || message.includes('password')) {
      return NextResponse.json({ error: 'Password is too weak. Use at least 6 characters.' }, { status: 400 });
    }
    if (message.includes('INVALID_EMAIL') || message.includes('invalid email')) {
      return NextResponse.json({ error: 'Invalid email format. Use a valid email address.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  console.log('[AdminUsers][GET] Start');
  try {
    const auth = await authenticateExecutive(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role') || 'commander';

    if (!['commander', 'gladiator', 'executive'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role filter' }, { status: 400 });
    }

    let snapshot;
    try {
      snapshot = await getAdminDb()
        .collection('users')
        .where('role', '==', role)
        .get();
    } catch (queryErr: any) {
      console.error('[AdminUsers][GET] Firestore query failed:', queryErr?.name, queryErr?.code);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
      try {
        const uids = users.map(u => u.uid);

        const arenaCounts: Record<string, number> = {};
        const lastActiveMap: Record<string, number | null> = {};

        for (let i = 0; i < uids.length; i += 10) {
          const chunk = uids.slice(i, i + 10);
          try {
            const quizzesSnap = await getAdminDb()
              .collection('quizzes')
              .where('created_by', 'in', chunk)
              .get();
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
          } catch {
            // chunk failed — skip silently
          }
        }

        for (const u of enriched) {
          (u as any).arenaCount = arenaCounts[u.uid] || 0;
          (u as any).lastActive = lastActiveMap[u.uid] || null;
        }
      } catch (enrichErr: any) {
        console.error('[AdminUsers][GET] Commander enrichment failed:', enrichErr?.name, enrichErr?.code);
      }
    }

    if (role === 'gladiator' && users.length > 0) {
      try {
        const uids = users.map(u => u.uid);

        const battleCounts: Record<string, number> = {};
        const scoreSums: Record<string, number> = {};

        for (let i = 0; i < uids.length; i += 10) {
          const chunk = uids.slice(i, i + 10);
          try {
            const partSnapshot = await getAdminDb()
              .collectionGroup('participants')
              .where('user_id', 'in', chunk)
              .get();
            for (const pDoc of partSnapshot.docs) {
              const pData = pDoc.data();
              const userId = pData.user_id;
              if (userId) {
                battleCounts[userId] = (battleCounts[userId] || 0) + 1;
                scoreSums[userId] = (scoreSums[userId] || 0) + (pData.score || 0);
              }
            }
          } catch {
            // chunk failed — skip silently
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
        console.error('[AdminUsers][GET] Gladiator enrichment failed:', enrichErr?.name, enrichErr?.code);
      }
    }

    return NextResponse.json({ users: enriched });
  } catch (err: any) {
    console.error('[AdminUsers][GET] Unhandled error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  console.log('[AdminUsers][PATCH] Start');
  try {
    const auth = await authenticateExecutive(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uid, disabled, password, resetPassword } = await req.json();

    if (!uid) {
      return NextResponse.json({ error: 'uid is required' }, { status: 400 });
    }

    if (uid === auth.uid) {
      return NextResponse.json({ error: 'Cannot modify your own executive account' }, { status: 403 });
    }

    const targetDoc = await getAdminDb().collection('users').doc(uid).get();
    if (!targetDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (targetDoc.data()?.role === 'executive') {
      return NextResponse.json({ error: 'Cannot modify executive accounts' }, { status: 403 });
    }

    if (typeof disabled === 'boolean') {
      await getAdminDb().collection('users').doc(uid).set({ disabled }, { merge: true });
      await getAdminAuth().updateUser(uid, { disabled });
      await auditService.record({
        timestamp: Date.now(),
        actor: auth.uid,
        actorRole: 'executive',
        action: disabled ? 'commander_disabled' : 'commander_enabled',
        target: uid,
        metadata: { disabled },
      });
      await notificationService.create({
        type: disabled ? 'system_warning' : 'gladiator_registration',
        title: disabled ? 'Commander Disabled' : 'Commander Enabled',
        description: `Commander account ${disabled ? 'disabled' : 'enabled'}.`,
        createdAt: Date.now(),
        link: '/executive/commanders',
        metadata: { commanderId: uid, disabled },
      });
      return NextResponse.json({ success: true, uid, disabled });
    }

    if (resetPassword) {
      if (password && password.length >= 6) {
        await getAdminAuth().updateUser(uid, { password });
        await auditService.record({
          timestamp: Date.now(),
          actor: auth.uid,
          actorRole: 'executive',
          action: 'password_reset',
          target: uid,
        });
        await notificationService.create({
          type: 'operation_failed',
          title: 'Password Reset',
          description: `Password reset for commander account.`,
          createdAt: Date.now(),
          link: '/executive/commanders',
          metadata: { commanderId: uid },
        });
        return NextResponse.json({ success: true, uid, passwordReset: true });
      }
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    return NextResponse.json({ error: 'No valid operation specified' }, { status: 400 });
  } catch (err: any) {
    console.error('[AdminUsers][PATCH] Error:', err?.name, err?.code);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  console.log('[AdminUsers][DELETE] Start');
  try {
    const auth = await authenticateExecutive(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    let uid = searchParams.get('uid');
    if (!uid) {
      try {
        const body = await req.json();
        uid = body?.uid;
      } catch {}
    }

    if (!uid) {
      return NextResponse.json({ error: 'uid is required' }, { status: 400 });
    }

    if (uid === auth.uid) {
      return NextResponse.json({ error: 'Cannot delete your own executive account' }, { status: 403 });
    }

    const targetDoc = await getAdminDb().collection('users').doc(uid).get();
    if (!targetDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const targetRole = targetDoc.data()?.role;
    if (targetRole === 'executive') {
      return NextResponse.json({ error: 'Cannot delete executive accounts' }, { status: 403 });
    }

    const targetData = targetDoc.data();
    const displayName = targetData?.displayName || targetData?.email || 'Unknown';

    // Delete Firebase Auth user
    await getAdminAuth().deleteUser(uid).catch(() => {});

    // For commanders: rename profile to preserve historical data
    if (targetRole === 'commander') {
      await getAdminDb().collection('users').doc(uid).set({
        displayName: 'Deleted Commander',
        email: `deleted_${uid.slice(0, 8)}@knowledgearena.app`,
        role: 'commander',
        disabled: true,
        deleted: true,
        deletedAt: Date.now(),
        deletedBy: auth.uid,
        originalDisplayName: displayName,
      }, { merge: true });
      await auditService.record({
        timestamp: Date.now(),
        actor: auth.uid,
        actorRole: 'executive',
        action: 'commander_deleted',
        target: uid,
        metadata: { displayName },
      });
      await notificationService.create({
        type: 'system_warning',
        title: 'Commander Deleted',
        description: `${displayName} has been permanently deleted.`,
        createdAt: Date.now(),
        link: '/executive/commanders',
        metadata: { commanderId: uid, displayName },
      });
    } else {
      // For gladiators: hard delete profile
      await getAdminDb().collection('users').doc(uid).delete().catch(() => {});
      await auditService.record({
        timestamp: Date.now(),
        actor: auth.uid,
        actorRole: 'executive',
        action: 'gladiator_deleted',
        target: uid,
        metadata: { displayName },
      });
    }

    return NextResponse.json({ success: true, uid });
  } catch (err: any) {
    console.error('[AdminUsers][DELETE] Error:', err?.name, err?.code);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
