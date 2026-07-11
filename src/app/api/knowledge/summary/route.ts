
import { NextResponse } from 'next/server';
import { getKnowledgeSummary } from '@/ai/engines/knowledge-engine';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { rateLimiter, Limits, buildRateLimitHeaders } from '@/lib/rate-limiter';

export async function GET(req: Request) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'teacher');
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rl = rateLimiter.check(`ai:knowledge:${auth.uid}`, Limits.AI_API_PER_USER);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: Limits.AI_API_PER_USER.message, retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      );
    }

    const authHeader = req.headers.get('Authorization');
    const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const data = await getKnowledgeSummary(idToken);
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
