import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithAnyRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import { createHash } from 'crypto';

export const runtime = 'nodejs';

// R2-35 / Feature 35 (CONDITIONAL content-only): quiz-content translation.
// Source text is never replaced; translations are derived cache in
// ai_translations/{hash} SHA256(questionId+text+targetLang), Admin-only.
// Chrome i18n stays PARKED. Rate-limited per-uid; quota-gated like explanation.
function stableId(questionId: string, text: string, targetLang: string): string {
  return createHash('sha256').update(`${questionId}||${text}||${targetLang}`).digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithAnyRole(req, ['commander', 'executive']);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const rl = await enforceRateLimit(`ai:translate:${auth.uid}`, Limits.AI_API_PER_USER);
    if (rl) return rl;
    const body = await req.json().catch(() => ({}));
    const questionId = typeof body.questionId === 'string' ? body.questionId : '';
    const text = typeof body.text === 'string' ? body.text : '';
    const targetLang = typeof body.targetLang === 'string' ? body.targetLang.trim().toLowerCase() : '';
    if (!questionId || !text || !/^[a-z-]{2,10}$/.test(targetLang)) {
      return NextResponse.json({ error: 'questionId, text, targetLang required' }, { status: 400 });
    }
    const db = getAdminDb();
    const id = stableId(questionId, text, targetLang);
    const cached = await db.collection(COLLECTIONS.AI_TRANSLATIONS).doc(id).get();
    if (cached.exists) {
      const data = cached.data() as Record<string, unknown>;
      return NextResponse.json({ translated: String(data.translated ?? ''), cached: true, hash: id });
    }
    // Set 2 ships cache + contract only; model call is deferred until a
    // glossary owner exists (CONDITIONAL). Return explicit parked signal.
    return NextResponse.json(
      { error: 'Translation model parked pending glossary owner', hash: id, cached: false },
      { status: 410 },
    );
  } catch (err) {
    console.error('[Translate] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
