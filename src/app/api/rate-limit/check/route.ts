import { NextResponse } from 'next/server';
import { rateLimiter, Limits, getClientIp, buildRateLimitHeaders } from '@/lib/rate-limiter';

const VALID_TYPES = ['login', 'signup'] as const;
type CheckType = (typeof VALID_TYPES)[number];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, identifier } = body as { type: string; identifier?: string };

    if (!VALID_TYPES.includes(type as CheckType)) {
      return NextResponse.json({ error: 'Invalid rate limit type.' }, { status: 400 });
    }

    const ip = getClientIp(req);

    if (type === 'login') {
      const ipResult = rateLimiter.check(`login:ip:${ip}`, Limits.LOGIN_PER_IP);
      const emailResult = identifier
        ? rateLimiter.check(`login:email:${identifier.toLowerCase()}`, Limits.LOGIN_PER_EMAIL)
        : { allowed: true, remaining: Infinity, resetAt: 0 };

      if (!ipResult.allowed) {
        return NextResponse.json(
          { error: Limits.LOGIN_PER_IP.message, retryAfter: Math.ceil((ipResult.resetAt - Date.now()) / 1000) },
          { status: 429, headers: buildRateLimitHeaders(ipResult) }
        );
      }

      if (!emailResult.allowed) {
        return NextResponse.json(
          { error: Limits.LOGIN_PER_EMAIL.message, retryAfter: Math.ceil((emailResult.resetAt - Date.now()) / 1000) },
          { status: 429, headers: buildRateLimitHeaders(emailResult) }
        );
      }
    }

    if (type === 'signup') {
      const ipResult = rateLimiter.check(`signup:ip:${ip}`, Limits.SIGNUP_PER_IP);
      if (!ipResult.allowed) {
        return NextResponse.json(
          { error: Limits.SIGNUP_PER_IP.message, retryAfter: Math.ceil((ipResult.resetAt - Date.now()) / 1000) },
          { status: 429, headers: buildRateLimitHeaders(ipResult) }
        );
      }
    }

    return NextResponse.json({ allowed: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
}
