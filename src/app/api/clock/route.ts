import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithAnyRole } from '@/lib/verify-auth';

export const runtime = 'nodejs';

// Returns the server's wall clock so the browser can compute a client/server
// offset. Battle timers compare the client's Date.now() against server-written
// timestamps (question_start_at etc.); a skewed client clock otherwise causes
// premature timer expiry and locks gladiators out of submitting for questions
// the server still accepts.
export async function GET(req: NextRequest) {
  const auth = await verifyFirebaseTokenWithAnyRole(req, ['executive', 'commander', 'gladiator']);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ serverTime: Date.now() });
}