import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithAnyRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { generateMindMap } from '@/ai/flows/mindmap-flow';
import { enforceRateLimit, Limits, getClientIp } from '@/lib/rate-limiter';
import { createHash } from 'crypto';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const idToken = authHeader?.replace('Bearer ', '');
    if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const rlIp = enforceRateLimit(`ai:mindmap:`+ getClientIp(req), Limits.AI_MINDMAP_PER_USER);
    if (rlIp) return rlIp;

    const body = await req.json().catch(() => ({}));
    const quizId = typeof body.quizId === 'string' ? body.quizId.trim() : '';
    if (!quizId) return NextResponse.json({ error: 'Missing quizId' }, { status: 400 });

    const db = getAdminDb();
    const quizSnap = await db.collection(COLLECTIONS.QUIZZES).doc(quizId).get();
    if (!quizSnap.exists) return NextResponse.json({ error: 'Arena not found' }, { status: 404 });

    const quizData = quizSnap.data() as Record<string, unknown>;
    const quizTitle = String(quizData.title || 'Quiz');
    const createdBy = quizData.created_by as string | undefined;

    // Fetch questions and answer keys
    const [questionsSnap, answerKeysSnap] = await Promise.all([
      db.collection(COLLECTIONS.QUIZZES).doc(quizId).collection(COLLECTIONS.QUESTIONS).get(),
      db.collection(COLLECTIONS.QUIZZES).doc(quizId).collection(COLLECTIONS.ANSWER_KEYS).get(),
    ]);

    const akMap = new Map<string, number>();
    for (const d of answerKeysSnap.docs) {
      const v = d.data().correct_option_index;
      if (typeof v === 'number') akMap.set(d.id, v);
    }

    const questions = questionsSnap.docs.map(d => {
      const data = d.data();
      const options = (data.options as string[]) || [];
      const correctIdx = akMap.get(d.id) ?? 0;
      return {
        text: String(data.text || ''),
        correctAnswer: options[correctIdx] || 'Unknown',
      };
    }).filter(q => q.text.length > 0);

    if (questions.length === 0) {
      return NextResponse.json({ error: 'No questions found' }, { status: 400 });
    }

    // Cost/quota: cache mind maps per quiz content hash (same as explanation caching).
    // Prevents duplicate Gemini calls for identical quiz content on free tier.
    const hash = createHash('sha256')
      .update(quizId + ':' + quizTitle + ':' + questions.map(q => q.text + '|' + q.correctAnswer).join('||'))
      .digest('hex')
      .slice(0, 40);
    const cacheRef = db.collection('ai_mindmaps').doc(hash);
    const cached = await cacheRef.get();
    if (cached.exists) {
      const data = cached.data() as { title: string; nodes: unknown; connections: unknown };
      return NextResponse.json({ title: data.title, nodes: data.nodes, connections: data.connections, cached: true });
    }

    const result = await generateMindMap({
      quizTitle,
      questions,
      idToken,
    });

    if (result.error) {
      if (result.error === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      if (result.error === 'MINDMAP_RATE_LIMITED') return NextResponse.json({ error: Limits.AI_MINDMAP_PER_USER.message, retryAfter: 60 }, { status: 429, headers: { 'Retry-After': '60', 'X-RateLimit-Remaining': '0' } });
      if (result.error === 'MINDMAP_TIMEOUT' || result.error.includes('MINDMAP_TIMEOUT') || result.error.includes('TIMEOUT')) return NextResponse.json({ error: 'Mind map generation timed out. Please try again.' }, { status: 504 });
      if (result.error.includes('GEMINI_QUOTA_EXCEEDED') || result.error.includes('ALL_GEMINI_KEYS_EXHAUSTED') || result.error.includes('quota_exceeded')) {
        const m = result.error.match(/retry after ~?(\d+)s/i);
        const retryAfter = m ? parseInt(m[1], 10) : 60;
        return NextResponse.json({ error: 'AI quota exhausted. Please wait a few minutes before retrying.', retryAfter }, { status: 429, headers: { 'Retry-After': String(retryAfter), 'X-RateLimit-Remaining': '0' } });
      }
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Cache successful result best-effort (Admin SDK bypasses rules; no client read needed)
    try {
      await cacheRef.set({ quizId, title: result.title, nodes: result.nodes, connections: result.connections, createdAt: Date.now(), hash });
    } catch {}

    return NextResponse.json({
      title: result.title,
      nodes: result.nodes,
      connections: result.connections,
      cached: false,
    });
  } catch (err: any) {
    console.error('[MindMap POST] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}