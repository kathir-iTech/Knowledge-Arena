import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

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
    console.error(`[BattleDetail GET] ${label} failed, degrading gracefully:`, err?.name, err?.message, '\n', err?.stack);
    return fallback;
  }
}

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

    // Questions + answer keys. Questions are ordered by sort_index; legacy
    // quizzes created before sort_index existed can lack the automatic
    // single-field index, which makes the ordered query fail with
    // FAILED_PRECONDITION. Fall back to an unordered fetch + in-memory sort.
    const [questionsDocs, keysDocs] = await Promise.all([
      safeQuery(
        'questions',
        async () => {
          try {
            const snap = await quizRef.collection('questions').orderBy('sort_index', 'asc').get();
            return snap.docs;
          } catch (err: any) {
            if (err?.code !== 'FAILED_PRECONDITION') throw err;
            console.warn('[BattleDetail GET] questions sort_index index missing, falling back to in-memory sort:', err?.message);
            const snap = await quizRef.collection('questions').get();
            const docs = snap.docs.slice();
            docs.sort((a, b) => (a.data().sort_index ?? Number.MAX_SAFE_INTEGER) - (b.data().sort_index ?? Number.MAX_SAFE_INTEGER));
            return docs;
          }
        },
        [] as FirebaseFirestore.QueryDocumentSnapshot[]
      ),
      safeQuery('answerKeys', async () => (await quizRef.collection('answerKeys').get()).docs, [] as FirebaseFirestore.QueryDocumentSnapshot[]),
    ]);
    const keys = new Map<string, number>();
    keysDocs.forEach(k => {
      const idx = k.data().correct_option_index;
      if (typeof idx === 'number') keys.set(k.id, idx);
    });
    const questions = questionsDocs.map(d => {
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

    // Participants + submissions. Questions are already fetched once above
    // (questionsDocs). Submissions are batch-read per question — one getDocs
    // per question yields every participant's submission for it — instead of a
    // per-participant loop that re-fetched the whole questions collection and
    // did a point read per (participant × question). Results are indexed by
    // userId so the participant mapping below is O(1) lookups.
    const participantDocs = await safeQuery('participants', async () => (await quizRef.collection('participants').get()).docs, [] as FirebaseFirestore.QueryDocumentSnapshot[]);

    const submissionsByUserId = new Map<string, Array<{ questionId: string | null; selectedOption: number | null; submittedAt: number | null }>>();
    const qIds = questionsDocs.map(d => d.id);
    try {
      const subSnapshots = await Promise.all(
        qIds.map(qid => quizRef.collection('questions').doc(qid).collection('submissions').get())
      );
      subSnapshots.forEach((snap, i) => {
        const qid = qIds[i];
        for (const subDoc of snap.docs) {
          const sData = subDoc.data();
          if (!sData) continue;
          const list = submissionsByUserId.get(subDoc.id) ?? [];
          list.push({
            questionId: qid,
            selectedOption: sData.selected_option ?? null,
            submittedAt: sData.submittedAt?.toMillis?.() ?? sData.submittedAt ?? null,
          });
          submissionsByUserId.set(subDoc.id, list);
        }
      });
    } catch (err: any) {
      console.error('[BattleDetail GET] submissions failed, degrading gracefully:', err?.name, err?.message, '\n', err?.stack);
    }

    const participantPromises = participantDocs.map(async p => {
      const data = p.data();
      const userId = data.user_id || p.id;
      const submissions = submissionsByUserId.get(userId) ?? [];

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

    // Battle logs timeline. battle_logs are written with a numeric `timestamp`
    // (plus a serverTimestamp `createdAt`). Query by quizId + timestamp desc;
    // if the composite index has not been deployed yet, fall back to an
    // equality-only fetch and sort in memory.
    let battleLogsSnap: FirebaseFirestore.QuerySnapshot;
    try {
      battleLogsSnap = await db.collection('battle_logs')
        .where('quizId', '==', id)
        .orderBy('timestamp', 'desc')
        .limit(200)
        .get();
    } catch (err: any) {
      if (err?.code !== 'FAILED_PRECONDITION') throw err;
      console.warn('[BattleDetail GET] battle_logs index missing, falling back to in-memory sort:', err?.message);
      battleLogsSnap = await db.collection('battle_logs')
        .where('quizId', '==', id)
        .get();
      battleLogsSnap.docs.sort((a, b) => {
        const ta = typeof a.data().timestamp === 'number' ? a.data().timestamp : a.data().createdAt?.toMillis?.() ?? 0;
        const tb = typeof b.data().timestamp === 'number' ? b.data().timestamp : b.data().createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
    }
    const timeline = battleLogsSnap.docs.slice(0, 200).map(d => {
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
    console.error('[BattleDetail GET] Error:', err?.name, err?.message, '\n', err?.stack);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
