import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import type { Firestore, Query } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

// Runs an ordered query first. If the composite index is not deployed yet,
// Firestore fails with FAILED_PRECONDITION; we then fall back to an
// equality-only query (which only needs automatic single-field indexes)
// and sort in memory. This keeps the detail pages working even before
// the indexes declared in firestore.indexes.json are deployed.
interface RecentDoc {
  id: string;
  data: FirebaseFirestore.DocumentData;
}

async function queryRecent(
  db: Firestore,
  buildOrdered: () => Query,
  buildUnordered: () => Query,
  sortValue: (data: FirebaseFirestore.DocumentData) => number,
  cap: number
): Promise<RecentDoc[]> {
  try {
    const snap = await buildOrdered().limit(cap).get();
    return snap.docs.map(d => ({ id: d.id, data: d.data() }));
  } catch (err: any) {
    if (err?.code !== 'FAILED_PRECONDITION') throw err;
    console.warn('[UserDetail GET] Composite index missing, falling back to in-memory sort:', err?.message);
    const snap = await buildUnordered().get();
    return snap.docs
      .map(d => ({ id: d.id, data: d.data() }))
      .sort((a, b) => (sortValue(b.data) || 0) - (sortValue(a.data) || 0))
      .slice(0, cap);
  }
}

// Runs a helper and degrades to a fallback value instead of ever 500ing.
// Errors are logged with a stack so the exact failing query can be found.
async function safeQuery<T>(
  label: string,
  run: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await run();
  } catch (err: any) {
    console.error(`[UserDetail GET] ${label} failed, degrading gracefully:`, err?.name, err?.message, '\n', err?.stack);
    return fallback;
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uid } = await params;
    const db = getAdminDb();

    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const userData = userSnap.data()!;
    const role = userData.role || 'unknown';

    // Firebase Auth metadata (may fail if the auth record was removed)
    let authInfo: Record<string, unknown> = { exists: false };
    try {
      const rec = await getAdminAuth().getUser(uid);
      authInfo = { exists: true, disabled: rec.disabled, lastLoginAt: rec.metadata.lastSignInTime || null, createdAt: rec.metadata.creationTime || null };
    } catch {
      authInfo = { exists: false };
    }

    // Audit trail, security events, notifications (may not exist for this uid).
    // Each query falls back to an unordered fetch + in-memory sort when the
    // composite index has not been deployed yet, so a missing index can never
    // take the whole profile page down.
    const [auditSnap, securitySnap, notificationsSnap, aiLogsSnap, battleLogsSnap] = await Promise.allSettled([
      queryRecent(
        db,
        () => db.collection('auditLogs').where('actor', '==', uid).orderBy('timestamp', 'desc'),
        () => db.collection('auditLogs').where('actor', '==', uid),
        d => (typeof d.timestamp === 'number' ? d.timestamp : 0),
        100
      ),
      queryRecent(
        db,
        () => db.collection('security_logs').where('actor', '==', uid).orderBy('createdAt', 'desc'),
        () => db.collection('security_logs').where('actor', '==', uid),
        d => d.createdAt?.toMillis?.() ?? d.timestamp ?? 0,
        100
      ),
      queryRecent(
        db,
        () => db.collection('notifications').where('userId', '==', uid).orderBy('createdAt', 'desc'),
        () => db.collection('notifications').where('userId', '==', uid),
        d => d.createdAt?.toMillis?.() ?? 0,
        100
      ),
      queryRecent(
        db,
        () => db.collection('ai_logs').where('userId', '==', uid).orderBy('createdAt', 'desc'),
        () => db.collection('ai_logs').where('userId', '==', uid),
        d => d.createdAt?.toMillis?.() ?? 0,
        50
      ),
      queryRecent(
        db,
        () => db.collection('battle_logs').where('actor', '==', uid).orderBy('timestamp', 'desc'),
        () => db.collection('battle_logs').where('actor', '==', uid),
        d => (typeof d.timestamp === 'number' ? d.timestamp : d.createdAt?.toMillis?.() ?? 0),
        100
      ),
    ]);

    const unwrap = <T>(result: PromiseSettledResult<T[]>, fallback: T[]): T[] =>
      result.status === 'fulfilled' ? result.value : fallback;

    const auditTrail = unwrap(auditSnap, []).map(({ id, data }) => {
      return { id, timestamp: data.timestamp, actor: data.actor, actorRole: data.actorRole, action: data.action, target: data.target, metadata: data.metadata || {} };
    });
    const securityEvents = unwrap(securitySnap, []).map(({ id, data }) => {
      return { id, event: data.event, actor: data.actor, target: data.target, detail: data.detail, metadata: data.metadata || {}, timestamp: data.createdAt?.toMillis?.() ?? data.timestamp ?? null };
    });
    const notifications = unwrap(notificationsSnap, []).map(({ id, data }) => {
      return { id, type: data.type, title: data.title, description: data.description, read: !!data.read, createdAt: data.createdAt?.toMillis?.() ?? data.createdAt ?? null, link: data.link || null };
    });
    const aiLogs = unwrap(aiLogsSnap, []).map(({ id, data }) => {
      return { id, model: data.model, success: !!data.success, questionCount: data.questionCount || 0, createdAt: data.createdAt?.toMillis?.() ?? data.createdAt ?? null, error: data.error || null };
    });
    const battleLogs = unwrap(battleLogsSnap, []).map(({ id, data }) => {
      return { id, quizId: data.quizId, event: data.event, timestamp: data.timestamp ?? data.createdAt?.toMillis?.() ?? null, metadata: data.metadata || {} };
    });

    // Conversations involving this user
    let conversations: { id: string; participants: string[]; lastMessage: string | null; messageCount: number; lastActivity: number | null }[] = [];
    try {
      const convSnap = await db.collection('conversations').where('participants', 'array-contains', uid).select('participants', 'lastMessage', 'messageCount', 'lastActivity').limit(100).get();
      conversations = convSnap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          participants: data.participants || [],
          lastMessage: data.lastMessage || null,
          messageCount: data.messageCount || 0,
          lastActivity: data.lastActivity?.toMillis?.() ?? data.lastActivity ?? null,
        };
      });
    } catch (err: any) {
      console.error('[UserDetail GET] conversations query failed (degraded to empty):', err?.name, err?.message);
    }

    const base = {
      uid,
      name: userData.displayName || userData.name || 'Unknown User',
      email: userData.email || null,
      avatar: userData.avatar || null,
      role,
      disabled: !!userData.disabled,
      deleted: !!userData.deleted,
      createdAt: userData.createdAt || null,
      lastActive: userData.lastActive || null,
      authDisabled: (authInfo.disabled as boolean) ?? false,
      authExists: authInfo.exists as boolean,
      lastLoginAt: authInfo.lastLoginAt || null,
      auditTrail,
      securityEvents,
      notifications,
      aiLogs,
      battleLogs,
      conversations,
    };

    if (role === 'commander' || role === 'executive') {
      // Arenas + battles created by this user. The ordered query needs a
      // composite index (created_by + created_at); if it is not deployed yet
      // we fall back to an equality-only fetch and sort in memory, so the
      // profile page can never be taken down by a missing index.
      const quizzesRecent = await safeQuery(
        'commander quizzes',
        () => queryRecent(
          db,
          () => db.collection('quizzes')
            .where('created_by', '==', uid)
            .select('title', 'status', 'created_at', 'finished_at', 'participantCount', 'question_count', 'difficulty')
            .orderBy('created_at', 'desc'),
          () => db.collection('quizzes')
            .where('created_by', '==', uid)
            .select('title', 'status', 'created_at', 'finished_at', 'participantCount', 'question_count', 'difficulty'),
          d => (typeof d.created_at === 'number' ? d.created_at : d.createdAt?.toMillis?.() ?? 0),
          200
        ),
        []
      );

      const arenas = quizzesRecent.map(({ id, data }) => {
        return {
          id,
          title: data.title || 'Untitled Battle',
          status: data.status || 'unknown',
          createdAt: data.created_at || 0,
          finishedAt: data.finished_at || 0,
          participantCount: data.participantCount || 0,
          questionCount: data.question_count || 0,
          difficulty: data.difficulty || 'medium',
        };
      });

      const finishedArenas = arenas.filter(a => a.status === 'finished');
      const arenaStats = {
        total: arenas.length,
        active: arenas.filter(a => a.status === 'live').length,
        waiting: arenas.filter(a => ['waiting', 'ready', 'starting'].includes(a.status)).length,
        paused: arenas.filter(a => a.status === 'paused').length,
        finished: finishedArenas.length,
        totalParticipants: arenas.reduce((s, a) => s + a.participantCount, 0),
      };

      // Requests submitted by this commander
      let requests: { id: string; title: string; type: string; status: string; createdAt: number }[] = [];
      if (role === 'commander') {
        try {
          const reqSnap = await db.collection('executive_requests')
            .where('commanderId', '==', uid)
            .orderBy('createdAt', 'desc')
            .limit(100)
            .get();
          requests = reqSnap.docs.map(d => {
            const data = d.data();
            return { id: d.id, title: data.title || 'Untitled Request', type: data.type || 'general', status: data.status || 'pending', createdAt: data.createdAt || 0 };
          });
        } catch (err: any) {
          console.error('[UserDetail GET] commander requests query failed (degraded to empty):', err?.name, err?.message);
          requests = [];
        }
      }

      return NextResponse.json({
        profile: {
          ...base,
          arenas,
          arenaStats,
          requests,
          questionCount: userData.questionCount || null,
        },
      });
    }

    if (role === 'gladiator') {
      // Battle history via participants collection group. Collection group
      // queries need a deployed collection-group index; when it is missing
      // (FAILED_PRECONDITION) we retry with an equality-only query that only
      // needs the automatic single-field collection-group index. If even that
      // fails, the history section degrades to empty instead of 500ing.
      const participantDocs = await safeQuery(
        'gladiator participants collection-group',
        async () => {
          try {
            const snap = await db.collectionGroup('participants')
              .where('user_id', '==', uid)
              .select('user_id', 'name', 'score', 'status', 'finished_at')
              .orderBy('finished_at', 'desc')
              .limit(100)
              .get();
            return snap.docs;
          } catch (err: any) {
            if (err?.code !== 'FAILED_PRECONDITION') throw err;
            console.warn('[UserDetail GET] participants collection-group index missing, falling back to in-memory sort:', err?.message);
            const snap = await db.collectionGroup('participants')
              .where('user_id', '==', uid)
              .select('user_id', 'name', 'score', 'status', 'finished_at')
              .get();
            const docs = snap.docs.slice();
            docs.sort((a, b) => (b.data().finished_at || 0) - (a.data().finished_at || 0));
            return docs.slice(0, 100);
          }
        },
        []
      );

      const quizIds = participantDocs.map(d => d.ref.parent.parent?.id).filter((x): x is string => !!x);
      const quizSnaps = await Promise.allSettled(
        quizIds.map(quizId => db.collection('quizzes').doc(quizId).get())
      );

      // Accuracy: compare submissions against answer keys (last 10 battles max).
      // Every Firestore read is caught individually; the whole accuracy pass is
      // wrapped so a single failing battle can never take the profile down.
      let correct = 0;
      let answered = 0;
      let battlesWithAnswers = 0;
      await safeQuery(
        'gladiator accuracy',
        async () => {
          const accuracyQuizIds = quizIds.slice(0, 10);
          const accuracyPromises = accuracyQuizIds.map(async quizId => {
            const keySnap = await db.collection('quizzes').doc(quizId).collection('answerKeys').get().catch(() => null);
            if (!keySnap || keySnap.empty) return;
            const keys = new Map<string, number>();
            keySnap.docs.forEach(k => {
              const idx = k.data().correct_option_index;
              if (typeof idx === 'number') keys.set(k.id, idx);
            });
            if (keys.size === 0) return;
            const questionsSnap = await db.collection('quizzes').doc(quizId).collection('questions').select('sort_index').get().catch(() => null);
            if (!questionsSnap || questionsSnap.empty) return;
            battlesWithAnswers++;
            const correctKeyed = new Map<string, number>();
            questionsSnap.docs.forEach(q => {
              const idx = keys.get(q.id);
              if (idx !== undefined) correctKeyed.set(q.id, idx);
            });
            for (const [qid, correctIdx] of correctKeyed.entries()) {
              const sub = await db.collection('quizzes').doc(quizId).collection('questions').doc(qid).collection('submissions').doc(uid).get().catch(() => null);
              if (!sub?.exists) continue;
              const sData = sub.data();
              if (!sData) continue;
              answered++;
              if (sData.selected_option === correctIdx) correct++;
            }
          });
          await Promise.all(accuracyPromises);
          return null;
        },
        null
      );

      const battles = participantDocs.map((d, i) => {
        const data = d.data();
        const quizSnap = quizSnaps[i];
        const quiz = quizSnap.status === 'fulfilled' && quizSnap.value.exists ? quizSnap.value.data() : null;
        return {
          id: d.ref.parent.parent?.id || '',
          title: quiz?.title || 'Unknown Battle',
          status: quiz?.status || 'unknown',
          difficulty: quiz?.difficulty || 'medium',
          score: data.score || 0,
          participantStatus: data.status || 'unknown',
          finishedAt: data.finished_at || quiz?.finished_at || 0,
          createdAt: quiz?.created_at || 0,
          createdBy: quiz?.created_by || null,
        };
      });

      const playedBattles = battles.filter(b => b.id).length;
      const withScore = battles.filter(b => b.score > 0);
      const stats = {
        battlesPlayed: playedBattles,
        bestScore: withScore.length > 0 ? Math.max(...withScore.map(b => b.score)) : 0,
        averageScore: withScore.length > 0 ? Math.round(withScore.reduce((s, b) => s + b.score, 0) / withScore.length) : 0,
        accuracy: answered > 0 ? Math.round((correct / answered) * 100) : null,
        answersRecorded: answered,
      };

      return NextResponse.json({
        profile: {
          ...base,
          battles,
          battleStats: stats,
        },
      });
    }

    return NextResponse.json({ profile: base });
  } catch (err: any) {
    console.error('[UserDetail GET] Error:', err?.name, err?.message, '\n', err?.stack);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
