'use server';

/**
 * @fileOverview RPL pack-matching flow: maps a worker's free-text experience
 * declaration to the 1-3 best NSQF qualification packs.
 * Engine: Google Gemini (Genkit plugin) via withGeminiKeyRotation, mirroring
 * the exact call pattern of src/app/api/rpl/assess/suggest/route.ts
 * (withGeminiKeyRotation -> createGenkitForKey -> scopedAi.generate with
 * googleAI.model('gemini-3.6-flash') + timeout).
 *
 * Defensive JSON parse (strip fences, try/catch) with a keyword fallback on
 * ANY failure: findBestMatchingPacks({ keywords: [trade], trade,
 * declarationText }) mapped to RPLPackMatch[] with matchReason
 * 'Keyword match (AI unavailable)' and empty assessmentQuestions.
 */

import { ai, createGenkitForKey } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'genkit';
import { withGeminiKeyRotation } from '@/ai/key-resolver';
import { findBestMatchingPacks } from '@/lib/rpl/nsqf-packs';
import type { RPLPackMatch } from '@/lib/rpl/types';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const RplMatchingInputSchema = z.object({
  declarationText: z.string().describe('Worker free-text experience declaration.'),
  trade: z.string().describe('Worker trade / occupation.'),
  yearsExperience: z.number().describe('Years of experience (0-60).'),
  packTitles: z.array(z.string()).describe('Candidate NSQF qualification pack titles.'),
});
export type RplMatchingInput = z.infer<typeof RplMatchingInputSchema>;

const RplPackMatchSchema = z.object({
  packTitle: z.string(),
  matchReason: z.string(),
  suggestedUnits: z.array(z.string()),
  assessmentQuestions: z.array(z.string()),
});

const RplMatchingOutputSchema = z.object({
  matches: z.array(RplPackMatchSchema),
  aiUsed: z.boolean(),
});
export type RplMatchingOutput = z.infer<typeof RplMatchingOutputSchema>;

/** Structured-output schema for the Gemini generate call. */
const MatchJsonSchema = z.object({
  matches: z.array(RplPackMatchSchema),
});

const MATCH_TIMEOUT_MS = 30000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error('MATCH_TIMEOUT')), ms);
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

function buildMatchingPrompt(input: {
  declarationText: string;
  trade: string;
  yearsExperience: number;
  packTitles: string[];
}): string {
  const declaration = input.declarationText
    ? input.declarationText.slice(0, 4000)
    : '(no declaration text provided)';
  const packs =
    input.packTitles.length > 0 ? input.packTitles.join(', ') : '(no packs provided)';
  return `You are an NSQF qualification assessor. A worker has described their experience as follows: ${declaration}. They work in ${input.trade} with ${input.yearsExperience} years of experience. From the following NSQF qualification packs: ${packs}. Identify the 1-3 best matching packs and for each: (a) explain why this pack matches, (b) list the specific competency units the worker's description suggests they may have, (c) suggest 3 targeted assessment questions specific to what they described. Return ONLY valid JSON matching this schema: {matches: [{packTitle, matchReason, suggestedUnits, assessmentQuestions}]}`;
}

/** Keyword fallback: never throws, never returns a blank list when packs score. */
function fallbackMatches(trade: string, declarationText: string): RPLPackMatch[] {
  const keywordResults = findBestMatchingPacks({
    keywords: [trade],
    trade,
    declarationText,
  });
  return keywordResults.map((r) => ({
    packTitle: r.pack.title,
    matchReason: 'Keyword match (AI unavailable)',
    suggestedUnits: r.matchedUnits,
    assessmentQuestions: [],
  }));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim());
}

/**
 * Defensive parse: prefer the schema-validated output, then try the raw text
 * with fence-stripping. Returns null on ANY failure so the caller falls back.
 */
function parseMatchingResponse(res: { output?: unknown; text?: string }): RPLPackMatch[] | null {
  const out = res.output as { matches?: unknown } | undefined;
  if (out && Array.isArray(out.matches)) {
    const cleaned = sanitizeMatches(out.matches);
    if (cleaned.length > 0) return cleaned.slice(0, 3);
  }
  if (res.text) {
    try {
      const stripped = res.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      const parsed: unknown = JSON.parse(stripped);
      if (typeof parsed === 'object' && parsed !== null) {
        const rec = parsed as Record<string, unknown>;
        const candidates = Array.isArray(rec.matches) ? rec.matches : Array.isArray(parsed) ? parsed : [];
        const cleaned = sanitizeMatches(candidates);
        if (cleaned.length > 0) return cleaned.slice(0, 3);
      }
    } catch {
      return null;
    }
  }
  return null;
}

function sanitizeMatches(candidates: unknown): RPLPackMatch[] {
  if (!Array.isArray(candidates)) return [];
  const out: RPLPackMatch[] = [];
  for (const c of candidates) {
    if (typeof c !== 'object' || c === null) continue;
    const rec = c as Record<string, unknown>;
    const packTitle = typeof rec.packTitle === 'string' ? rec.packTitle.trim() : '';
    if (!packTitle) continue;
    out.push({
      packTitle,
      matchReason:
        typeof rec.matchReason === 'string' && rec.matchReason.trim()
          ? rec.matchReason.trim().slice(0, 1000)
          : 'Matched by AI assessor.',
      suggestedUnits: asStringArray(rec.suggestedUnits),
      assessmentQuestions: asStringArray(rec.assessmentQuestions),
    });
  }
  return out;
}

async function runRplMatching(input: RplMatchingInput): Promise<RplMatchingOutput> {
  const declarationText = typeof input.declarationText === 'string' ? input.declarationText : '';
  const trade = typeof input.trade === 'string' ? input.trade : '';
  const yearsExperience = Number.isFinite(input.yearsExperience) ? input.yearsExperience : 0;
  const packTitles = Array.isArray(input.packTitles) ? input.packTitles : [];

  try {
    const prompt = buildMatchingPrompt({ declarationText, trade, yearsExperience, packTitles });
    const matches = await withGeminiKeyRotation(async (apiKey) => {
      const scopedAi = createGenkitForKey(apiKey);
      const res = (await withTimeout(
        scopedAi.generate({
          model: googleAI.model('gemini-3.6-flash'),
          prompt,
          output: { schema: MatchJsonSchema },
        }),
        MATCH_TIMEOUT_MS,
      )) as unknown as { output?: unknown; text?: string };
      return parseMatchingResponse(res);
    });
    if (!matches || matches.length === 0) {
      return { matches: fallbackMatches(trade, declarationText), aiUsed: false };
    }
    return { matches, aiUsed: true };
  } catch (err) {
    console.warn('[RPL Matching] Gemini failed, using keyword fallback:', err);
    return { matches: fallbackMatches(trade, declarationText), aiUsed: false };
  }
}

export const rplMatchingFlow = ai.defineFlow(
  {
    name: 'rplMatchingFlow',
    inputSchema: RplMatchingInputSchema,
    outputSchema: RplMatchingOutputSchema,
  },
  async (input: RplMatchingInput): Promise<RplMatchingOutput> => {
    return runRplMatching(input);
  },
);

export async function matchRplPacks(input: RplMatchingInput): Promise<RplMatchingOutput> {
  const out = await rplMatchingFlow(input);
  return out as RplMatchingOutput;
}
