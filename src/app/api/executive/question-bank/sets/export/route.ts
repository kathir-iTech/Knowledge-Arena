import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { decodeSetId, fetchSetDocs, summarizeSet } from '@/lib/quiz-sets';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

const MAX_SETS = 50;

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const rateLimitResponse = await enforceRateLimit(`export:${auth.uid}`, Limits.EXECUTIVE_EXPORT_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;

    const { setIds } = await req.json();
    if (!Array.isArray(setIds) || setIds.length === 0) {
      return NextResponse.json({ error: 'setIds array is required' }, { status: 400 });
    }
    if (setIds.length > MAX_SETS) {
      return NextResponse.json({ error: `Export limited to ${MAX_SETS} sets at once` }, { status: 400 });
    }

    const sets: Array<Record<string, unknown>> = [];
    for (const setId of setIds) {
      const key = decodeSetId(String(setId));
      if (!key) continue;
      const docs = await fetchSetDocs(String(setId));
      if (!docs.length) continue;
      const set = summarizeSet(key, docs);
      sets.push({
        title: set?.title || 'Untitled Quiz Set',
        category: set?.category || 'General',
        source: set?.source || 'manual',
        createdAt: set?.createdAt ?? null,
        questionCount: docs.length,
        questions: docs.map(d => ({
          text: d.data.text || d.data.question_text || '',
          options: d.data.options || [],
          correctAnswerIndex: d.data.correctAnswerIndex ?? null,
          explanation: d.data.explanation || '',
          difficulty: d.data.difficulty || 'medium',
          tags: d.data.tags || '',
        })),
      });
    }

    const payload = {
      kind: 'quiz_sets',
      version: 1,
      exportedAt: new Date().toISOString(),
      count: sets.length,
      sets,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="quiz-sets-${Date.now()}.json"`,
      },
    });
  } catch (err: any) {
    console.error('[QuizSets BULK EXPORT] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
