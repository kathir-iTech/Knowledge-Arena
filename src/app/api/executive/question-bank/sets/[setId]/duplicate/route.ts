import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { auditService } from '@/services/audit.service';
import { COLLECTIONS } from '@/lib/constants';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import { decodeSetId, encodeSetId, fetchSetDocs, summarizeSet } from '@/lib/quiz-sets';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ setId: string }> }) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const rateLimitResponse = await enforceRateLimit(`write:${auth.uid}`, Limits.WRITE_PER_USER);
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

    const original = summarizeSet(key, docs);
    const sessionId = randomUUID();
    const now = Date.now();
    const db = getAdminDb();
    const batch = db.batch();
    const newIds: string[] = [];

    for (const doc of docs) {
      const data = doc.data;
      const ref = db.collection(COLLECTIONS.QUESTION_BANK).doc();
      batch.set(ref, {
        text: data.text || data.question_text || '',
        options: data.options || [],
        correctAnswerIndex: data.correctAnswerIndex ?? 0,
        explanation: data.explanation || '',
        category: data.category || data.subject || 'General',
        difficulty: data.difficulty || 'medium',
        tags: data.tags || '',
        source: data.source || 'manual',
        title: original ? `${original.title} (Copy)` : 'Untitled Set (Copy)',
        importSessionId: sessionId,
        createdBy: auth.uid,
        createdAt: Timestamp.fromMillis(now),
        updatedAt: Timestamp.fromMillis(now),
      });
      newIds.push(ref.id);
    }

    await batch.commit();

    await auditService.record({
      timestamp: now,
      actor: auth.uid,
      actorRole: 'executive',
      action: 'question_bank_set_duplicated',
      target: setId,
      metadata: { count: newIds.length, newSetId: encodeSetId(`i:${sessionId}`) },
    });

    return NextResponse.json({ success: true, count: newIds.length, setId: encodeSetId(`i:${sessionId}`) });
  } catch (err: any) {
    console.error('[QuizSets DUPLICATE] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
