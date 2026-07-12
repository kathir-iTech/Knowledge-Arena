
import { NextResponse } from 'next/server';
import { getPredictionSummary } from '@/ai/engines/prediction-engine';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { rateLimiter, Limits, buildRateLimitHeaders } from '@/lib/rate-limiter';

export async function GET(req: Request) {
  try {
    console.log("[predictions] request started");
    const auth = await verifyFirebaseTokenWithRole(req, 'teacher');
    if (!auth) {
      console.log("[predictions] auth failed");
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log("[predictions] auth verified", auth.uid);

    const rl = rateLimiter.check(`ai:predictions:${auth.uid}`, Limits.AI_API_PER_USER);
    if (!rl.allowed) {
      console.log("[predictions] rate limited");
      return NextResponse.json(
        { error: Limits.AI_API_PER_USER.message, retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      );
    }
    console.log("[predictions] rate limit passed");

    console.log("[predictions] calling engine");
    const data = await getPredictionSummary(auth.uid);
    console.log("[predictions] engine completed");
    return NextResponse.json(data);
  } catch (error) {
    console.error("================================");
    console.error("[predictions] ROUTE ERROR");
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
