
import { NextResponse } from 'next/server';
import { getKnowledgeSummary } from '@/ai/engines/knowledge-engine';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { rateLimiter, Limits, buildRateLimitHeaders } from '@/lib/rate-limiter';

export async function GET(req: Request) {
  try {
    console.log("[knowledge] request started");
    const auth = await verifyFirebaseTokenWithRole(req, 'teacher');
    if (!auth) {
      console.log("[knowledge] auth failed");
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log("[knowledge] auth verified", auth.uid);

    const rl = rateLimiter.check(`ai:knowledge:${auth.uid}`, Limits.AI_API_PER_USER);
    if (!rl.allowed) {
      console.log("[knowledge] rate limited");
      return NextResponse.json(
        { error: Limits.AI_API_PER_USER.message, retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      );
    }
    console.log("[knowledge] rate limit passed");

    console.log("[knowledge] calling engine");
    const data = await getKnowledgeSummary(auth.uid);
    console.log("[knowledge] engine completed");
    return NextResponse.json(data);
  } catch (error) {
    console.error("================================");
    console.error("[knowledge] ROUTE ERROR");
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
