import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

interface HealthCheck {
  status: 'healthy' | 'warning' | 'offline';
  latency?: number;
}

async function getSystemHealth() {
  const checks: Record<string, HealthCheck> = {};

  // Authentication — use listUsers(1) as a real, cheap Admin Auth probe
  try {
    const start = Date.now();
    await getAdminAuth().listUsers(1);
    checks.auth = { status: 'healthy', latency: Date.now() - start };
  } catch {
    checks.auth = { status: 'offline' };
  }

  // Firestore / Database
  try {
    const start = Date.now();
    await getAdminDb().collection('users').limit(1).get();
    checks.firestore = { status: 'healthy', latency: Date.now() - start };
  } catch {
    checks.firestore = { status: 'offline' };
  }

  // Messaging — verify conversations collection is accessible
  try {
    const start = Date.now();
    await getAdminDb().collection('conversations').limit(1).get();
    checks.messaging = { status: 'healthy', latency: Date.now() - start };
  } catch {
    checks.messaging = { status: 'warning' };
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
    const dayMs = 86400000;

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
      aiLogsSnap,
      securitySnap,
    ] = await Promise.all([
      getAdminDb().collection('users').where('role', '==', 'executive').select('createdAt').get(),
      getAdminDb().collection('users').where('role', '==', 'commander').select('displayName', 'name', 'disabled', 'deleted', 'createdAt', 'lastActive').get(),
      getAdminDb().collection('users').where('role', '==', 'gladiator').select('displayName', 'name', 'disabled', 'createdAt', 'lastActive').get(),
      getAdminDb().collection('question_bank').select('createdBy', 'source', 'category', 'createdAt').limit(5000).get(),
      getAdminDb().collection('quizzes').select('title', 'status', 'created_by', 'created_at', 'finished_at', 'participantCount', 'question_count', 'difficulty').limit(2000).get(),
      getAdminDb().collection('conversations').select('messageCount').get(),
      getAdminDb().collection('announcements').get(),
      getAdminDb().collection('auditLogs').orderBy('timestamp', 'desc').limit(50).get(),
      getAdminDb().collection('executive_requests').select('status', 'createdAt', 'title', 'commanderId', 'commanderEmail', 'type').get(),
      getAdminDb().collection('ai_logs').orderBy('createdAt', 'desc').limit(200).get(),
      getAdminDb().collection('security_logs').orderBy('createdAt', 'desc').limit(100).get(),
    ]);

    const totalCommanders = commandersSnap.docs.length;
    const activeCommanders = commandersSnap.docs.filter(d => !d.data().disabled && !d.data().deleted).length;
    const disabledCommanders = commandersSnap.docs.filter(d => d.data().disabled && !d.data().deleted).length;

    const totalGladiators = gladiatorsSnap.docs.length;
    const activeGladiators = gladiatorsSnap.docs.filter(d => !d.data().disabled).length;
    const disabledGladiators = totalGladiators - activeGladiators;

    const totalBattles = quizzesSnap.docs.length;
    const completedBattles = quizzesSnap.docs.filter(d => d.data().status === 'finished').length;
    const activeBattles = quizzesSnap.docs.filter(d => d.data().status === 'live').length;
    const waitingBattles = quizzesSnap.docs.filter(d => d.data().status === 'waiting' || d.data().status === 'ready').length;
    const pausedBattles = quizzesSnap.docs.filter(d => d.data().status === 'paused').length;

    const battlesToday = quizzesSnap.docs.filter(d => (d.data().created_at || 0) >= dayStart.getTime()).length;
    const battlesThisWeek = quizzesSnap.docs.filter(d => (d.data().created_at || 0) >= weekStart.getTime()).length;

    const allUserDocs = [...executivesSnap.docs, ...commandersSnap.docs, ...gladiatorsSnap.docs];
    const newUsersToday = allUserDocs.filter(d => (d.data().createdAt || 0) >= dayStart.getTime()).length;
    const newUsersThisWeek = allUserDocs.filter(d => (d.data().createdAt || 0) >= weekStart.getTime()).length;

    // Questions imported (from question_bank) — any source other than manually added
    const aiImportedCount = questionsSnap.docs.filter(d => {
      const data = d.data();
      return data.createdBy === 'ai_import' || ['ai', 'ai_pdf_forge', 'pdf'].includes(data.source);
    }).length;
    const questionsAddedThisWeek = questionsSnap.docs.filter(d => {
      const t = d.data().createdAt?.toMillis?.() ?? d.data().createdAt ?? 0;
      return t >= weekStart.getTime();
    }).length;

    // Most active commander
    const commanderArenaCount: Record<string, { count: number; name: string }> = {};
    quizzesSnap.docs.forEach(d => {
      const data = d.data();
      const creator = data.created_by;
      if (creator) {
        if (!commanderArenaCount[creator]) {
          const userDoc = commandersSnap.docs.find(c => c.id === creator);
          const uData = userDoc?.data() || {};
          commanderArenaCount[creator] = { count: 0, name: uData.displayName || uData.name || 'Commander' };
        }
        commanderArenaCount[creator].count++;
      }
    });
    const sortedCommanders = Object.entries(commanderArenaCount).sort(([, a], [, b]) => b.count - a.count);
    const mostActiveCommander = sortedCommanders[0]
      ? { uid: sortedCommanders[0][0], name: sortedCommanders[0][1].name, arenaCount: sortedCommanders[0][1].count }
      : null;

    // Average battle score — includes zero scores so the average is not inflated
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
            db.collection('quizzes').doc(quizId).collection('participants').select('score').get()
          )
        );
        for (const result of partResults) {
          if (result.status === 'fulfilled') {
            result.value.docs.forEach(p => {
              totalScore += p.data().score || 0;
              scoredParticipants++;
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
      return sum + (d.data().messageCount || 0);
    }, 0);

    const unreadRequests = requestsSnap.docs.filter(d => d.data().status === 'pending').length;

    // Recent battles (last 5 by created_at, any status)
    const sortedQuizzes = [...quizzesSnap.docs]
      .sort((a, b) => (b.data().created_at || 0) - (a.data().created_at || 0))
      .slice(0, 5);
    const recentBattles = sortedQuizzes.map(d => {
      const data = d.data();
      const creatorDoc = commandersSnap.docs.find(c => c.id === data.created_by);
      const uData = creatorDoc?.data() || {};
      return {
        id: d.id,
        title: data.title || 'Untitled Battle',
        commanderName: uData.displayName || uData.name || 'Unknown Commander',
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
      const uData = commanderDoc?.data() || {};
      return {
        id: d.id,
        title: data.title || 'Untitled Request',
        commanderName: uData.displayName || uData.name || data.commanderEmail || 'Unknown',
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

    // Last backup (from audit trail)
    const lastBackupAt = auditSnap.docs
      .map(d => ({ action: d.data().action, timestamp: d.data().timestamp || 0 }))
      .find(a => a.action === 'backup_created')?.timestamp ?? null;

    // AI summary (30-day window from last 200 logs)
    const aiLogs = aiLogsSnap.docs
      .map(d => {
        const data = d.data();
        return {
          id: d.id,
          createdAt: data.createdAt?.toMillis?.() ?? data.createdAt ?? 0,
          success: !!data.success,
          model: data.model || 'unknown',
          durationMs: data.durationMs || 0,
          error: data.error || null,
        };
      })
      .filter(l => l.createdAt >= now - 30 * dayMs);
    const aiFailures = aiLogs.filter(l => !l.success);
    const aiSummary = {
      total: aiLogs.length,
      failures: aiFailures.length,
      successRate: aiLogs.length > 0 ? Math.round(((aiLogs.length - aiFailures.length) / aiLogs.length) * 100) : null,
      avgDurationMs: aiLogs.length > 0 ? Math.round(aiLogs.reduce((s, l) => s + l.durationMs, 0) / aiLogs.length) : 0,
      topModel: aiLogs.length > 0
        ? Object.entries(aiLogs.reduce<Record<string, number>>((acc, l) => {
            acc[l.model] = (acc[l.model] || 0) + 1;
            return acc;
          }, {})).sort(([, a], [, b]) => b - a)[0][0]
        : null,
    };

    // Security summary (last 100 entries)
    const securityEntries = securitySnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        event: data.event,
        actor: data.actor,
        actorRole: data.actorRole || null,
        target: data.target || null,
        detail: data.detail || null,
        metadata: data.metadata || {},
        timestamp: data.createdAt?.toMillis?.() ?? data.timestamp ?? null,
      };
    });
    const failedLogins24h = securityEntries.filter(s => s.event === 'login_failed' && s.timestamp && s.timestamp >= now - dayMs).length;
    const recentSecurityEvents = securityEntries.slice(0, 5);

    // Realtime: playing participants across live quizzes
    const liveQuizIds = quizzesSnap.docs
      .filter(d => d.data().status === 'live')
      .map(d => d.id);
    let realtimeConnections = 0;
    if (liveQuizIds.length > 0) {
      const db = getAdminDb();
      const partResults = await Promise.allSettled(
        liveQuizIds.map(quizId =>
          db.collection('quizzes').doc(quizId).collection('participants').select('status').get()
        )
      );
      partResults.forEach(result => {
        if (result.status === 'fulfilled') {
          realtimeConnections += result.value.docs.filter(p => p.data().status !== 'blocked').length;
        }
      });
    }

    const totalUsers = totalCommanders + totalGladiators + executivesSnap.docs.length;

    const systemHealth = await getSystemHealth();

    return NextResponse.json({
      executives: executivesSnap.docs.length,
      commanders: totalCommanders,
      activeCommanders,
      disabledCommanders,
      gladiators: totalGladiators,
      activeGladiators,
      disabledGladiators,
      totalUsers,
      questionBank: questionsSnap.docs.length,
      questionsImported: aiImportedCount,
      questionsAddedThisWeek,
      battles: totalBattles,
      completedBattles,
      activeBattles,
      waitingBattles,
      pausedBattles,
      battlesToday,
      battlesThisWeek,
      newUsersToday,
      newUsersThisWeek,
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
      latestAiFailures: aiFailures.slice(0, 5).map(f => ({
        id: f.id,
        model: f.model,
        error: f.error,
        createdAt: f.createdAt,
      })),
      aiSummary,
      failedLogins24h,
      recentSecurityEvents,
      lastBackupAt,
      realtime: {
        liveBattles: liveQuizIds.length,
        connections: realtimeConnections,
      },
      storage: {
        configured: !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        bucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || null,
      },
      systemHealth,
    });
  } catch (err: any) {
    console.error('[Workspace] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
