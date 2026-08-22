import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { getExplanation } from '@/ai/flows/explanation-flow';
import { createHash } from 'crypto';
import { enforceRateLimit, Limits, getClientIp } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

function stableDocId(questionId: string, wrongOptionIndex: number): string {
  return createHash('sha256').update(questionId + ':' + wrongOptionIndex).digest('hex').slice(0, 40);
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const idToken = authHeader?.replace('Bearer ', '');
    if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const rlIp = enforceRateLimit(`ai:explanation:`+ getClientIp(req), Limits.AI_EXPLANATION_PER_USER);
    if (rlIp) return rlIp;

    const body = await req.json().catch(() => ({}));
    const quizId = typeof body.quizId === 'string' ? body.quizId.trim() : '';
    const questionId = typeof body.questionId === 'string' ? body.questionId.trim() : '';
    const wrongOptionIndex = typeof body.wrongOptionIndex === 'number' ? body.wrongOptionIndex : -1;

    if (!quizId || !questionId || wrongOptionIndex < 0) {
      return NextResponse.json({ error: 'Missing quizId, questionId, or wrongOptionIndex' }, { status: 400 });
    }

    const db = getAdminDb();
    const docId = stableDocId(questionId, wrongOptionIndex);
    const cacheRef = db.collection('ai_explanations').doc(docId);
    const cacheSnap = await cacheRef.get();
    if (cacheSnap.exists) {
      const cached = cacheSnap.data() as { explanation: string };
      return NextResponse.json({ explanation: cached.explanation, cached: true });
    }

    const [questionSnap, answerKeySnap] = await Promise.all([
      db.collection(COLLECTIONS.QUIZZES).doc(quizId).collection(COLLECTIONS.QUESTIONS).doc(questionId).get(),
      db.collection(COLLECTIONS.QUIZZES).doc(quizId).collection(COLLECTIONS.ANSWER_KEYS).doc(questionId).get(),
    ]);

    if (!questionSnap.exists) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    const qData = questionSnap.data() as Record<string, unknown>;
    const options = (qData.options as string[]) || [];
    const text = String(qData.text || '');

    const akData = answerKeySnap.data() as Record<string, unknown> | undefined;
    const correctIdx = typeof akData?.correct_option_index === 'number'
      ? (akData.correct_option_index as number)
      : 0;

    const result = await getExplanation({
      questionText: text,
      options,
      correctAnswer: options[correctIdx] || 'Unknown',
      correctOptionIndex: correctIdx,
      wrongAnswer: options[wrongOptionIndex] || 'Unknown',
      wrongOptionIndex,
      idToken,
    });

    if (result.error) {
      if (result.error === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      if (result.error === 'EXPLANATION_RATE_LIMITED') return NextResponse.json({ error: Limits.AI_EXPLANATION_PER_USER.message, retryAfter: 60 }, { status: 429, headers: { 'Retry-After': '60', 'X-RateLimit-Remaining': '0' } });
      if (result.error === 'EXPLANATION_TIMEOUT') return NextResponse.json({ error: 'Explanation generation timed out. Please try again.' }, { status: 504 });
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    try {
      await cacheRef.set({
        questionId,
        wrongOptionIndex,
        explanation: result.explanation,
        createdAt: Date.now(),
      });
    } catch {
      // Best-effort cache
    }

    return NextResponse.json({ explanation: result.explanation, cached: false });
  } catch (err: unknown) {
    console.error('[Explanation POST] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}