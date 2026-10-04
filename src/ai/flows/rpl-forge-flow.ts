'use server';
/**
 * @fileOverview RPL Forge flow: turns already-extracted NCVET qualification
 * pack text into a structured RPLAssessmentPack.
 * Engine: Google Gemini (Genkit plugin) — free tier, with multi-model fallback.
 *
 * Mirrors the import structure and manual key-rotation pattern of
 * src/ai/flows/generate-quiz-pdf-flow.ts (getGeminiApiKey ->
 * createGenkitForKey -> tmpAi.generate with googleAI.model; model
 * 'gemini-3.6-flash' with fallback chain to 'gemini-3.5-flash').
 *
 * Cache: rpl_forge_cache/{sha256 of pdfExtractedText} via the Admin SDK with
 * a 30-day expiresAt, mirroring the forge_cache reference pattern.
 *
 * NOTE: this flow accepts already-extracted text only. It never performs OCR:
 * the main Forge pipeline REJECTS scanned PDFs (PDF_IMAGE_ONLY).
 */

import { ai, createGenkitForKey } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { NSQF_PACKS } from '@/lib/rpl/nsqf-packs';
import { RPL_FORGE_CACHE } from '@/lib/rpl/rpl-collections';
import { FORGE_CACHE_TTL_MS } from '@/lib/constants';
import { contentHashOf } from '@/services/forge-job.service';
import {
  getGeminiApiKey,
  getConfiguredKeys,
  isQuotaError as isResolverQuotaError,
  isAuthError as isResolverAuthError,
  parseRetryDelayMs,
  markKeyCooldown,
} from '@/ai/key-resolver';
import type { RPLAssessmentPack } from '@/lib/rpl/types';
import type { NSQFCompetencyUnit } from '@/lib/rpl/nsqf-packs';

// ---------------------------------------------------------------------------
// Schemas + local extension types
// (RPLAssessmentPack / AssessmentPackItem / AssessmentMethod in
// src/lib/rpl/types.ts are COMPLETE and never edited; the cached/parseError
// flags live on this LOCAL extension interface only.)
// ---------------------------------------------------------------------------

const RplForgeInputSchema = z.object({
  pdfExtractedText: z.string().describe('Already-extracted qualification pack text (no OCR).'),
  packId: z.string().describe('Requested qualification pack id (e.g. ELE/Q1301).'),
  trade: z.string().describe('Trade the pack belongs to (e.g. Electrician).'),
});
export type RplForgeInput = z.infer<typeof RplForgeInputSchema>;

const ForgeUnitSchema = z.object({
  id: z.string(),
  name: z.string(),
  performanceCriteria: z.array(z.string()),
  knowledgeCriteria: z.array(z.string()),
});

const ForgeItemSchema = z.object({
  id: z.string(),
  unitId: z.string(),
  taskDescription: z.string(),
  mapsToCriterion: z.string(),
  difficulty: z.number().int().min(1).max(4),
  assessmentMethod: z.enum(['observation', 'product evidence', 'oral questioning']),
});

const RplForgePackSchema = z.object({
  packId: z.string(),
  trade: z.string(),
  units: z.array(ForgeUnitSchema),
  items: z.array(ForgeItemSchema),
  generatedAt: z.number(),
});

const RplForgeOutputSchema = RplForgePackSchema.extend({
  cached: z.boolean(),
  parseError: z.boolean().optional(),
  engine: z.string().optional(),
});

/** LOCAL extension: RPLAssessmentPack plus forge transport flags. */
export interface RplForgeFlowOutput extends RPLAssessmentPack {
  cached: boolean;
  parseError?: boolean;
  engine?: string;
}

// ---------------------------------------------------------------------------
// Model plumbing (mirrors generate-quiz-pdf-flow.ts callModelWithRetry)
// ---------------------------------------------------------------------------

const MAX_RETRIES_PER_MODEL = 3;
const GEMINI_TIMEOUT_MS = 35000;
// gemini-2.0-flash / gemini-1.5 models were shut down by Google on 2026-06-01.
// gemini-3.6-flash is the current workhorse; gemini-3.5-flash is the fallback.
const RPL_FORGE_MODEL_CHAIN = ['gemini-3.6-flash', 'gemini-3.5-flash'];
const PROMPT_TEXT_CAP = 40000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error(`TIMEOUT:${label} exceeded ${ms}ms`)), ms);
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

function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('403') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('API key') ||
    msg.includes('not authorized') ||
    msg.includes('UNAUTHENTICATED')
  );
}

function isTimeoutError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('TIMEOUT:');
}

function stripCodeFences(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    if (firstNewline > 0) cleaned = cleaned.slice(firstNewline + 1);
    const lastFence = cleaned.lastIndexOf('```');
    if (lastFence >= 0) cleaned = cleaned.slice(0, lastFence);
  }
  return cleaned.trim();
}

type ForgedUnits = z.infer<typeof ForgeUnitSchema>[];
type ForgedItems = z.infer<typeof ForgeItemSchema>[];

type ForgeModelResult =
  | { ok: true; units: ForgedUnits; items: ForgedItems; engine: string }
  | { ok: false; errors: string[] };

function tryParseForgeJson(raw: string): { units: ForgedUnits; items: ForgedItems } | null {
  try {
    const parsed: unknown = JSON.parse(stripCodeFences(raw));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const rec = parsed as Record<string, unknown>;
    const units = Array.isArray(rec.units) ? (rec.units as ForgedUnits) : null;
    const items = Array.isArray(rec.items) ? (rec.items as ForgedItems) : null;
    if (!units || !items) return null;
    // Loose structural check; strict field validation happens in normalize.
    if (!units.every((u) => typeof u.id === 'string' && typeof u.name === 'string')) return null;
    if (
      !items.every(
        (i) =>
          typeof i.taskDescription === 'string' &&
          typeof i.unitId === 'string' &&
          typeof i.mapsToCriterion === 'string',
      )
    ) {
      return null;
    }
    return { units, items };
  } catch {
    return null;
  }
}

function buildRplForgePrompt(text: string, packId: string, trade: string): string {
  const dataset = NSQF_PACKS.map(
    (p) =>
      `Pack ${p.id} (${p.title}, trade: ${p.trade}, NSQF level ${p.nsqfLevel}): ` +
      p.competencyUnits
        .map((u) => `${u.id} — ${u.name} | performance: ${u.performanceCriteria.join('; ')}`)
        .join(' || '),
  ).join('\n');
  return `You are forging a Recognition of Prior Learning (RPL) assessment pack from an official NCVET qualification pack.
Requested packId: ${packId}. Trade: ${trade}.

Do ALL of the following:
(a) Extract the competency units described in the qualification pack text below.
(b) Map them onto the NSQF_PACKS data structure. Where an extracted unit matches a real pack/unit (by id or name), use the REAL pack/unit id and name from this dataset:
${dataset}
If nothing matches, keep the extracted unit with a stable id derived from the requested packId.
(c) Generate 3-5 PRACTICAL task items per unit (hands-on demonstrations, NOT multiple-choice questions). Each item MUST have:
- "id": stable unique id like "<UNITID>-task-<n>"
- "unitId": the unit it assesses (must equal one of the returned unit ids)
- "taskDescription": the practical task the worker must demonstrate
- "mapsToCriterion": the performance criterion this task evidences
- "difficulty": integer 1-4 (1=Not demonstrated .. 4=Independently)
- "assessmentMethod": exactly one of "observation" | "product evidence" | "oral questioning"

Output MUST be a single JSON object (no prose, no markdown fences):
{
  "units": [{ "id": "...", "name": "...", "performanceCriteria": ["..."], "knowledgeCriteria": ["..."] }],
  "items": [{ "id": "...", "unitId": "...", "taskDescription": "...", "mapsToCriterion": "...", "difficulty": 2, "assessmentMethod": "observation" }]
}

Qualification pack text:
${text}`;
}

/** Normalize raw model output into schema-valid units/items (never throws). */
function normalizeForgeOutput(
  raw: { units: ForgedUnits; items: ForgedItems },
  fallbackPackId: string,
  fallbackTrade: string,
): { units: NSQFCompetencyUnit[]; items: RPLAssessmentPack['items'] } {
  const units: NSQFCompetencyUnit[] = (Array.isArray(raw.units) ? raw.units : [])
    .filter((u) => u && typeof u.id === 'string' && typeof u.name === 'string')
    .map((u) => ({
      id: u.id,
      name: u.name,
      performanceCriteria: Array.isArray(u.performanceCriteria)
        ? u.performanceCriteria.filter((c): c is string => typeof c === 'string')
        : [],
      knowledgeCriteria: Array.isArray(u.knowledgeCriteria)
        ? u.knowledgeCriteria.filter((c): c is string => typeof c === 'string')
        : [],
    }));
  const unitIds = new Set(units.map((u) => u.id));
  const allowedMethods = ['observation', 'product evidence', 'oral questioning'] as const;
  const items: RPLAssessmentPack['items'] = (Array.isArray(raw.items) ? raw.items : [])
    .filter(
      (i) =>
        i &&
        typeof i.taskDescription === 'string' &&
        i.taskDescription.trim().length > 0 &&
        typeof i.unitId === 'string' &&
        typeof i.mapsToCriterion === 'string',
    )
    .map((i, idx) => {
      const unitId = unitIds.has(i.unitId) ? i.unitId : (units[0]?.id ?? fallbackPackId);
      const difficulty =
        i.difficulty === 1 || i.difficulty === 2 || i.difficulty === 3 || i.difficulty === 4
          ? i.difficulty
          : 2;
      const methodRaw = String(i.assessmentMethod ?? '').toLowerCase();
      const assessmentMethod = (
        methodRaw === 'observation' ||
        methodRaw === 'product evidence' ||
        methodRaw === 'product_evidence' ||
        methodRaw === 'oral questioning' ||
        methodRaw === 'oral_questioning'
          ? methodRaw.replace(/_/g, ' ')
          : 'observation'
      ) as (typeof allowedMethods)[number];
      return {
        id:
          typeof i.id === 'string' && i.id.trim().length > 0
            ? i.id
            : `${unitId}-task-${idx + 1}`,
        unitId,
        taskDescription: i.taskDescription,
        mapsToCriterion: i.mapsToCriterion,
        difficulty,
        assessmentMethod,
      };
    });
  void fallbackTrade;
  return { units, items };
}

async function callModelWithRetry(promptText: string, modelName: string): Promise<ForgeModelResult> {
  const errors: string[] = [];
  const keyHistoryForModel = new Set<string>();

  for (let attempt = 1; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
    let apiKeyUsed: string | null = null;
    try {
      // Resolve next available key with quota-aware rotation. Single-key mode returns same key.
      apiKeyUsed = await getGeminiApiKey();
      keyHistoryForModel.add(apiKeyUsed);
      const tmpAi = createGenkitForKey(apiKeyUsed);
      const _response = await withTimeout(
        tmpAi.generate({
          model: googleAI.model(modelName),
          prompt: promptText,
          output: {
            schema: z.object({
              units: z.array(ForgeUnitSchema),
              items: z.array(ForgeItemSchema),
            }),
          },
        }),
        GEMINI_TIMEOUT_MS,
        `Gemini:${modelName}`,
      );

      const genResponse = _response as { output?: Record<string, unknown>; text?: string };
      const raw = genResponse.text;
      if (raw) {
        const parsed = tryParseForgeJson(raw);
        if (parsed) {
          const normalized = normalizeForgeOutput(parsed, '', '');
          return {
            ok: true,
            units: normalized.units as ForgedUnits,
            items: normalized.items as unknown as ForgedItems,
            engine: modelName,
          };
        }
      }

      const output = genResponse.output as
        | { units: ForgedUnits; items: ForgedItems }
        | undefined;
      if (output?.units && output?.items) {
        const normalized = normalizeForgeOutput(output, '', '');
        return {
          ok: true,
          units: normalized.units as ForgedUnits,
          items: normalized.items as unknown as ForgedItems,
          engine: modelName,
        };
      }

      throw new Error(`PARSE_FAILED_${modelName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${modelName} attempt ${attempt}: ${msg}`);
      console.error(`[RplForge] Gemini call failed (${modelName}, attempt ${attempt}/${MAX_RETRIES_PER_MODEL})`, msg);

      if (isAuthError(err) || isResolverAuthError(err)) {
        if (apiKeyUsed) markKeyCooldown(apiKeyUsed, 24 * 60 * 60 * 1000);
        const configured = getConfiguredKeys().length;
        if (configured > 1 && keyHistoryForModel.size < configured) continue;
        break;
      }

      if (isResolverQuotaError(err)) {
        const delayMs = parseRetryDelayMs(err);
        if (apiKeyUsed) markKeyCooldown(apiKeyUsed, delayMs);
        const configured = getConfiguredKeys().length;
        if (configured > 1 && keyHistoryForModel.size >= configured) {
          return { ok: false, errors };
        }
        if (attempt === MAX_RETRIES_PER_MODEL) return { ok: false, errors };
        const keys = getConfiguredKeys();
        if (keys.length > 1 && keyHistoryForModel.size < keys.length) continue;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }

      if (isTimeoutError(err)) {
        if (attempt === MAX_RETRIES_PER_MODEL) return { ok: false, errors };
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }

      if (attempt === MAX_RETRIES_PER_MODEL) return { ok: false, errors };
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  return { ok: false, errors };
}

async function callGeminiWithFallback(promptText: string): Promise<ForgeModelResult> {
  const errors: string[] = [];
  for (const modelName of RPL_FORGE_MODEL_CHAIN) {
    const result = await callModelWithRetry(promptText, modelName);
    if (result.ok) return result;
    errors.push(...result.errors);
  }
  return { ok: false, errors };
}

/** Parse-failure fallback: the matching NSQF pack's real units, items: []. */
function fallbackPack(packId: string, trade: string, engine?: string): RplForgeFlowOutput {
  const byId = NSQF_PACKS.find((p) => p.id === packId);
  const tradeLower = trade.trim().toLowerCase();
  const byTrade = tradeLower
    ? NSQF_PACKS.find(
        (p) =>
          p.trade.toLowerCase() === tradeLower ||
          p.trade.toLowerCase().includes(tradeLower) ||
          tradeLower.includes(p.trade.toLowerCase()),
      )
    : undefined;
  const pack = byId ?? byTrade ?? NSQF_PACKS[0];
  return {
    packId: pack.id,
    trade: pack.trade,
    units: pack.competencyUnits,
    items: [],
    generatedAt: Date.now(),
    cached: false,
    parseError: true,
    engine,
  };
}

async function runRplForge(input: RplForgeInput): Promise<RplForgeFlowOutput> {
  const text = (input.pdfExtractedText ?? '').trim();
  if (!text) throw new Error('RPL_FORGE_EMPTY_TEXT');
  const packId = (input.packId ?? '').trim();
  const trade = (input.trade ?? '').trim();
  if (!packId) throw new Error('RPL_FORGE_PACK_ID_REQUIRED');
  if (!trade) throw new Error('RPL_FORGE_TRADE_REQUIRED');

  // Content-addressable cache keyed on the extracted text (mirrors the
  // forge_cache reference pattern: { pack, engine, createdAt, expiresAt }).
  const hash = contentHashOf(text);
  const { getAdminDb } = await import('@/lib/firebase-admin');
  const db = getAdminDb();
  const cacheRef = db.collection(RPL_FORGE_CACHE).doc(hash);
  try {
    const snap = await cacheRef.get();
    if (snap.exists) {
      const data = snap.data() as
        | { pack?: RPLAssessmentPack; expiresAt?: number; engine?: string }
        | undefined;
      if (
        data?.pack &&
        typeof data.expiresAt === 'number' &&
        data.expiresAt >= Date.now() &&
        Array.isArray(data.pack.units)
      ) {
        return { ...data.pack, cached: true, engine: data.engine };
      }
    }
  } catch (err) {
    console.warn('[RplForge] cache read failed (continuing without cache):', err);
  }

  const promptText = buildRplForgePrompt(text.slice(0, PROMPT_TEXT_CAP), packId, trade);
  const result = await callGeminiWithFallback(promptText);

  if (!result.ok) {
    console.error('[RplForge] All models failed, using NSQF fallback:', result.errors.join(' || '));
    return fallbackPack(packId, trade, RPL_FORGE_MODEL_CHAIN.join(','));
  }

  const normalized = normalizeForgeOutput({ units: result.units, items: result.items }, packId, trade);
  if (normalized.units.length === 0) {
    console.error('[RplForge] Model returned no usable units, using NSQF fallback.');
    return fallbackPack(packId, trade, result.engine);
  }

  const pack: RplForgeFlowOutput = {
    packId,
    trade,
    units: normalized.units,
    items: normalized.items,
    generatedAt: Date.now(),
    cached: false,
    engine: result.engine,
  };

  try {
    await cacheRef.set({
      pack: {
        packId: pack.packId,
        trade: pack.trade,
        units: pack.units,
        items: pack.items,
        generatedAt: pack.generatedAt,
      },
      engine: result.engine,
      createdAt: Date.now(),
      expiresAt: Date.now() + FORGE_CACHE_TTL_MS,
    });
  } catch (err) {
    console.warn('[RplForge] cache write failed:', err);
  }

  return pack;
}

export const rplForgeFlow = ai.defineFlow(
  {
    name: 'rplForgeFlow',
    inputSchema: RplForgeInputSchema,
    outputSchema: RplForgeOutputSchema,
  },
  async (input: RplForgeInput): Promise<RplForgeFlowOutput> => {
    return runRplForge(input);
  },
);

export async function forgeRplPack(input: RplForgeInput): Promise<RplForgeFlowOutput> {
  // The Genkit flow's zod-inferred output widens difficulty to number; the
  // runtime values are schema-validated 1-4 literals (see normalizeForgeOutput).
  const out = await rplForgeFlow(input);
  return out as RplForgeFlowOutput;
}
