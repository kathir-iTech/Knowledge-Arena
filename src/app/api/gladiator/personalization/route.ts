import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await verifyFirebaseTokenWithRole(req, 'gladiator');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

    // For each finished quiz, fetch questions + answerKeys + user's submissions per question (batch per question, not per gladiator-question pair globally is okay)
    for (const qid of limited) {
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
    }, { headers: { 'Cache-Control': 'private, max-age=30' } });
  } catch (err) {
    console.error('[Personalization] Error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
