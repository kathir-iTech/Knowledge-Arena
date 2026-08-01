import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { auditService } from '@/services/audit.service';
import { COLLECTIONS } from '@/lib/constants';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const snap = await getAdminDb().collection(COLLECTIONS.QUESTION_BANK).doc(id).get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    const data = snap.data()!;
    return NextResponse.json({
      question: {
        id,
        text: data.text || data.question_text || '',
        options: data.options || [],
        correctAnswerIndex: data.correctAnswerIndex ?? null,
        explanation: data.explanation || '',
        category: data.category || data.subject || 'General',
        difficulty: data.difficulty || 'medium',
        tags: data.tags || '',
        source: data.source || 'manual',
        createdBy: data.createdBy || null,
        createdAt: data.createdAt?.toMillis?.() ?? data.createdAt ?? null,
        updatedAt: data.updatedAt?.toMillis?.() ?? data.updatedAt ?? null,
      },
    });
  } catch (err: any) {
    console.error('[QuestionBank GET single] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const rateLimitResponse = enforceRateLimit(`write:${auth.uid}`, Limits.WRITE_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    const { text, options, correctAnswerIndex, explanation, category, difficulty, tags } = await req.json();

    if (typeof text !== 'string' || text.trim().length < 5) {
      return NextResponse.json({ error: 'Question text is required (min 5 chars)' }, { status: 400 });
    }
    if (!options || !Array.isArray(options) || options.length < 2) {
      return NextResponse.json({ error: 'At least 2 options are required' }, { status: 400 });
    }
    if (typeof correctAnswerIndex !== 'number' || correctAnswerIndex < 0 || correctAnswerIndex >= options.length) {
      return NextResponse.json({ error: 'Invalid correctAnswerIndex' }, { status: 400 });
    }

    const ref = getAdminDb().collection(COLLECTIONS.QUESTION_BANK).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    const now = Date.now();
    await ref.update({
      text: text.trim(),
      options: options.map((o: string) => o.trim()),
      correctAnswerIndex,
      explanation: explanation?.trim() || '',
      category: (category && category.trim()) || 'General',
      difficulty: difficulty || 'medium',
      tags: tags || '',
      updatedAt: Timestamp.fromMillis(now),
    });

    await auditService.record({
      timestamp: now,
      actor: auth.uid,
      actorRole: 'executive',
      action: 'question_bank_updated',
      target: id,
      metadata: { category: category || 'General', difficulty: difficulty || 'medium' },
    });

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    console.error('[QuestionBank PATCH] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const rateLimitResponse = enforceRateLimit(`write:${auth.uid}`, Limits.WRITE_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    const ref = getAdminDb().collection(COLLECTIONS.QUESTION_BANK).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    await ref.delete();
    await auditService.record({
      timestamp: Date.now(),
      actor: auth.uid,
      actorRole: 'executive',
      action: 'question_bank_deleted',
      target: id,
      metadata: { category: snap.data()?.category || null },
    });

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    console.error('[QuestionBank DELETE] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
