import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verify-auth';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { NSQF_PACKS } from '@/lib/rpl/nsqf-packs';
import { matchRplPacks } from '@/ai/flows/rpl-matching-flow';

export const runtime = 'nodejs';

// AI-assisted pack matching for a worker's free-text declaration.
// Signed-in users only (any role — worker-facing). The flow itself falls back
// to keyword matching when Gemini is unavailable (including when ALL Gemini
// keys are quota-exhausted), so this route always returns a usable
// { matches, aiUsed, source } payload on success. `source` is 'ai' when Gemini
// ranked the packs and 'local-fallback' when the deterministic keyword matcher
// was used; the anti-fabrication contract is that 'local-fallback' is surfaced
// to the UI, never presented as an AI result.

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseToken(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // INLINE rate-limit config (do not touch Limits).
    const rl = await enforceRateLimit(`rpl:match:${auth.uid}`, {
      maxRequests: 3,
      windowMs: 60000,
      message: 'Match limit reached (3/min). Please wait.',
    });
    if (rl) return rl;

    const body = (await req.json().catch(() => null)) as {
      declarationText?: unknown;
      trade?: unknown;
      yearsExperience?: unknown;
    } | null;
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

    const { declarationText, trade, yearsExperience } = body;
    if (typeof trade !== 'string' || !trade.trim()) {
      return NextResponse.json({ error: 'trade is required' }, { status: 400 });
    }
    const years =
      typeof yearsExperience === 'number'
        ? yearsExperience
        : typeof yearsExperience === 'string' && yearsExperience.trim() !== ''
          ? Number(yearsExperience)
          : NaN;
    if (!Number.isFinite(years) || years < 0 || years > 60) {
      return NextResponse.json(
        { error: 'yearsExperience must be a number between 0 and 60' },
        { status: 400 },
      );
    }

    const packTitles = NSQF_PACKS.map((p) => p.title);
    const result = await matchRplPacks({
      declarationText: typeof declarationText === 'string' ? declarationText : '',
      trade: trade.trim(),
      yearsExperience: years,
      packTitles,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[RPL Match] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
