import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

// Phase 5: time-decayed mastery per area.
// M_c(t) = sum(Correct * e^{-lambda*dt}) / sum(Total * e^{-lambda*dt}),
// lambda = 0.05 (dt in days, half-life ~13.9d) so recent battles weigh more.
// Correct/Total come from the same submission vs answerKey comparison used
// for weakAreas; weight uses the quiz created_at snapshot already in quizMap.
const MASTERY_LAMBDA = 0.05;

export async function GET(req: NextRequest) {
  const auth = await verifyFirebaseTokenWithRole(req, 'gladiator');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const _rl = await enforceRateLimit(`gladiator:personalization:${auth.uid}`, Limits.READ_PER_USER);
    if (_rl) return _rl;

  const uid = auth.uid;
  try {
    const db = getAdminDb();

    // --- Weak areas: analyze recent finished battles where gladiator participated ---
    const participantsSnap = await db.collectionGroup(COLLECTIONS.PARTICIPANTS)
      .where('user_id', '==', uid)
      .select('user_id', 'score', 'status')
      .limit(50)
      .get();

    const quizIds = [...new Set(participantsSnap.docs.map(d => d.ref.parent.parent?.id).filter(Boolean) as string[])];
    const finishedQuizIds: string[] = [];
    const quizMap = new Map<string, Record<string, unknown>>();
    if (quizIds.length) {
      for (let i = 0; i < quizIds.length; i += 30) {
        const chunk = quizIds.slice(i, i + 30);
        const snaps = await db.getAll(...chunk.map(id => db.collection(COLLECTIONS.QUIZZES).doc(id)));
        for (const s of snaps) {
          if (!s.exists) continue;
          const data = s.data()!;
          const status = data.status as string;
          if (status === 'finished') finishedQuizIds.push(s.id);
          quizMap.set(s.id, data);
        }
      }
    }

    // Limit to 6 most recent finished for performance
    finishedQuizIds.sort((a, b) => {
      const aAt = (quizMap.get(a)?.created_at as number) || 0;
      const bAt = (quizMap.get(b)?.created_at as number) || 0;
      return bAt - aAt;
    });
    const limited = finishedQuizIds.slice(0, 6);

    type WeakItem = { label: string; total: number; wrong: number; wrongRate: number };
    const weakAreas: WeakItem[] = [];
    // Decay-weighted accumulators per difficulty/category label.
    const masteryAcc = new Map<string, { wCorrect: number; wTotal: number; rawTotal: number; rawCorrect: number }>();

    // For each finished quiz, fetch questions + answerKeys + user's submissions per question (batch per question, not per gladiator-question pair globally is okay)
    for (const qid of limited) {
      // Time-decay weight for this battle from its created_at snapshot.
      const quizCreatedAt = Number(quizMap.get(qid)?.created_at || 0);
      const dtDays = quizCreatedAt > 0 ? Math.max(0, (Date.now() - quizCreatedAt) / 86400000) : 0;
      const decayWeight = Math.exp(-MASTERY_LAMBDA * dtDays);
      const [qSnap, akSnap] = await Promise.all([
        db.collection(COLLECTIONS.QUIZZES).doc(qid).collection(COLLECTIONS.QUESTIONS).get(),
        db.collection(COLLECTIONS.QUIZZES).doc(qid).collection(COLLECTIONS.ANSWER_KEYS).get(),
      ]);
      const questions = qSnap.docs.map(d => ({ id: d.id, difficulty: String(d.data().difficulty || d.data().category || 'General') }));
      const akMap = new Map<string, number>();
      for (const d of akSnap.docs) {
        const v = d.data().correct_option_index;
        if (typeof v === 'number') akMap.set(d.id, v);
      }
      // Batch fetch user's submissions for this quiz's questions
      const subResults = await Promise.all(
        questions.map(async q => {
          const s = await db.collection(COLLECTIONS.QUIZZES).doc(qid).collection(COLLECTIONS.QUESTIONS).doc(q.id).collection(COLLECTIONS.SUBMISSIONS).doc(uid).get();
          return { qid: q.id, exists: s.exists, data: s.exists ? s.data() as Record<string, unknown> : null, difficulty: q.difficulty };
        })
      );
      let total = 0;
      let wrong = 0;
      const diffCounts = new Map<string, { total: number; wrong: number }>();
      for (const r of subResults) {
        if (!r.exists || !r.data) continue;
        const sel = r.data.selected_option as number | undefined;
        if (typeof sel !== 'number' || sel < 0) continue;
        total++;
        const correct = akMap.get(r.qid);
        const isWrong = typeof correct === 'number' && sel !== correct;
        if (isWrong) wrong++;
        const diff = r.difficulty;
        if (!diffCounts.has(diff)) diffCounts.set(diff, { total: 0, wrong: 0 });
        diffCounts.get(diff)!.total++;
        if (isWrong) diffCounts.get(diff)!.wrong++;
        // Mastery decay: only scoreable submissions (answer key known) feed
        // M_c(t); unscorable ones still count for weakAreas above.
        if (typeof correct === 'number') {
          const isCorrect = sel === correct ? 1 : 0;
          if (!masteryAcc.has(diff)) masteryAcc.set(diff, { wCorrect: 0, wTotal: 0, rawTotal: 0, rawCorrect: 0 });
          const acc = masteryAcc.get(diff)!;
          acc.wCorrect += isCorrect * decayWeight;
          acc.wTotal += decayWeight;
          acc.rawTotal += 1;
          acc.rawCorrect += isCorrect;
        }
      }
      if (total > 0) {
        const title = String(quizMap.get(qid)?.title || qid);
        const rate = Math.round((wrong / total) * 100);
        if (rate >= 40) {
          weakAreas.push({ label: title, total, wrong, wrongRate: rate });
        }
        // Also add per-difficulty weak areas if any difficulty has high wrong rate
        for (const [diff, counts] of diffCounts) {
          if (counts.total >= 2 && counts.wrong / counts.total >= 0.6) {
            weakAreas.push({ label: `${diff} questions in "${title}"`, total: counts.total, wrong: counts.wrong, wrongRate: Math.round((counts.wrong / counts.total) * 100) });
          }
        }
      }
    }
    weakAreas.sort((a, b) => b.wrongRate - a.wrongRate);
    const topWeak = weakAreas.slice(0, 5);

    // Collapse decay-weighted accumulators into mastery percentages (0-100,
    // weakest first). Overall mastery is the same ratio over all labels.
    type MasteryItem = { label: string; mastery: number; total: number; correct: number };
    const mastery: MasteryItem[] = Array.from(masteryAcc.entries()).map(([label, v]) => ({
      label,
      mastery: v.wTotal > 0 ? Math.round((v.wCorrect / v.wTotal) * 100) : 0,
      total: v.rawTotal,
      correct: v.rawCorrect,
    }));
    mastery.sort((a, b) => a.mastery - b.mastery);
    let overallWCorrect = 0;
    let overallWTotal = 0;
    for (const v of masteryAcc.values()) {
      overallWCorrect += v.wCorrect;
      overallWTotal += v.wTotal;
    }
    const overallMastery = overallWTotal > 0 ? Math.round((overallWCorrect / overallWTotal) * 100) : 0;

    // --- Upcoming arenas: waiting/ready that gladiator hasn't joined ---
    // Use status index — do NOT scan entire quizzes collection
    const upcomingSnap = await db.collection(COLLECTIONS.QUIZZES)
      .where('status', 'in', ['waiting', 'ready'])
      .orderBy('created_at', 'desc')
      .limit(20)
      .select('title', 'status', 'created_at', 'question_count', 'created_by')
      .get();

    const joinedSet = new Set(quizIds);
    const upcoming = upcomingSnap.docs
      .filter(d => !joinedSet.has(d.id))
      .map(d => {
        const data = d.data();
        return {
          id: d.id,
          title: String(data.title || 'Untitled'),
          status: String(data.status),
          createdAt: Number(data.created_at || 0),
          questionCount: Number(data.question_count || 0),
        };
      })
      .slice(0, 6);

    return NextResponse.json({
      weakAreas: topWeak,
      upcomingArenas: upcoming,
      mastery,
      overallMastery,
      masteryLambda: MASTERY_LAMBDA,
    }, { headers: { 'Cache-Control': 'private, max-age=30' } });
  } catch (err) {
    console.error('[Personalization] Error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}