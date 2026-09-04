import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getQuizRecommendations } from '@/ai/engines/prediction-engine';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'gladiator');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const rateLimitResponse = await enforceRateLimit(`ai:${auth.uid}`, Limits.AI_API_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;

    const recommendations = await getQuizRecommendations(auth.uid);

    return NextResponse.json({ recommendations }, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (err: any) {
    console.error('[Recommendations] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}