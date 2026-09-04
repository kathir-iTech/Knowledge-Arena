import { NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

// PHASE 69: SHELVED — the AI prediction-summary feature is not wired to any
// reachable UI flow. The Genkit implementation lives on in
// src/ai/engines/prediction-engine.ts (getPredictionSummary / getRecommendationPrompt,
// source intentionally kept for future wiring). NOTE: the same file's
// getQuizRecommendations is LIVE via /api/gladiator/recommendations — that path
// is untouched. Only this summary endpoint is neutralized.
//
// Auth is still enforced first so unauthenticated probing gets the same 401
// as any other protected route; authenticated callers get an explicit
// not-available signal instead of a silent success.
export async function GET(req: Request) {
  const auth = await verifyFirebaseTokenWithRole(req, 'commander');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
    const _rl = await enforceRateLimit(`read:${auth.uid}`, Limits.READ_PER_USER);
    if (_rl) return _rl;

  return NextResponse.json(
    { error: 'Not available', message: 'The Prediction summary engine is shelved and not available for use.' },
    { status: 410 }
  );
}