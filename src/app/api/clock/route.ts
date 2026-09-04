import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit, Limits, getClientIp } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

// Returns the server's wall clock so the browser can compute a client/server
// offset. Battle timers compare the client's Date.now() against server-written
// timestamps (question_start_at etc.); a skewed client clock otherwise causes
// premature timer expiry and locks gladiators out of submitting for questions
// the server still accepts.
// No auth required: server time is non-sensitive and needed for gameplay sync.
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await enforceRateLimit(`clock:${ip}`, Limits.READ_PER_USER);
  if (rl) return rl;
  return NextResponse.json({ serverTime: Date.now() });
}