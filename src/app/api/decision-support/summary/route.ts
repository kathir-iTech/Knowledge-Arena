import { NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

// PHASE 69: SHELVED — this AI engine is not wired to any reachable UI flow.
// The implementation lives on in src/ai/engines/decision-support-engine.ts
// (source intentionally kept for future wiring). Endpoint intentionally
// responds "not available" instead of running the Genkit engine.
//
// Auth is still enforced first so unauthenticated probing gets the same 401
// as any other protected route; authenticated callers get an explicit
// not-available signal instead of a silent success.
export async function GET(req: Request) {
  const auth = await verifyFirebaseTokenWithRole(req, 'commander');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
    const _rl = enforceRateLimit(`read:${auth.uid}`, Limits.READ_PER_USER);
    if (_rl) return _rl;

  return NextResponse.json(
    { error: 'Not available', message: 'The Decision Support engine is shelved and not available for use.' },
    { status: 410 }
  );
}