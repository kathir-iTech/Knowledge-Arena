import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

async function getSystemHealth() {
  const checks: Record<string, { status: 'healthy' | 'warning' | 'offline'; latency?: number }> = {};

  // Authentication
  try {
    const start = Date.now();
    await getAdminAuth().getUser('nonexistent').catch(() => {});
    checks.auth = { status: 'healthy', latency: Date.now() - start };
  } catch {
    checks.auth = { status: 'offline' };
  }

  // Firestore
  try {
    const start = Date.now();
    await getAdminDb().collection('_health_').doc('_check_').get();
    checks.firestore = { status: 'healthy', latency: Date.now() - start };
  } catch {
    try {
      const start = Date.now();
      await getAdminDb().collection('users').limit(1).get();
      checks.firestore = { status: 'healthy', latency: Date.now() - start };
    } catch {
      checks.firestore = { status: 'offline' };
    }
  }

  // Messaging — verify conversations collection is accessible
  try {
    const start = Date.now();
    await getAdminDb().collection('conversations').limit(1).get();
    checks.messaging = { status: 'healthy', latency: Date.now() - start };
  } catch {
    checks.messaging = { status: 'warning', latency: undefined };
  }

  // AI — check Genkit is configured (env vars present)
  const hasGeminiKey = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  checks.ai = hasGeminiKey ? { status: 'healthy' } : { status: 'warning' };

  // Storage — verify Firebase storage bucket is configured
  const hasStorageBucket = !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  checks.storage = hasStorageBucket ? { status: 'healthy' } : { status: 'warning' };

  return checks;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = Date.now();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(dayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const [
      executivesSnap,
      commandersSnap,
      gladiatorsSnap,
      questionsSnap,
      quizzesSnap,
      conversationsSnap,
      announcementsSnap,
      auditSnap,
      requestsSnap,
    ] = await Promise.all([
      getAdminDb().collection('users').where('role', '==', 'executive').select('createdAt').get(),
      getAdminDb().collection('users').where('role', '==', 'commander').select('displayName', 'disabled', 'deleted', 'createdAt', 'lastActive').get(),
      getAdminDb().collection('users').where('role', '==', 'gladiator').select('disabled', 'createdAt').get(),
      getAdminDb().collection('question_bank').select('createdBy', 'source').get(),
      getAdminDb().collection('quizzes').select('title','status','created_by','created_at','finished_at','participantCount','question_count','difficulty').limit(2000).get(),
      getAdminDb().collection('conversations').select('messageCount').get(),
      getAdminDb().collection('announcements').get(),
      getAdminDb().collection('auditLogs').orderBy('timestamp', 'desc').limit(50).get(),
      getAdminDb().collection('executive_requests').select('status', 'createdAt', 'title', 'commanderId', 'commanderEmail', 'type').get(),
    ]);

    const totalCommanders = commandersSnap.docs.length;
    const activeCommanders = commandersSnap.docs.filter(d => !d.data().disabled && !d.data().deleted).length;
    const disabledCommanders = commandersSnap.docs.filter(d => d.data().disabled && !d.data().deleted).length;

    const totalGladiators = gladiatorsSnap.docs.length;
    const activeGladiators = gladiatorsSnap.docs.filter(d => !d.data().disabled).length;

    const totalBattles = quizzesSnap.docs.length;
    const completedBattles = quizzesSnap.docs.filter(d => d.data().status === 'finished').length;
    const activeBattles = quizzesSnap.docs.filter(d => d.data().status === 'live').length;
    const waitingBattles = quizzesSnap.docs.filter(d => d.data().status === 'waiting').length;

    // Battles today / this week
    const battlesToday = quizzesSnap.docs.filter(d => {
      const t = d.data().created_at || 0;
      return t >= dayStart.getTime();
    }).length;

    const battlesThisWeek = quizzesSnap.docs.filter(d => {
      const t = d.data().created_at || 0;
      return t >= weekStart.getTime();
    }).length;

    // New users today / this week
    const allUserDocs = [...executivesSnap.docs, ...commandersSnap.docs, ...gladiatorsSnap.docs];
    const newUsersToday = allUserDocs.filter(d => {
      const t = d.data().createdAt || 0;
      return t >= dayStart.getTime();
    }).length;

    const newUsersThisWeek = allUserDocs.filter(d => {
      const t = d.data().createdAt || 0;
      return t >= weekStart.getTime();
    }).length;

    // Questions imported (from question_bank)
    const aiImportedCount = questionsSnap.docs.filter(d => {
      const data = d.data();
      return data.createdBy === 'ai_import' || data.source === 'ai' || data.source === 'pdf';
    }).length;
    const aiGeneratedCount = aiImportedCount;

    // Most active commander
    const commanderArenaCount: Record<string, { count: number; name: string }> = {};
    quizzesSnap.docs.forEach(d => {
      const data = d.data();
      const creator = data.created_by;
      if (creator) {
        if (!commanderArenaCount[creator]) {
          const userDoc = commandersSnap.docs.find(c => c.id === creator);
          commanderArenaCount[creator] = { count: 0, name: userDoc?.data()?.displayName || creator };
        }
        commanderArenaCount[creator].count++;
      }
    });
    const sortedCommanders = Object.entries(commanderArenaCount)
      .sort(([, a], [, b]) => b.count - a.count);
    const mostActiveCommander = sortedCommanders[0]
      ? { uid: sortedCommanders[0][0], name: sortedCommanders[0][1].name, arenaCount: sortedCommanders[0][1].count }
      : null;

    // Average battle score
    let totalScore = 0;
    let scoredParticipants = 0;
    const finishedQuizIds = quizzesSnap.docs
      .filter(d => d.data().status === 'finished')
      .map(d => d.id);

    if (finishedQuizIds.length > 0) {
      const db = getAdminDb();
      for (let i = 0; i < finishedQuizIds.length; i += 30) {
        const chunk = finishedQuizIds.slice(i, i + 30);
        const partResults = await Promise.allSettled(
          chunk.map(quizId =>
            db.collection('quizzes').doc(quizId).collection('participants').get()
          )
        );
        for (const result of partResults) {
          if (result.status === 'fulfilled') {
            result.value.docs.forEach(p => {
              const score = p.data().score || 0;
              if (score > 0) {
                totalScore += score;
                scoredParticipants++;
              }
            });
          } else {
            console.error('[Workspace] Failed to fetch participants:', result.reason?.name, result.reason?.message);
          }
        }
      }
    }
    const averageBattleScore = scoredParticipants > 0 ? Math.round(totalScore / scoredParticipants) : 0;

    // Average battle duration
    let totalDuration = 0;
    let durationCount = 0;
    quizzesSnap.docs.forEach(d => {
      const data = d.data();
      if (data.status === 'finished' && data.created_at && data.finished_at) {
        totalDuration += (data.finished_at - data.created_at);
        durationCount++;
      }
    });
    const avgDurationMinutes = durationCount > 0
      ? Math.round((totalDuration / durationCount) / 60000)
      : 0;

    const messagesCount = conversationsSnap.docs.reduce((sum, d) => {
      const data = d.data();
      return sum + (data.messageCount || 0);
    }, 0);

    const unreadRequests = requestsSnap.docs.filter(d => d.data().status === 'pending').length;

    // Recent battles (last 5 finished)
    const sortedQuizzes = [...quizzesSnap.docs]
      .sort((a, b) => (b.data().created_at || 0) - (a.data().created_at || 0))
      .slice(0, 5);
    const recentBattles = sortedQuizzes.map(d => {
      const data = d.data();
      const creatorDoc = commandersSnap.docs.find(c => c.id === data.created_by);
      return {
        id: d.id,
        title: data.title || 'Untitled Battle',
        commanderName: creatorDoc?.data()?.displayName || data.created_by || 'Unknown',
        status: data.status || 'unknown',
        participantCount: data.participantCount || 0,
        createdAt: data.created_at || 0,
        difficulty: data.difficulty || 'medium',
      };
    });

    // Active commanders list (sorted by arena count)
    const activeCommandersList = Object.entries(commanderArenaCount)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
      .map(([uid, info]) => {
        const doc = commandersSnap.docs.find(c => c.id === uid);
        const data = doc?.data() || {};
        return {
          uid,
          name: info.name,
          arenaCount: info.count,
          disabled: !!data.disabled,
          lastActive: data.lastActive || null,
        };
      });

    // Recent requests (last 5)
    const sortedRequests = [...requestsSnap.docs]
      .sort((a, b) => (b.data().createdAt || 0) - (a.data().createdAt || 0))
      .slice(0, 5);
    const recentRequests = sortedRequests.map(d => {
      const data = d.data();
      const commanderDoc = commandersSnap.docs.find(c => c.id === data.commanderId);
      return {
        id: d.id,
        title: data.title || 'Untitled Request',
        commanderName: commanderDoc?.data()?.displayName || data.commanderEmail || 'Unknown',
        status: data.status || 'pending',
        createdAt: data.createdAt || 0,
        type: data.type || 'general',
      };
    });

    const recentActivity = auditSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        timestamp: data.timestamp,
        actor: data.actor,
        actorRole: data.actorRole,
        action: data.action,
        target: data.target,
        metadata: data.metadata || {},
      };
    });

    const totalUsers = totalCommanders + totalGladiators + executivesSnap.docs.length;

    const systemHealth = await getSystemHealth();

    return NextResponse.json({
      executives: executivesSnap.docs.length,
      commanders: totalCommanders,
      activeCommanders,
      disabledCommanders,
      gladiators: totalGladiators,
      activeGladiators,
      totalUsers,
      questionBank: questionsSnap.docs.length,
      battles: totalBattles,
      completedBattles,
      activeBattles,
      waitingBattles,
      battlesToday,
      battlesThisWeek,
      newUsersToday,
      newUsersThisWeek,
      questionsImported: aiImportedCount,
      aiGeneratedQuestions: aiGeneratedCount,
      mostActiveCommander,
      averageBattleScore,
      averageBattleDuration: avgDurationMinutes,
      messages: messagesCount,
      conversations: conversationsSnap.docs.length,
      announcements: announcementsSnap.docs.length,
      unreadRequests,
      recentBattles,
      activeCommandersList,
      recentRequests,
      recentActivity,
      systemHealth,
    });
  } catch (err: any) {
    console.error('[Workspace] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
