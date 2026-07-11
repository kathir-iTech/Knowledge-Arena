
import { NextResponse } from 'next/server';
import { handleCopilotChat } from '@/ai/engines/copilot-engine';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { rateLimiter, Limits, buildRateLimitHeaders } from '@/lib/rate-limiter';

export async function POST(req: Request) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'teacher');
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rl = rateLimiter.check(`ai:copilot:${auth.uid}`, Limits.AI_API_PER_USER);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: Limits.AI_API_PER_USER.message, retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      );
    }

    const { message } = await req.json();
    if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 });
    const response = await handleCopilotChat(message);
    return NextResponse.json({ response });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
