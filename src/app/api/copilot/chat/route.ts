
import { NextResponse } from 'next/server';
import { handleCopilotChat } from '@/ai/engines/copilot-engine';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { rateLimiter, Limits, buildRateLimitHeaders } from '@/lib/rate-limiter';

export async function POST(req: Request) {
  try {
    console.log("[copilot] request started");
    const auth = await verifyFirebaseTokenWithRole(req, 'teacher');
    if (!auth) {
      console.log("[copilot] auth failed");
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log("[copilot] auth verified", auth.uid);

    const rl = rateLimiter.check(`ai:copilot:${auth.uid}`, Limits.AI_API_PER_USER);
    if (!rl.allowed) {
      console.log("[copilot] rate limited");
      return NextResponse.json(
        { error: Limits.AI_API_PER_USER.message, retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        { status: 429, headers: buildRateLimitHeaders(rl) }
      );
    }
    console.log("[copilot] rate limit passed");

    console.log("[copilot] parsing body");
    const { message } = await req.json();
    if (!message) {
      console.log("[copilot] message missing");
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }
    console.log("[copilot] message parsed");

    console.log("[copilot] calling engine");
    const response = await handleCopilotChat(message);
    console.log("[copilot] engine completed");
    return NextResponse.json({ response });
  } catch (error) {
    console.error("================================");
    console.error("[copilot] ROUTE ERROR");
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
