import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS, PS_BLOCKED } from '@/lib/constants';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

// Phase 5: Gladiator join preflight (read-only).
//
// Mirrors the Firestore `participants create` domain gate
// (`allowed_gladiator_domain` snapshot + `isEmailDomainAllowed`
// parts[1]==lowerDomain exact) and the `isBlocked` check, without writing.
// Uses the ID-token email (same authority as request.auth.token.email) so a
// stale user-doc email can never diverge. Returns {allowed, reason} with an
// explicit domain message (e.g. your domain x doesn't match psgitech.ac.in).
// Late-join governance and session_token handling stay in the join path;
// this route never blocks on them (allowLateJoin default true preserved).
export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rateLimitResponse = await enforceRateLimit(`battle:can-join:${auth.uid}`, Limits.READ_PER_USER);
  if (rateLimitResponse) return rateLimitResponse;

  const body = await req.json().catch(() => ({}));
  const quizId = typeof body.quizId === 'string' ? body.quizId.trim() : '';
  if (!quizId) return NextResponse.json({ allowed: false, reason: 'Missing quizId' }, { status: 400 });

  try {
    const db = getAdminDb();

    // Snapshot read of the arena (Admin SDK, rules-bypassing) — D_arena.
    const quizSnap = await db.collection(COLLECTIONS.QUIZZES).doc(quizId).get();
    if (!quizSnap.exists) {
      return NextResponse.json({ allowed: false, reason: 'Quiz not found' }, { status: 404 });
    }
    const quizData = quizSnap.data() as Record<string, unknown>;

    // Commander/creator bypass (mirrors isQuizCreatorAfter exemption + client
    // joinQuiz `userId !== created_by` guard).
    if (typeof quizData.created_by === 'string' && quizData.created_by === auth.uid) {
      return NextResponse.json({ allowed: true, reason: null });
    }

    // isBlocked check (mirrors joinQuiz blocked guard).
    const partSnap = await db
      .collection(COLLECTIONS.QUIZZES).doc(quizId)
      .collection(COLLECTIONS.PARTICIPANTS).doc(auth.uid)
      .get();
    if (partSnap.exists && (partSnap.data()?.status as string) === PS_BLOCKED) {
      return NextResponse.json(
        { allowed: false, reason: 'You have been removed from this arena by the Commander.' }
      );
    }

    // ExtractDomain(E_user) == D_arena (exact match, same as rules
    // `parts.size() == 2 && parts[1] == lowerDomain` — never includes/endsWith,
    // so notpsgitech.ac.in cannot bypass psgitech.ac.in).
    const allowedDomainRaw = quizData.allowed_gladiator_domain as string | null | undefined;
    const allowedDomain = typeof allowedDomainRaw === 'string' ? allowedDomainRaw.trim().toLowerCase() : '';
    if (allowedDomain) {
      const emailLower = typeof auth.email === 'string' ? auth.email.trim().toLowerCase() : '';
      const parts = emailLower.split('@');
      const emailDomain = parts.length === 2 ? parts[1] : '';
      if (emailDomain !== allowedDomain) {
        return NextResponse.json({
          allowed: false,
          reason: `Your domain ${emailDomain || 'unknown'} doesn't match ${allowedDomain}. This battle is only open to @${allowedDomain} students.`,
        });
      }
    }

    return NextResponse.json({ allowed: true, reason: null });
  } catch (err) {
    console.error('[CanJoin] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
