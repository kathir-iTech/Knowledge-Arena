import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { decodeSetId, fetchSetDocs, summarizeSet } from '@/lib/quiz-sets';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ setId: string }> }) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const rateLimitResponse = await enforceRateLimit(`export:${auth.uid}`, Limits.EXECUTIVE_EXPORT_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;

    const { setId } = await params;
    const key = decodeSetId(setId);
    if (!key) {
      return NextResponse.json({ error: 'Invalid set id' }, { status: 400 });
    }

    const docs = await fetchSetDocs(setId);
    if (!docs.length) {
      return NextResponse.json({ error: 'Quiz set not found' }, { status: 404 });
    }

    const set = summarizeSet(key, docs);
    const questions = docs.map(d => {
      const data = d.data;
      return {
        text: data.text || data.question_text || '',
        options: data.options || [],
        correctAnswerIndex: data.correctAnswerIndex ?? null,
        explanation: data.explanation || '',
        difficulty: data.difficulty || 'medium',
        tags: data.tags || '',
      };
    });

    const payload = {
      kind: 'quiz_set',
      version: 1,
      exportedAt: new Date().toISOString(),
      set: {
        title: set?.title || 'Untitled Quiz Set',
        category: set?.category || 'General',
        source: set?.source || 'manual',
        createdAt: set?.createdAt ?? null,
        questionCount: questions.length,
      },
      questions,
    };

    const safeName = (payload.set.title || 'quiz-set').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'quiz-set';
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeName}.json"`,
      },
    });
  } catch (err: any) {
    console.error('[QuizSets EXPORT] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
