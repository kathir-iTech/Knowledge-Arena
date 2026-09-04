import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const _rl = await enforceRateLimit(`read:${auth.uid}`, Limits.READ_PER_USER);
    if (_rl) return _rl;

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim().toLowerCase() || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    const db = getAdminDb();

    const [quizzesSnap, commandersSnap] = await Promise.all([
      db.collection('quizzes')
        .select('title', 'status', 'created_by', 'created_at', 'finished_at', 'participantCount', 'question_count', 'difficulty', 'archived')
        .limit(1000)
        .get(),
      db.collection('users').where('role', '==', 'commander').select('displayName', 'deleted').get(),
    ]);

    const commanderNames: Record<string, string> = {};
    commandersSnap.docs.forEach(d => {
      const data = d.data();
      if (!data.deleted) commanderNames[d.id] = data.displayName || 'Commander';
    });

    let finished = quizzesSnap.docs
      .filter(d => d.data().status === 'finished' && !d.data().archived)
      .sort((a, b) => (b.data().created_at || 0) - (a.data().created_at || 0));

    if (q) {
      finished = finished.filter(d =>
        ((d.data().title || '') as string).toLowerCase().includes(q) || d.id.toLowerCase().includes(q)
      );
    }

    const pageDocs = finished.slice(offset, offset + limit);

    const quizIds = pageDocs.map(d => d.id);
    const participantSnaps = await Promise.allSettled(
      quizIds.map(quizId =>
        db.collection('quizzes').doc(quizId).collection('participants').select('user_id', 'name', 'score').get()
      )
    );

    const battles = pageDocs.map((d, i) => {
      const data = d.data();
      const result = participantSnaps[i];
      const participants = result.status === 'fulfilled' ? result.value.docs : [];

      const studentParticipants = participants.filter(p => p.data().user_id !== data.created_by);
      const scores = studentParticipants.map(p => p.data().score || 0);
      const positiveScores = scores.filter(s => s > 0);
      const avgScore = scores.length > 0 ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length) : 0;

      const scored = studentParticipants.filter(p => (p.data().score || 0) > 0);
      const sorted = [...(scored.length > 0 ? scored : studentParticipants)].sort((a, b) => (b.data().score || 0) - (a.data().score || 0));
      const winner = sorted[0];

      return {
        id: d.id,
        title: data.title || 'Untitled Battle',
        commanderName: commanderNames[data.created_by] || 'Unknown Commander',
        createdAt: data.created_at || 0,
        finishedAt: data.finished_at || 0,
        participantCount: studentParticipants.length,
        questionCount: data.question_count || 0,
        difficulty: data.difficulty || 'medium',
        averageScore: avgScore,
        winner: winner && winner.data().score > 0
          ? { name: winner.data().name || winner.data().user_id?.slice(0, 8), score: winner.data().score }
          : null,
      };
    });

    const totalBattles = finished.length;

    return NextResponse.json({ battles, totalBattles, hasMore: offset + limit < finished.length });
  } catch (err: any) {
    console.error('[ExecutiveBattles] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}