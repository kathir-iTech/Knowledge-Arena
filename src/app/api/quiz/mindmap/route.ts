import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithAnyRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { generateMindMap } from '@/ai/flows/mindmap-flow';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const idToken = authHeader?.replace('Bearer ', '');
    if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

    const result = await generateMindMap({
      quizTitle,
      questions,
      idToken,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      title: result.title,
      nodes: result.nodes,
      connections: result.connections,
    });
  } catch (err: any) {
    console.error('[MindMap POST] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
