import { NextRequest, NextResponse } from 'next/server';
import { copilotAssist } from '@/ai/flows/copilot-flow';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import { verifyFirebaseToken } from '@/lib/verify-auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.userMessage !== 'string' || !body.userMessage.trim()) {
      return NextResponse.json({ error: 'userMessage is required' }, { status: 400 });
    }
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (body.idToken as string) || '';
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify token to get UID for per-user rate limiting (not per-IP, which
    // throttles an entire college NAT behind a single shared IP).
    const auth = await verifyFirebaseToken(token);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const uidRl = await enforceRateLimit(`ai:copilot:${auth.uid}`, Limits.AI_COPILOT_PER_USER);
    if (uidRl) return uidRl;

    const result = await copilotAssist({
      userMessage: body.userMessage,
      questionContext: typeof body.questionContext === 'string' ? body.questionContext : undefined,
      titleContext: typeof body.titleContext === 'string' ? body.titleContext : undefined,
      idToken: token,
    });

    if ((result as { error?: string }).error) {
      const err = (result as { error?: string }).error!;
      if (err === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      if (err === 'COPILOT_RATE_LIMITED') return NextResponse.json({ error: 'Rate limited. Try again in a minute.', retryAfter: 60 }, { status: 429, headers: { 'Retry-After': '60', 'X-RateLimit-Remaining': '0' } });
      if (err === 'COPILOT_TIMEOUT') return NextResponse.json({ error: 'Copilot timed out. Please try again.' }, { status: 504 });
      if (err.includes('GEMINI_QUOTA_EXCEEDED') || err.includes('ALL_GEMINI_KEYS_EXHAUSTED') || err.includes('quota_exceeded')) {
        const m = err.match(/retry after ~?(\d+)s/i);
        const retryAfter = m ? parseInt(m[1], 10) : 60;
        return NextResponse.json({ error: 'AI quota exhausted. Please wait a few minutes before retrying.', retryAfter }, { status: 429, headers: { 'Retry-After': String(retryAfter), 'X-RateLimit-Remaining': '0' } });
      }
      if (err.includes('TIMEOUT') || err.includes('timed out')) return NextResponse.json({ error: 'Copilot timed out. Please try again.' }, { status: 504 });
      return NextResponse.json({ error: err }, { status: 500 });
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[Copilot API] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}