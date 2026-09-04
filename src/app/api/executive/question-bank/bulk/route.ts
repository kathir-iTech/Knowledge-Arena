import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { COLLECTIONS, MAX_BATCH_OPS } from '@/lib/constants';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import { fetchSetDocs } from '@/lib/quiz-sets';
import { auditService } from '@/services/audit.service';
import { buildSearchTokens } from '@/lib/quiz-sets';

export const runtime = 'nodejs';

const ALLOWED_DIFFICULTIES = new Set(['easy', 'moderate', 'medium', 'hard']);

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const rateLimitResponse = await enforceRateLimit(`write:${auth.uid}`, Limits.WRITE_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;

    const { setIds, difficulty, tag } = await req.json();

    if (!Array.isArray(setIds) || setIds.length === 0) {
      return NextResponse.json({ error: 'setIds array is required' }, { status: 400 });
    }
    if (setIds.length > 50) {
      return NextResponse.json({ error: 'Bulk update limited to 50 sets at once' }, { status: 400 });
    }
    if (difficulty !== undefined && difficulty !== null && difficulty !== '') {
      if (typeof difficulty !== 'string' || !ALLOWED_DIFFICULTIES.has(difficulty)) {
        return NextResponse.json({ error: 'Invalid difficulty. Allowed: easy, moderate, medium, hard' }, { status: 400 });
      }
    }
    if (tag !== undefined && tag !== null && tag !== '') {
      if (typeof tag !== 'string' || !tag.trim() || tag.trim().length > 100) {
        return NextResponse.json({ error: 'Tag must be a non-empty string up to 100 characters' }, { status: 400 });
      }
    }
    if ((!difficulty || difficulty === '') && (!tag || (typeof tag === 'string' && !tag.trim()))) {
      return NextResponse.json({ error: 'At least one of difficulty or tag is required' }, { status: 400 });
    }

    const normalizedDifficulty = difficulty && typeof difficulty === 'string' && difficulty.trim() ? difficulty.trim() : null;
    const normalizedTag = tag && typeof tag === 'string' && tag.trim() ? tag.trim() : null;

    // Collect all underlying question docs for the selected sets
    const allDocs: Array<{ id: string; data: Record<string, unknown> }> = [];
    for (const setId of setIds) {
      if (typeof setId !== 'string' || !setId) continue;
      const docs = await fetchSetDocs(setId);
      for (const d of docs) allDocs.push(d as unknown as { id: string; data: Record<string, unknown> });
    }

    if (allDocs.length === 0) {
      return NextResponse.json({ error: 'No questions found for the selected sets' }, { status: 404 });
    }
    if (allDocs.length > MAX_BATCH_OPS) {
      return NextResponse.json({ error: `Bulk update limited to ${MAX_BATCH_OPS} questions per batch. Selected sets contain ${allDocs.length} questions.` }, { status: 400 });
    }

    const db = getAdminDb();
    const batch = db.batch();
    const now = Date.now();
    let updated = 0;

    for (const doc of allDocs) {
      const ref = db.collection(COLLECTIONS.QUESTION_BANK).doc(doc.id);
      const updates: Record<string, unknown> = { updatedAt: Timestamp.fromMillis(now) };
      let needsUpdate = false;

      if (normalizedDifficulty) {
        updates.difficulty = normalizedDifficulty;
        needsUpdate = true;
      }
      if (normalizedTag) {
        const existingTags = typeof doc.data.tags === 'string' ? (doc.data.tags as string) : '';
        const existingParts = existingTags.split(',').map(s => s.trim()).filter(Boolean);
        const lowerExisting = existingParts.map(s => s.toLowerCase());
        let newTags: string;
        if (!existingTags.trim()) {
          newTags = normalizedTag;
        } else if (lowerExisting.includes(normalizedTag.toLowerCase())) {
          // Tag already present — still touch updatedAt but don't duplicate tag
          newTags = existingTags;
        } else {
          newTags = `${existingTags}, ${normalizedTag}`;
        }
        // Only mark as update if tags actually changes or we want to ensure searchTokens refresh
        if (newTags !== existingTags) {
          updates.tags = newTags;
          // Refresh searchTokens to include new tag
          const title = typeof doc.data.title === 'string' ? (doc.data.title as string) : '';
          const category = typeof doc.data.category === 'string' ? (doc.data.category as string) : 'General';
          updates.searchTokens = buildSearchTokens(title, category, newTags);
        } else {
          // Keep existing tags but still ensure searchTokens consistent if difficulty changed? difficulty doesn't affect tokens.
          // If only updatedAt changes, we still commit.
        }
        needsUpdate = true;
      }

      if (needsUpdate) {
        batch.update(ref, updates);
        updated++;
      }
    }

    if (updated === 0) {
      return NextResponse.json({ error: 'No updates to apply (tags already present / no difficulty change)' }, { status: 400 });
    }

    // Single Firestore batch write — all question docs updated atomically (max 500 ops)
    await batch.commit();

    await auditService.record({
      timestamp: now,
      actor: auth.uid,
      actorRole: 'executive',
      action: 'question_bank_bulk_updated',
      target: `bulk:${setIds.length}sets`,
      metadata: { setCount: setIds.length, questionCount: updated, difficulty: normalizedDifficulty, tag: normalizedTag },
    });

    return NextResponse.json({ success: true, updated, setCount: setIds.length });
  } catch (err: unknown) {
    console.error('[QuestionBank BULK] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
