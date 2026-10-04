import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { withGeminiKeyRotation } from '@/ai/key-resolver';
import { createGenkitForKey } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'genkit';

export const runtime = 'nodejs';

// AI score suggestion for one competency unit (Commander only).
// Gemini is framed as an assistant whose suggestion the assessor must verify;
// the UI renders the proposal greyed-out until the assessor accepts or edits it.
// Defensive parse with a safe manual-scoring fallback on any failure.

const FALLBACK = {
  proposedScore: 2,
  rationale: 'AI suggestion unavailable — score manually.',
} as const;

const SUGGEST_TIMEOUT_MS = 30000;

const SuggestOutputSchema = z.object({
  proposedScore: z.number().int().min(1).max(4),
  rationale: z.string(),
});
type SuggestOutput = z.infer<typeof SuggestOutputSchema>;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error('SUGGEST_TIMEOUT')), ms);
    promise.then(
      (v) => {
        clearTimeout(tid);
        resolve(v);
      },
      (e) => {
        clearTimeout(tid);
        reject(e);
      },
    );
  });
}

function buildSuggestPrompt(args: {
  declarationText: string;
  unitId: string;
  unitName: string;
  performanceCriteria: string[];
}): string {
  const criteria = args.performanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n');
  return `You are an assistant to an RPL (Recognition of Prior Learning) assessor — NOT the decision maker.
Your suggestion is advisory only: the human assessor must verify and confirm every score before it counts.

Rubric (reply with exactly one integer):
1 = Not demonstrated
2 = Partially demonstrated
3 = Demonstrated with prompting
4 = Demonstrated independently

Competency unit: ${args.unitId} — ${args.unitName}
Performance criteria:
${criteria}

Worker self-declaration (unverified, may be incomplete or overstated — treat as context only):
${args.declarationText ? args.declarationText.slice(0, 4000) : '(no declaration text provided)'}

Task: propose the single most likely rubric score (1-4) for this unit as a whole, plus a one-sentence rationale referencing the declaration.
Return JSON only: {"proposedScore": <1-4>, "rationale": "<one sentence>"}.`;
}

function clampScore(v: unknown): 1 | 2 | 3 | 4 | null {
  return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 4
    ? (v as 1 | 2 | 3 | 4)
    : null;
}

function parseSuggestResponse(res: { output?: unknown; text?: string }): {
  proposedScore: 1 | 2 | 3 | 4;
  rationale: string;
} {
  const out = res.output as Partial<SuggestOutput> | undefined;
  const fromSchema = clampScore(out?.proposedScore);
  if (fromSchema && typeof out?.rationale === 'string' && out.rationale.trim()) {
    return { proposedScore: fromSchema, rationale: out.rationale.trim().slice(0, 500) };
  }
  if (res.text) {
    try {
      const cleaned = res.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      const parsed: unknown = JSON.parse(cleaned);
      if (typeof parsed === 'object' && parsed !== null) {
        const rec = parsed as Record<string, unknown>;
        const score = clampScore(rec.proposedScore);
        const rationale = typeof rec.rationale === 'string' ? rec.rationale.trim() : '';
        if (score && rationale) {
          return { proposedScore: score, rationale: rationale.slice(0, 500) };
        }
      }
    } catch {
      // fall through to fallback
    }
  }
  return { proposedScore: FALLBACK.proposedScore, rationale: FALLBACK.rationale };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'commander');
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // INLINE rate-limit config (do not touch Limits).
    const rl = await enforceRateLimit(`rpl:suggest:${auth.uid}`, {
      maxRequests: 10,
      windowMs: 60000,
      message: 'AI suggestion limit reached (10/min). Please wait.',
    });
    if (rl) return rl;

    const body = (await req.json().catch(() => null)) as {
      declarationText?: unknown;
      unitId?: unknown;
      unitName?: unknown;
      performanceCriteria?: unknown;
    } | null;
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

    const { declarationText, unitId, unitName, performanceCriteria } = body;
    if (typeof unitId !== 'string' || !unitId.trim()) {
      return NextResponse.json({ error: 'unitId is required' }, { status: 400 });
    }
    if (!Array.isArray(performanceCriteria) || performanceCriteria.length === 0) {
      return NextResponse.json({ error: 'performanceCriteria must be a non-empty array' }, { status: 400 });
    }
    if (!performanceCriteria.every((c) => typeof c === 'string' && c.trim())) {
      return NextResponse.json({ error: 'performanceCriteria must be an array of strings' }, { status: 400 });
    }

    const prompt = buildSuggestPrompt({
      declarationText: typeof declarationText === 'string' ? declarationText : '',
      unitId: unitId.trim(),
      unitName: typeof unitName === 'string' && unitName.trim() ? unitName.trim() : unitId.trim(),
      performanceCriteria: (performanceCriteria as string[]).map((c) => c.trim()),
    });

    try {
      const result = await withGeminiKeyRotation(async (apiKey) => {
        const scopedAi = createGenkitForKey(apiKey);
        const res = (await withTimeout(
          scopedAi.generate({
            model: googleAI.model('gemini-3.6-flash'),
            prompt,
            output: { schema: SuggestOutputSchema },
          }),
          SUGGEST_TIMEOUT_MS,
        )) as unknown as { output?: SuggestOutput; text?: string };
        return parseSuggestResponse(res);
      });
      return NextResponse.json(result);
    } catch (err) {
      console.warn('[RPL Suggest] Gemini failed, returning fallback:', err);
      return NextResponse.json({
        proposedScore: FALLBACK.proposedScore,
        rationale: FALLBACK.rationale,
      });
    }
  } catch (err) {
    console.error('[RPL Suggest] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
