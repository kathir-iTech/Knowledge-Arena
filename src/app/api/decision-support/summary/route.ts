
import { NextResponse } from 'next/server';
import { getDecisionSupportSummary } from '@/ai/engines/decision-support-engine';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { rateLimiter, Limits, buildRateLimitHeaders } from '@/lib/rate-limiter';

export async function GET(req: Request) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'teacher');
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rl = rateLimiter.check(`ai:decision:${auth.uid}`, Limits.AI_API_PER_USER);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: Limits.AI_API_PER_USER.message, retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      );
    }

    const data = await getDecisionSupportSummary();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Decision support temporarily unavailable. Please try again.' }, { status: 500 });
  }
}
