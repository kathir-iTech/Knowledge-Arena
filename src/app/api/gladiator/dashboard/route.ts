import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'gladiator');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const participantsSnap = await getAdminDb().collectionGroup('participants')
      .where('user_id', '==', auth.uid)
      .select('user_id', 'score', 'status')
      .get();

    const totalBattles = participantsSnap.docs.length;
    if (totalBattles === 0) {
      return NextResponse.json({
        stats: { totalBattles: 0, finishedCount: 0, wins: 0, averageScore: 0, accuracy: 0 },
        recentBattles: [],
        activeBattle: null,
      }, { headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=60' } });
    }

    const participantData = participantsSnap.docs.map(d => ({ id: d.id, data: d.data(), ref: d.ref }));
    const quizIds = [...new Set(participantData.map(p => p.ref.parent.parent?.id).filter(Boolean) as string[])];

    const quizMap = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < quizIds.length; i += 30) {
      const chunk = quizIds.slice(i, i + 30);
      const snap = await getAdminDb().getAll(...chunk.map(id => getAdminDb().collection('quizzes').doc(id)));
      for (const d of snap) {
        if (d.exists) quizMap.set(d.id, d.data()!);
      }
    }

    let totalScore = 0;
    let finishedCount = 0;
    let activeBattleId: string | null = null;
    let activeBattleTitle: string | null = null;
    const recentBattles: Array<{ quizId: string; title: string; score: number; status: string; created_at: number }> = [];

    for (const p of participantData) {
      const quizId = p.ref.parent.parent?.id;
      if (!quizId) continue;
      const quizData = quizMap.get(quizId);
      if (!quizData) continue;

      totalScore += (p.data.score as number) || 0;
      const isFinished = p.data.status === 'finished' || quizData.status === 'finished';
      if (isFinished) finishedCount++;
      recentBattles.push({
        quizId,
        title: (quizData.title as string) || 'Untitled',
        score: (p.data.score as number) || 0,
        status: (quizData.status as string) || 'unknown',
        created_at: (quizData.created_at as number) || 0,
      });
      if (!activeBattleId && quizData.status === 'live') {
        activeBattleId = quizId;
        activeBattleTitle = (quizData.title as string) || 'Active Battle';
      }
    }

    const avgScore = finishedCount > 0 ? Math.round(totalScore / finishedCount) : 0;
    const wins = recentBattles.filter(b => b.status === 'finished' && b.score > 0).length;
    recentBattles.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    return NextResponse.json({
      stats: {
        totalBattles,
        finishedCount,
        wins,
        averageScore: avgScore,
        accuracy: totalBattles > 0 ? Math.round((wins / totalBattles) * 100) : 0,
      },
      recentBattles: recentBattles.slice(0, 10),
      activeBattle: activeBattleId ? { id: activeBattleId, title: activeBattleTitle } : null,
    }, { headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=60' } });
  } catch (err: any) {
    console.error('[GladiatorDashboard] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
