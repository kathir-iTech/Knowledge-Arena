
import { NextResponse } from 'next/server';
import { getDecisionSupportSummary } from '@/ai/engines/decision-support-engine';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { rateLimiter, Limits, buildRateLimitHeaders } from '@/lib/rate-limiter';

export async function GET(req: Request) {
  try {
    console.log("[decision-support] request started");
    const auth = await verifyFirebaseTokenWithRole(req, 'teacher');
    if (!auth) {
      console.log("[decision-support] auth failed");
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log("[decision-support] auth verified", auth.uid);

    const rl = rateLimiter.check(`ai:decision:${auth.uid}`, Limits.AI_API_PER_USER);
    if (!rl.allowed) {
      console.log("[decision-support] rate limited");
      return NextResponse.json(
        { error: Limits.AI_API_PER_USER.message, retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      );
    }
    console.log("[decision-support] rate limit passed");

    console.log("[decision-support] calling engine");
    const data = await getDecisionSupportSummary();
    console.log("[decision-support] engine completed");
    return NextResponse.json(data);
  } catch (error) {
    console.error("================================");
    console.error("[decision-support] ROUTE ERROR");
    console.error(error);
    if (error instanceof Error) {
        console.error(error.message);
        console.error(error.stack);
    }
    console.error("================================");
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        stack: process.env.NODE_ENV === "development"
          ? error instanceof Error ? error.stack : undefined
          : undefined
      },
      { status: 500 }
    );
  }
}
