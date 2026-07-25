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
      .get();

    let totalScore = 0;
    let finishedCount = 0;
    const recentBattles: Array<{ quizId: string; title: string; score: number; status: string; created_at: number }> = [];

    for (const doc of participantsSnap.docs) {
      const data = doc.data();
      const quizRef = doc.ref.parent.parent;
      if (quizRef) {
        const quizDoc = await quizRef.get();
        const quizData = quizDoc.data();
        if (quizData) {
          totalScore += data.score || 0;
          if (data.status === 'finished' || quizData.status === 'finished') finishedCount++;
          recentBattles.push({
            quizId: quizDoc.id,
            title: quizData.title || 'Untitled',
            score: data.score || 0,
            status: quizData.status || 'unknown',
            created_at: quizData.created_at || 0,
          });
        }
      }
    }

    const totalBattles = participantsSnap.docs.length;
    const avgScore = finishedCount > 0 ? Math.round(totalScore / finishedCount) : 0;
    const wins = recentBattles.filter(b => b.status === 'finished' && b.score > 0).length;

    recentBattles.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    // Check if there's an active battle
    let activeBattleId: string | null = null;
    let activeBattleTitle: string | null = null;
    for (const doc of participantsSnap.docs) {
      const quizRef = doc.ref.parent.parent;
      if (quizRef) {
        const quizDoc = await quizRef.get();
        const quizData = quizDoc.data();
        if (quizData && quizData.status === 'live') {
          activeBattleId = quizDoc.id;
          activeBattleTitle = quizData.title || 'Active Battle';
          break;
        }
      }
    }

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
    });
  } catch (err: any) {
    console.error('[GladiatorDashboard] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
