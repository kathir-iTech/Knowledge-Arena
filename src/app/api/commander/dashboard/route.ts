import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'commander');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const _rl = enforceRateLimit(`commander:dashboard:${auth.uid}`, Limits.READ_PER_USER);
    if (_rl) return _rl;

    const quizzesSnap = await getAdminDb().collection('quizzes')
      .where('created_by', '==', auth.uid)
      .select('status', 'title', 'participantCount', 'created_at', 'winnerName', 'score', 'created_by')
      .limit(500)
      .get();

    const requestsSnap = await getAdminDb().collection('executive_requests')
      .where('commanderId', '==', auth.uid)
      .where('status', '==', 'pending')
      .limit(100)
      .get();

    const allQuizzes = quizzesSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    const activeBattles = allQuizzes.filter(q => q.status === 'live');
    const upcomingBattles = allQuizzes.filter(q => q.status === 'waiting');
    const recentBattles = allQuizzes
      .filter(q => q.status === 'finished')
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
      .slice(0, 10);

    const totalParticipants = new Set<string>();
    const finishedScores: number[] = [];
    const participantPromises = allQuizzes
      .filter(q => q.status === 'finished')
      .map(q =>
        getAdminDb().collection('quizzes').doc(q.id).collection('participants').select('user_id', 'score').get()
          .then(snap => {
            snap.docs.forEach(p => {
              totalParticipants.add(p.data().user_id);
              if (p.data().score > 0) finishedScores.push(p.data().score);
            });
          })
          .catch(() => {})
      );
    await Promise.allSettled(participantPromises);

    const avgScore = finishedScores.length > 0
      ? Math.round(finishedScores.reduce((a, b) => a + b, 0) / finishedScores.length)
      : 0;

    return NextResponse.json({
      totalBattles: allQuizzes.length,
      activeBattles: activeBattles.map(q => ({ id: q.id, title: q.title, participantCount: q.participantCount || 0, createdAt: q.created_at })),
      upcomingBattles: upcomingBattles.map(q => ({ id: q.id, title: q.title, participantCount: q.participantCount || 0, createdAt: q.created_at })),
      recentBattles: recentBattles.map(q => ({ id: q.id, title: q.title, participantCount: q.participantCount || 0, winnerName: q.winnerName || null, createdAt: q.created_at, score: q.score })),
      stats: {
        totalBattles: allQuizzes.length,
        activeCount: activeBattles.length,
        completedCount: allQuizzes.filter(q => q.status === 'finished').length,
        totalParticipants: totalParticipants.size,
        averageScore: avgScore,
      },
      pendingRequestsCount: requestsSnap.docs.length,
    });
  } catch (err: any) {
    console.error('[CommanderDashboard] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}