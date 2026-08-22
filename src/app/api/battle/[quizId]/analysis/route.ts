import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { COLLECTIONS, QUIZ_CONFIG_SETTINGS_DOC } from '@/lib/constants';
import { normalizeScoringConfig, computeCorrectScore, computeStreakBonus } from '@/lib/battle-machine';

export const runtime = 'nodejs';

function getMs(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v && typeof (v as { toMillis: () => number }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  return 0;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  if (!quizId) return NextResponse.json({ error: 'quizId required' }, { status: 400 });

  let authResult: { uid: string; role: string } | null = null;
  for (const r of ['commander', 'gladiator', 'executive'] as const) {
    const res = await verifyFirebaseTokenWithRole(req, r).catch(() => null);
    if (res) { authResult = { uid: res.uid, role: r }; break; }
  }
  if (!authResult) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const uid = authResult.uid;
  const role = authResult.role;

  try {
    const db = getAdminDb();
    const quizRef = db.collection(COLLECTIONS.QUIZZES).doc(quizId);
    const quizSnap = await quizRef.get();
    if (!quizSnap.exists) return NextResponse.json({ error: 'Arena not found' }, { status: 404 });
    const quizData = quizSnap.data() as Record<string, unknown>;
    const createdBy = quizData.created_by as string | undefined;
    // Allow creator, participant, or executive
    if (role !== 'executive' && uid !== createdBy) {
      const partSnap = await db.collection(COLLECTIONS.QUIZZES).doc(quizId).collection(COLLECTIONS.PARTICIPANTS).doc(uid).get();
      if (!partSnap.exists) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Batch reads — not per-row
    const [configSnap, questionsSnap, answerKeysSnap, participantsSnap] = await Promise.all([
      db.collection(COLLECTIONS.QUIZZES).doc(quizId).collection(COLLECTIONS.QUIZ_CONFIG).doc(QUIZ_CONFIG_SETTINGS_DOC).get(),
      db.collection(COLLECTIONS.QUIZZES).doc(quizId).collection(COLLECTIONS.QUESTIONS).orderBy('sort_index').get(),
      db.collection(COLLECTIONS.QUIZZES).doc(quizId).collection(COLLECTIONS.ANSWER_KEYS).get(),
      db.collection(COLLECTIONS.QUIZZES).doc(quizId).collection(COLLECTIONS.PARTICIPANTS).get(),
    ]);

    const scoringConfig = normalizeScoringConfig(
      (configSnap.exists ? (configSnap.data() as Record<string, unknown>).scoring_config : (quizData as Record<string, unknown>).scoring_config) as never
    );

    const questions = questionsSnap.docs.map(d => ({
      id: d.id,
      text: String(d.data().text || ''),
      options: (d.data().options as string[]) || [],
      timer: Number(d.data().timer || 30),
      sort_index: Number(d.data().sort_index || 0),
    })).sort((a, b) => a.sort_index - b.sort_index);

    const answerKeyMap = new Map<string, number>();
    for (const d of answerKeysSnap.docs) {
      const v = d.data().correct_option_index;
      if (typeof v === 'number') answerKeyMap.set(d.id, v);
    }

    const participants = participantsSnap.docs
      .map(d => ({ id: d.id, data: d.data() as Record<string, unknown> }))
      .filter(p => p.data.status !== 'blocked')
      // exclude commander if not executive? keep for engagement but filter creator for stats? Keep all for completeness, but engagement shows gladiators only
      .map(p => ({
        id: p.id,
        name: String(p.data.name || p.data.displayName || p.id.slice(0, 6)),
        score: Number(p.data.score || 0),
        isCreator: p.id === createdBy,
      }));

    const gladiators = participants.filter(p => !p.isCreator);

    // Fetch submissions per question in parallel — batch, not per gladiator-question
    const submissionsByQuestion: Record<string, Array<{ userId: string; selected_option: number; submittedAt: number; clientTime?: number }>> = {};
    const subsResults = await Promise.all(
      questions.map(async q => {
        const snap = await db.collection(COLLECTIONS.QUIZZES).doc(quizId).collection(COLLECTIONS.QUESTIONS).doc(q.id).collection(COLLECTIONS.SUBMISSIONS).get();
        return { qid: q.id, docs: snap.docs };
      })
    );
    for (const r of subsResults) {
      submissionsByQuestion[r.qid] = r.docs.map(d => {
        const data = d.data() as Record<string, unknown>;
        return {
          userId: d.id,
          selected_option: typeof data.selected_option === 'number' ? data.selected_option : -1,
          submittedAt: getMs(data.submittedAt ?? data.submitted_at),
          clientTime: typeof data.clientTime === 'number' ? data.clientTime : undefined,
        };
      });
    }

    // Question breakdown
    const questionBreakdown = questions.map(q => {
      const subs = submissionsByQuestion[q.id] || [];
      const correctIdx = answerKeyMap.get(q.id) ?? null;
      let correctCount = 0;
      const optionCounts: Record<number, number> = {};
      const times: number[] = [];
      for (const s of subs) {
        if (s.selected_option < 0) continue;
        optionCounts[s.selected_option] = (optionCounts[s.selected_option] || 0) + 1;
        if (correctIdx !== null && s.selected_option === correctIdx) correctCount++;
        if (s.submittedAt > 0) times.push(s.submittedAt);
      }
      // average time: use earliest as proxy start
      let avgTimeSec = 0;
      if (times.length >= 2) {
        const sorted = [...times].sort((a, b) => a - b);
        const start = sorted[0];
        const elapsed = sorted.slice(1).map(t => t - start).filter(t => t > 0 && t < 3600000);
        if (elapsed.length) avgTimeSec = Math.round(elapsed.reduce((a, b) => a + b, 0) / elapsed.length / 1000);
      } else if (times.length === 1) {
        avgTimeSec = 0;
      }
      let mostCommonWrong: { option: string; count: number } | null = null;
      if (correctIdx !== null) {
        let max = 0;
        let maxIdx = -1;
        for (const [optStr, cnt] of Object.entries(optionCounts)) {
          const idx = Number(optStr);
          if (idx !== correctIdx && cnt > max) { max = cnt; maxIdx = idx; }
        }
        if (maxIdx >= 0 && q.options[maxIdx]) mostCommonWrong = { option: q.options[maxIdx], count: max };
      }
      return {
        questionId: q.id,
        text: q.text,
        options: q.options,
        correctOptionIndex: correctIdx,
        submittedCount: subs.length,
        correctCount,
        avgTimeSec,
        mostCommonWrongAnswer: mostCommonWrong,
        optionCounts,
      };
    });

    // Gladiator engagement — score progression per question
    // Reconstruct progression using same scoring logic + streak
    const engagement: Array<{ gladiatorId: string; name: string; progression: number[]; total: number }> = [];
    for (const g of gladiators) {
      let running = 0;
      let streak = 0;
      const prog: number[] = [];
      for (const q of questions) {
        const subs = submissionsByQuestion[q.id] || [];
        const sub = subs.find(s => s.userId === g.id);
        const correctIdx = answerKeyMap.get(q.id) ?? null;
        if (!sub || sub.selected_option < 0) {
          streak = 0;
          prog.push(running);
          continue;
        }
        const isCorrect = correctIdx !== null && sub.selected_option === correctIdx;
        if (isCorrect) {
          streak += 1;
          // elapsed: approximate using avg? Use 5s for analysis if no time data to avoid 0 division
          // Prefer clientTime if available as elapsed
          let elapsed = 5000;
          if (sub.submittedAt && subs.length) {
            const times = subs.map(s => s.submittedAt).filter(t => t > 0).sort((a, b) => a - b);
            if (times.length) {
              const start = times[0];
              elapsed = Math.max(0, sub.submittedAt - start);
              if (elapsed === 0) elapsed = 1000; // at least 1s for first submitter
            }
          } else if (sub.clientTime) {
            elapsed = sub.clientTime * 1000;
          }
          const timeLimit = (q.timer || scoringConfig.time_limit_seconds || 30) * 1000;
          const base = computeCorrectScore(scoringConfig, elapsed, timeLimit);
          const bonus = computeStreakBonus(streak, scoringConfig.streak_multiplier);
          running += base + bonus;
        } else {
          streak = 0;
          if (scoringConfig.wrong_penalty > 0) running = Math.max(0, running - scoringConfig.wrong_penalty);
        }
        prog.push(running);
      }
      engagement.push({ gladiatorId: g.id, name: g.name, progression: prog, total: running });
    }

    // Build detailed CSV rows (one per gladiator-question pair) — also batch derived, not per-row queries
    const csvRows: Array<Record<string, string | number>> = [];
    // Header for JSON: include rows
    const detailed: Array<{ gladiatorName: string; questionText: string; answerGiven: string; correct: boolean; timeTakenSec: number; pointsAwarded: number }> = [];
    for (const g of gladiators) {
      let streak = 0;
      for (const q of questions) {
        const subs = submissionsByQuestion[q.id] || [];
        const sub = subs.find(s => s.userId === g.id);
        const correctIdx = answerKeyMap.get(q.id) ?? null;
        const answerGiven = sub && sub.selected_option >= 0 && q.options[sub.selected_option] ? q.options[sub.selected_option] : '—';
        const isCorrect = sub ? correctIdx !== null && sub.selected_option === correctIdx : false;
        let timeTakenSec = 0;
        let points = 0;
        if (sub && sub.submittedAt) {
          const times = subs.map(s => s.submittedAt).filter(t => t > 0).sort((a, b) => a - b);
          const start = times[0] || sub.submittedAt;
          timeTakenSec = Math.max(0, Math.round((sub.submittedAt - start) / 1000));
        }
        if (isCorrect) {
          streak += 1;
          const elapsed = timeTakenSec * 1000 || 1000;
          const timeLimit = (q.timer || scoringConfig.time_limit_seconds || 30) * 1000;
          const base = computeCorrectScore(scoringConfig, elapsed, timeLimit);
          const bonus = computeStreakBonus(streak, scoringConfig.streak_multiplier);
          points = base + bonus;
        } else if (sub) {
          streak = 0;
          points = scoringConfig.wrong_penalty > 0 ? -scoringConfig.wrong_penalty : 0;
        } else {
          streak = 0;
        }
        detailed.push({
          gladiatorName: g.name,
          questionText: q.text,
          answerGiven,
          correct: isCorrect,
          timeTakenSec,
          pointsAwarded: points,
        });
        csvRows.push({
          'Gladiator': g.name,
          'Question': q.text,
          'Answer Given': answerGiven,
          'Correct/Wrong': isCorrect ? 'Correct' : 'Wrong',
          'Time Taken (s)': timeTakenSec,
          'Points Awarded': points,
        });
      }
    }

    // CSV export if requested via query param
    const url = new URL(req.url);
    if (url.searchParams.get('format') === 'csv') {
      const headers = ['Gladiator', 'Question', 'Answer Given', 'Correct/Wrong', 'Time Taken (s)', 'Points Awarded'];
      const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
      const csv = [headers.map(esc).join(','), ...csvRows.map(r => headers.map(h => esc(r[h] as string)).join(','))].join('\n');
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="battle-${quizId}-analysis.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json({
      quizId,
      title: String(quizData.title || 'Untitled'),
      scoringConfig,
      questionBreakdown,
      engagement,
      detailed,
      participants: gladiators.length,
    }, { headers: { 'Cache-Control': 'private, max-age=10' } });
  } catch (err) {
    console.error('[Analysis] Error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
