import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { auditService } from '@/services/audit.service';
import { COLLECTIONS } from '@/lib/constants';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { questions, category, difficulty, tags, source } = await req.json();

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: 'questions array is required' }, { status: 400 });
    }

    for (const q of questions) {
      if (!q.text || typeof q.text !== 'string' || q.text.trim().length < 5) {
        return NextResponse.json({ error: 'Each question must have text (min 5 chars)' }, { status: 400 });
      }
      if (!q.options || !Array.isArray(q.options) || q.options.length < 2) {
        return NextResponse.json({ error: 'Each question must have at least 2 options' }, { status: 400 });
      }
      if (typeof q.correctAnswerIndex !== 'number' || q.correctAnswerIndex < 0 || q.correctAnswerIndex >= q.options.length) {
        return NextResponse.json({ error: 'Each question must have a valid correctAnswerIndex' }, { status: 400 });
      }
    }

    const db = getAdminDb();
    const batch = db.batch();
    const now = Date.now();
    const savedIds: string[] = [];

    for (const q of questions) {
      const docRef = db.collection(COLLECTIONS.QUESTION_BANK).doc();
      batch.set(docRef, {
        text: q.text.trim(),
        options: q.options.map((o: string) => o.trim()),
        correctAnswerIndex: q.correctAnswerIndex,
        explanation: q.explanation?.trim() || '',
        category: category || 'General',
        difficulty: difficulty || 'medium',
        tags: tags || '',
        source: source || 'ai_pdf_forge',
        createdBy: auth.uid,
        createdAt: Timestamp.fromMillis(now),
        updatedAt: Timestamp.fromMillis(now),
      });
      savedIds.push(docRef.id);
    }

    await batch.commit();

    await auditService.record({
      timestamp: now,
      actor: auth.uid,
      actorRole: 'executive',
      action: 'question_bank_import',
      target: 'question_bank',
      metadata: { count: questions.length, category, difficulty, source: source || 'ai_pdf_forge' },
    });

    return NextResponse.json({ success: true, saved: savedIds.length, ids: savedIds });
  } catch (err: any) {
    console.error('[QuestionBank POST] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
