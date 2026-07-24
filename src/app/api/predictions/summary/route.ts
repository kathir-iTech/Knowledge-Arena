
import { NextResponse } from 'next/server';
import { getPredictionSummary } from '@/ai/engines/prediction-engine';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { rateLimiter, Limits, buildRateLimitHeaders } from '@/lib/rate-limiter';

export async function GET(req: Request) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'commander');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = rateLimiter.check(`ai:predictions:${auth.uid}`, Limits.AI_API_PER_USER);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: Limits.AI_API_PER_USER.message, retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      );
    }

    const data = await getPredictionSummary(auth.uid);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
