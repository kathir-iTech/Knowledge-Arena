import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getQuizRecommendations } from '@/ai/engines/prediction-engine';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

// Runs a helper and degrades to a fallback value instead of ever 500ing.
// Errors are logged with a stack so the exact failing query can be found.
async function safeQuery<T>(
  label: string,
  run: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    const e = err as { message?: string; name?: string; stack?: string };
    console.error(`[Recommendations GET] ${label} failed, degrading gracefully:`, e?.name, e?.message, '\n', e?.stack);
    return fallback;
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'gladiator');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const rateLimitResponse = await enforceRateLimit(`ai:${auth.uid}`, Limits.AI_API_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;

    const recommendations = await safeQuery('quiz recommendations', () => getQuizRecommendations(auth.uid), []);

    return NextResponse.json({ recommendations }, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (err) {
    const e = err as { message?: string; name?: string };
    console.error('[Recommendations] Error:', e?.name, e?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}