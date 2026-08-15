import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { auditService } from '@/services/audit.service';
import { COLLECTIONS } from '@/lib/constants';
import { buildSearchTokens } from '@/lib/quiz-sets';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim().toLowerCase() || '';
    const category = searchParams.get('category')?.trim() || '';
    const difficulty = searchParams.get('difficulty')?.trim() || '';
    const cursor = searchParams.get('cursor');

    let query = getAdminDb().collection(COLLECTIONS.QUESTION_BANK).orderBy('createdAt', 'desc').limit(PAGE_SIZE + 1);
    if (category) query = query.where('category', '==', category);
    if (difficulty) query = query.where('difficulty', '==', difficulty);
    if (cursor) {
      const cursorDoc = await getAdminDb().collection(COLLECTIONS.QUESTION_BANK).doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snap = await query.get();
    const hasMore = snap.docs.length > PAGE_SIZE;
    const docs = snap.docs.slice(0, PAGE_SIZE);

    const questions = docs
      .filter(d => !q || (d.data().text || '').toLowerCase().includes(q) || (d.data().category || '').toLowerCase().includes(q))
      .map(d => {
        const data = d.data();
        return {
          id: d.id,
          text: data.text || data.question_text || '',
          category: data.category || data.subject || 'General',
          difficulty: data.difficulty || 'medium',
          source: data.source || 'manual',
          createdBy: data.createdBy || null,
          createdAt: data.createdAt?.toMillis?.() ?? data.createdAt ?? null,
          questionCount: null,
        };
      });

    const nextCursor = hasMore && docs.length > 0 ? docs[docs.length - 1].id : null;

    return NextResponse.json({ questions, nextCursor, hasMore });
  } catch (err: any) {
    console.error('[QuestionBank GET] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const rateLimitResponse = enforceRateLimit(`write:${auth.uid}`, Limits.WRITE_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;

    const { questions, category, difficulty, tags, source, title, importSessionId } = await req.json();

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: 'questions array is required' }, { status: 400 });
    }

    if (title !== undefined && (typeof title !== 'string' || title.trim().length > 120)) {
      return NextResponse.json({ error: 'title must be a string of at most 120 characters' }, { status: 400 });
    }
    if (importSessionId !== undefined && (typeof importSessionId !== 'string' || !importSessionId.trim() || importSessionId.length > 100)) {
      return NextResponse.json({ error: 'importSessionId must be a string of at most 100 characters' }, { status: 400 });
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
    const sessionId = importSessionId || randomUUID();
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
        title: title?.trim() || '',
        importSessionId: sessionId,
        createdBy: auth.uid,
        createdAt: Timestamp.fromMillis(now),
        updatedAt: Timestamp.fromMillis(now),
        searchTokens: buildSearchTokens(title, category || 'General', tags),
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
      metadata: { count: questions.length, category, difficulty, source: source || 'ai_pdf_forge', importSessionId: sessionId },
    });

    return NextResponse.json({ success: true, saved: savedIds.length, ids: savedIds, importSessionId: sessionId });
  } catch (err: any) {
    console.error('[QuestionBank POST] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
