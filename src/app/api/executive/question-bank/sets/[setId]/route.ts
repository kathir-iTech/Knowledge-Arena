import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { auditService } from '@/services/audit.service';
import { COLLECTIONS } from '@/lib/constants';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import { decodeSetId, fetchSetDocs, summarizeSet, buildSearchTokens } from '@/lib/quiz-sets';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ setId: string }> }) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    if (!set) {
      return NextResponse.json({ error: 'Quiz set not found' }, { status: 404 });
    }

    const questions = docs.map(d => {
      const data = d.data;
      return {
        id: d.id,
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
      };
    });

    return NextResponse.json({ set: { ...set, questions } });
  } catch (err: any) {
    console.error('[QuizSets GET detail] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ setId: string }> }) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const rateLimitResponse = enforceRateLimit(`write:${auth.uid}`, Limits.WRITE_PER_USER);
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

    const { title, status } = await req.json();
    const updates: Record<string, unknown> = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim() || title.trim().length > 120) {
        return NextResponse.json({ error: 'Title must be 1-120 characters' }, { status: 400 });
      }
      updates.title = title.trim();
    }
    if (status !== undefined) {
      if (!['published', 'archived', 'active', null].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      updates.setStatus = status === 'active' ? null : status;
    }
    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const now = Date.now();
    const db = getAdminDb();
    const batch = db.batch();
    for (const doc of docs) {
      const next: Record<string, unknown> = { ...updates, updatedAt: Timestamp.fromMillis(now) };
      if (title !== undefined) {
        next.searchTokens = buildSearchTokens(title, doc.data.category || 'General', typeof doc.data.tags === 'string' ? doc.data.tags : '');
      }
      batch.update(db.collection(COLLECTIONS.QUESTION_BANK).doc(doc.id), next);
    }
    await batch.commit();

    await auditService.record({
      timestamp: now,
      actor: auth.uid,
      actorRole: 'executive',
      action: 'question_bank_set_updated',
      target: setId,
      metadata: { count: docs.length, ...updates },
    });

    return NextResponse.json({ success: true, setId, count: docs.length });
  } catch (err: any) {
    console.error('[QuizSets PATCH] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ setId: string }> }) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const rateLimitResponse = enforceRateLimit(`write:${auth.uid}`, Limits.WRITE_PER_USER);
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

    const db = getAdminDb();
    const batch = db.batch();
    for (const doc of docs) {
      batch.delete(db.collection(COLLECTIONS.QUESTION_BANK).doc(doc.id));
    }
    await batch.commit();

    await auditService.record({
      timestamp: Date.now(),
      actor: auth.uid,
      actorRole: 'executive',
      action: 'question_bank_set_deleted',
      target: setId,
      metadata: { count: docs.length, category: docs[0].data.category || null },
    });

    return NextResponse.json({ success: true, setId, deleted: docs.length });
  } catch (err: any) {
    console.error('[QuizSets DELETE] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
