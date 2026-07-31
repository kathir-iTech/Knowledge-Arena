import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const db = getAdminDb();
    const quizRef = db.collection('quizzes').doc(id);

    const quizSnap = await quizRef.get();
    if (!quizSnap.exists) {
      return NextResponse.json({ error: 'Battle not found' }, { status: 404 });
    }
    const quiz = quizSnap.data()!;

    // Commander info
    let commander: { name: string; email: string | null } | null = null;
    if (quiz.created_by) {
      const creatorSnap = await db.collection('users').doc(quiz.created_by).get().catch(() => null);
      if (creatorSnap?.exists) {
        const cData = creatorSnap.data();
        if (cData) commander = { name: cData.displayName || cData.name || 'Unknown Commander', email: cData.email || null };
      }
    }

    // Questions + answer keys
    const [questionsSnap, keysSnap] = await Promise.all([
      quizRef.collection('questions').orderBy('sort_index', 'asc').get(),
      quizRef.collection('answerKeys').get(),
    ]);
    const keys = new Map<string, number>();
    keysSnap.docs.forEach(k => {
      const idx = k.data().correct_option_index;
      if (typeof idx === 'number') keys.set(k.id, idx);
    });
    const questions = questionsSnap.docs.map(d => {
      const data = d.data();
      const correctIndex = keys.get(d.id);
      return {
        id: d.id,
        text: data.text || '',
        options: data.options || [],
        timer: data.timer || null,
        sortIndex: data.sort_index ?? null,
        scored: data.scored ?? null,
        correctAnswerIndex: correctIndex ?? null,
      };
    });

    // Participants + submissions
    const participantsSnap = await quizRef.collection('participants').get();
    const participantPromises = participantsSnap.docs.map(async p => {
      const data = p.data();
      const userId = data.user_id || p.id;
      const submissions: Array<{ questionId: string | null; selectedOption: number | null; submittedAt: number | null }> = [];
      const subSnap = await quizRef.collection('questions').get().then(async qSnap => {
        const results: Array<typeof submissions[0]> = [];
        const qIds = qSnap.docs.map(d => d.id);
        const subResults = await Promise.allSettled(
          qIds.map(qid =>
            quizRef.collection('questions').doc(qid).collection('submissions').doc(userId).get()
          )
        );
        subResults.forEach((r, i) => {
          if (r.status === 'fulfilled' && r.value.exists) {
            const sData = r.value.data();
            if (!sData) return;
            results.push({
              questionId: qIds[i],
              selectedOption: sData.selected_option ?? null,
              submittedAt: sData.submittedAt?.toMillis?.() ?? sData.submittedAt ?? null,
            });
          }
        });
        return results;
      });
      submissions.push(...subSnap);

      // Correct count
      let correctCount = 0;
      for (const s of submissions) {
        if (s.selectedOption === null) continue;
        const key = s.questionId ? keys.get(s.questionId) : undefined;
        if (key !== undefined && s.selectedOption === key) correctCount++;
      }

      return {
        userId,
        name: data.name || null,
        avatar: data.avatar || null,
        status: data.status || 'unknown',
        score: data.score || 0,
        violationsCount: data.violations_count || 0,
        reconnects: data.reconnect_count || 0,
        finishedAt: data.finished_at || null,
        correctCount,
        answeredCount: submissions.filter(s => s.selectedOption !== null).length,
        submissions,
      };
    });
    const participants = await Promise.all(participantPromises);
    const leaderboard = [...participants].sort((a, b) => b.score - a.score);

    // Battle logs timeline
    const battleLogsSnap = await db.collection('battle_logs')
      .where('quizId', '==', id)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();
    const timeline = battleLogsSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        event: data.event || 'unknown',
        actor: data.actor || null,
        actorRole: data.actorRole || null,
        timestamp: data.timestamp ?? data.createdAt?.toMillis?.() ?? null,
        metadata: data.metadata || {},
      };
    });

    // Statistics
    const studentParticipants = participants.filter(p => p.userId !== quiz.created_by);
    const answeredParticipants = studentParticipants.filter(p => p.answeredCount > 0);
    const scoredParticipants = studentParticipants.filter(p => p.score > 0);
    const totalAnswers = studentParticipants.reduce((s, p) => s + p.answeredCount, 0);
    const totalCorrect = studentParticipants.reduce((s, p) => s + p.correctCount, 0);
    const stats = {
      participantCount: studentParticipants.length,
      finishedCount: studentParticipants.filter(p => p.status === 'finished').length,
      averageScore: scoredParticipants.length > 0
        ? Math.round(scoredParticipants.reduce((s, p) => s + p.score, 0) / scoredParticipants.length)
        : 0,
      accuracy: totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : null,
      questionsAnswered: totalAnswers,
      questionsCorrect: totalCorrect,
      completionRate: studentParticipants.length > 0
        ? Math.round((answeredParticipants.length / studentParticipants.length) * 100)
        : 0,
    };

    const winner = leaderboard.find(p => p.userId !== quiz.created_by && p.score > 0) || null;

    return NextResponse.json({
      battle: {
        id,
        title: quiz.title || 'Untitled Battle',
        status: quiz.status || 'unknown',
        mode: quiz.battle_mode || 'unknown',
        difficulty: quiz.difficulty || 'medium',
        createdAt: quiz.created_at || 0,
        startedAt: quiz.started_at || quiz.question_start_at || 0,
        endedAt: quiz.ended_at || quiz.finished_at || 0,
        pausedAt: quiz.paused_at || null,
        currentQuestionIndex: quiz.current_question_index ?? null,
        questionCount: quiz.question_count || questions.length,
        participantCount: quiz.participantCount || studentParticipants.length,
        archived: !!quiz.archived,
        commanderId: quiz.created_by || null,
        commander,
        config: {
          battleMode: quiz.battle_mode || null,
          requireAllReady: quiz.start_config?.require_all_ready ?? null,
          scoreMax: quiz.scoring_config?.score_max ?? null,
          scoreMin: quiz.scoring_config?.score_min ?? null,
          wrongPenalty: quiz.scoring_config?.wrong_penalty ?? null,
          skipPenalty: quiz.scoring_config?.skip_penalty ?? null,
          timeDecay: quiz.scoring_config?.time_decay ?? null,
        },
        questions,
        participants,
        leaderboard: leaderboard.slice(0, 50),
        timeline,
        stats,
        winner,
      },
    });
  } catch (err: any) {
    console.error('[BattleDetail GET] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
