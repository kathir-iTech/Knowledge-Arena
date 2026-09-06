'use server';
/**
 * @fileOverview AI flow for generating multiple-choice questions from PDF, DOCX, TXT, MD, and images.
 * Engine: Google Gemini (Genkit Plugin) — free tier, with multi-model fallback.
 */

import { ai, createGenkitForKey } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import * as zlib from 'zlib';

import type { PDFDocumentLoadingTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { rateLimiter } from '@/lib/rate-limiter';
import { COLLECTIONS } from '@/lib/constants';
import {
  AI_JOB_DONE,
  AI_JOB_FAILED,
  AI_JOB_CANCELLED,
  FORGE_TICK_QA,
  FORGE_TEXT_CHUNK,
  FORGE_MAX_CONSECUTIVE_FAILURES,
  FORGE_QUOTA_BACKOFF_MS,
  FORGE_TIMEOUT_BACKOFF_MS,
  FORGE_GENERIC_BACKOFF_MS,
  FORGE_MAX_TICKS,
} from '@/lib/constants';
import { aiLogService } from '@/services/ai-log.service';
import {
  forgeJobService,
  contentHashOf,
  safeTokenEqual,
  type ForgeJobDoc,
  type PayloadParts,
} from '@/services/forge-job.service';
import {
  getGeminiApiKey,
  isQuotaError as isResolverQuotaError,
  isAuthError as isResolverAuthError,
  parseRetryDelayMs,
  markKeyCooldown,
  getConfiguredKeys,
} from '@/ai/key-resolver';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const EXTRACTION_TIMEOUT_MS = 30000;
const GEMINI_TIMEOUT_MS = 35000;

const QuizQuestionOutputSchema = z.object({
  text: z.string().describe('The question text.'),
  options: z.array(z.string()).describe('Exactly 4 options.'),
  correctAnswerIndex: z.number().describe('0-based index of the correct option.'),
  explanation: z.string().describe('Short explanation of why the answer is correct.'),
});

const GenerateQuizFromPDFInputSchema = z.object({
  pdfDataUri: z.string().describe("Documents as data URIs (base64), multiple joined by ||PDF_SEPARATOR||."),
  difficulty: z.enum(['easy', 'moderate', 'hard']).describe('Difficulty of the questions.'),
  questionCount: z.number().min(1).max(30).describe('Number of questions to generate.'),
  idToken: z.string().describe('Firebase ID token for authentication.'),
});
export type GenerateQuizFromPDFInput = z.infer<typeof GenerateQuizFromPDFInputSchema>;

const GenerateQuizFromPDFOutputSchema = z.object({
  questions: z.array(QuizQuestionOutputSchema),
  difficulty: z.string(),
  engine: z.string().optional(),
  error: z.string().optional(),
  warnings: z.array(z.string()).optional(),
});
export type GenerateQuizFromPDFOutput = z.infer<typeof GenerateQuizFromPDFOutputSchema>;

const MAX_RETRIES_PER_MODEL = 3;

// gemini-2.0-flash / gemini-2.0-flash-lite / all gemini-1.5 models were shut down by Google on 2026-06-01.
// gemini-3.6-flash (GA 2026-07-21) is the current recommended workhorse model; gemini-3.5-flash is the prior GA.
const SHUTDOWN_MODEL_PREFIXES = ['gemini-2.0', 'gemini-1.5', 'gemini-3-flash-preview'];
const DEFAULT_MODEL_CHAIN = ['gemini-3.6-flash', 'gemini-3.5-flash'];

const modelFallbackChain = async (): Promise<string[]> => {
  try {
    const { getAdminDb } = await import('@/lib/firebase-admin');
    const snap = await getAdminDb().collection(COLLECTIONS.PLATFORM_SETTINGS).doc('global').get();
    const stored = snap.data()?.ai?.defaultModel;
    if (stored && typeof stored === 'string') {
      if (SHUTDOWN_MODEL_PREFIXES.some((p) => stored.startsWith(p))) {
        console.warn(`[Forge] platform_settings defaultModel "${stored}" was shut down by Google (2026-06-01). Using ${DEFAULT_MODEL_CHAIN.join(', ')} instead.`);
        return [...DEFAULT_MODEL_CHAIN];
      }
      return [stored, ...DEFAULT_MODEL_CHAIN];
    }
  } catch { }
  return [...DEFAULT_MODEL_CHAIN];
};

function errorToString(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) {
    const name = err.name && err.name !== 'Error' ? `${err.name}: ` : '';
    const message = err.message?.trim() || '[no message]';
    return `${name}${message}`;
  }
  try {
    const serialized = JSON.stringify(err);
    if (serialized && serialized !== '{}') return serialized;
  } catch {
    // JSON.stringify failed for a circular/obstructed object; fall back below.
  }
  return String(err);
}

function formatError(err: unknown): string {
  const parts = [errorToString(err)];
  const status = (err as any).status;
  if (status) parts.unshift(`STATUS: ${status}`);
  const stack = (err as any).stack;
  if (stack) parts.push(`STACK: ${stack}`);
  const cause = (err as any).cause;
  if (cause) {
    parts.push(`CAUSE: ${errorToString(cause)}`);
    const causeStack = (cause as any).stack;
    if (causeStack) parts.push(`CAUSE_STACK: ${causeStack}`);
  }
  const raw = (err as any).rawResponse ?? (err as any).response ?? (err as any).details;
  if (raw) parts.push(`RAW_RESPONSE: ${typeof raw === 'string' ? raw.slice(0, 2000) : JSON.stringify(raw).slice(0, 2000)}`);
  return parts.join('\n');
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  // Same pattern as src/contexts/AuthContext.tsx — clears timer on settle, avoids leak vs bare Promise.race
  return new Promise<T>((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error(`TIMEOUT:${label} exceeded ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(tid); resolve(v); },
      (e) => { clearTimeout(tid); reject(e); }
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

function isRateLimitError(err: unknown): boolean {
  // Delegate to central resolver's robust detection (covers status, details, message), but keep local fallback for raw string checks.
  if (isResolverQuotaError(err)) return true;
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes('500') ||
    lower.includes('503') ||
    lower.includes('temporarily')
  );
}

function isTimeoutError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // Must use includes, not startsWith, because errors are prefixed like "gemini-3.6-flash attempt 1: TIMEOUT:..."
  return msg.includes('TIMEOUT:');
}

function getRetryDelaySeconds(err: unknown): number | null {
  const ms = parseRetryDelayMs(err);
  return ms !== null ? Math.ceil(ms / 1000) : null;
}

type QuizQuestions = z.infer<typeof QuizQuestionOutputSchema>[];

type GeminiResult =
  | { ok: true; output: { questions: QuizQuestions }; engine: string }
  | { ok: false; reason: 'quota_exceeded'; errors: string[] }
  | { ok: false; reason: 'timeout'; errors: string[] }
  | { ok: false; reason: 'all_models_failed'; errors: string[] };

function repairJson(raw: string): string {
  let cleaned = raw.trim();

  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    if (firstNewline > 0) {
      cleaned = cleaned.slice(firstNewline + 1);
    }
    const lastFence = cleaned.lastIndexOf('```');
    if (lastFence >= 0) {
      cleaned = cleaned.slice(0, lastFence);
    }
  }

  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    let repaired = cleaned;
    repaired = repaired.replace(/'/g, '"');
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
    repaired = repaired.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
    try {
      JSON.parse(repaired);
      return repaired;
    } catch {
      const objectMatch = repaired.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          JSON.parse(objectMatch[0]);
          return objectMatch[0];
        } catch {
          let cleanedAgain = objectMatch[0]
            .replace(/[\u0000-\u001F]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          try {
            JSON.parse(cleanedAgain);
            return cleanedAgain;
          } catch {
            return raw;
          }
        }
      }
      return raw;
    }
  }
}

function tryParseQuestions(raw: string): { questions: QuizQuestions } | null {
  const repaired = repairJson(raw);
  try {
    const parsed = JSON.parse(repaired);
    if (parsed.questions && Array.isArray(parsed.questions)) {
      return parsed as { questions: QuizQuestions };
    }
    if (Array.isArray(parsed)) {
      return { questions: parsed as QuizQuestions };
    }
    return null;
  } catch {
    return null;
  }
}

async function callModelWithRetry(promptText: string, modelName: string): Promise<GeminiResult> {
  const errors: string[] = [];
  const maxAttempts = MAX_RETRIES_PER_MODEL;
  // Track keys used for this model call to avoid retrying the same exhausted key immediately.
  const keyHistoryForModel = new Set<string>();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
              questions: z.array(QuizQuestionOutputSchema),
            }),
          },
        }),
        GEMINI_TIMEOUT_MS,
        `Gemini:${modelName}`
      );

      const genResponse = _response as { output?: Record<string, unknown>; text?: string };
      const raw = genResponse.text;
      if (raw) {
        const repaired = repairJson(raw);
        const parsed = tryParseQuestions(repaired);
        if (parsed) {
          return { ok: true, output: parsed, engine: modelName };
        }
      }

      const output = genResponse.output as { questions: QuizQuestions } | undefined;
      if (output?.questions?.length) {
        return { ok: true, output, engine: modelName };
      }

      throw new Error(`PARSE_FAILED_${modelName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retrySec = getRetryDelaySeconds(err);
      const enriched = retrySec ? `${msg} (retryAfter ${retrySec}s)` : msg;
      errors.push(`${modelName} attempt ${attempt}: ${enriched}`);
      console.error(`[Forge] Gemini call failed (${modelName}, attempt ${attempt}/${maxAttempts})`, '\n' + formatError(err));

      // Auth / invalid-key handling: mark long cooldown (24h) and rotate if spare keys exist, else fail fast.
      if (isAuthError(err) || isResolverAuthError(err)) {
        if (apiKeyUsed) markKeyCooldown(apiKeyUsed, 24 * 60 * 60 * 1000);
        const configured = getConfiguredKeys().length;
        if (configured > 1 && keyHistoryForModel.size < configured) {
          // Try next key immediately — don't burn retries on known-invalid key.
          continue;
        }
        throw err;
      }

      // Quota / 429 handling: mark cooldown and rotate key on next iteration instead of blind same-key retry.
      if (isResolverQuotaError(err)) {
        const delayMs = parseRetryDelayMs(err);
        if (apiKeyUsed) markKeyCooldown(apiKeyUsed, delayMs);
        // If we have spare keys and haven't exhausted them, retry immediately with next key (no backoff).
        // Otherwise cap retries: if we already tried all configured keys, return quota_exceeded fast.
        const configured = getConfiguredKeys().length;
        if (keyHistoryForModel.size >= configured && configured > 1) {
          // Already tried every key once for this model — don't burn remaining attempts on same set.
          // Return early with quota reason so callGeminiWithFallback can surface correctly.
          return { ok: false, reason: 'quota_exceeded', errors };
        }
        if (isTimeoutError(err)) {
          // quota errors that also look like timeout should not double-count; still treat as quota
        }
        if (attempt === maxAttempts) {
          return { ok: false, reason: 'quota_exceeded', errors };
        }
        // For multi-key rotation, don't wait exponential backoff — try next key right away.
        const keys = getConfiguredKeys();
        if (keys.length > 1 && keyHistoryForModel.size < keys.length) {
          continue;
        }
        // Single-key mode: exponential backoff but capped at 2-3 attempts total (already)
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }

      // Timeout: do not retry indefinitely; cap at MAX_RETRIES_PER_MODEL with backoff ceiling.
      if (isTimeoutError(err)) {
        if (attempt === maxAttempts) {
          return { ok: false, reason: 'timeout', errors };
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }

      // Non-quota, non-timeout errors (e.g., 500/503) — still retry with exponential backoff but bounded.
      if (attempt === maxAttempts) {
        return { ok: false, reason: 'all_models_failed', errors };
      }

      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  return { ok: false, reason: 'all_models_failed', errors };
}

async function callGeminiWithFallback(promptText: string): Promise<GeminiResult> {
  const errors: string[] = [];
  let allQuota = true;
  let allTimeout = true;

  const chain = await modelFallbackChain();
  for (const modelName of chain) {
    const result = await callModelWithRetry(promptText, modelName);

    if (result.ok) {
      return result;
    }

    errors.push(...result.errors);

    for (const errMsg of result.errors) {
      if (!isRateLimitError(errMsg)) {
        allQuota = false;
      }
      if (!isTimeoutError(errMsg)) {
        allTimeout = false;
      }
    }
  }

  if (allQuota) {
    return { ok: false, reason: 'quota_exceeded', errors };
  }
  if (allTimeout) {
    return { ok: false, reason: 'timeout', errors };
  }
  return { ok: false, reason: 'all_models_failed', errors };
}

function validateQuestions(questions: QuizQuestions): string[] {
  const warnings: string[] = [];
  const seenTexts = new Set<string>();
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.text || q.text.trim().length < 10) {
      warnings.push(`Question ${i + 1}: text is too short (min 10 chars).`);
    }
    const normalized = q.text.trim().toLowerCase();
    if (seenTexts.has(normalized)) {
      warnings.push(`Question ${i + 1}: duplicate text with another question.`);
    }
    seenTexts.add(normalized);
    if (!q.options || q.options.length < 2) {
      warnings.push(`Question ${i + 1}: must have at least 2 options.`);
    }
    if (q.correctAnswerIndex < 0 || q.correctAnswerIndex >= (q.options?.length || 0)) {
      warnings.push(`Question ${i + 1}: correctAnswerIndex out of range.`);
    }
    const uniqueOptions = new Set(q.options?.map(o => o.trim().toLowerCase()));
    if (uniqueOptions.size !== (q.options?.length || 0)) {
      warnings.push(`Question ${i + 1}: has duplicate options.`);
    }
    for (let j = 0; j < (q.options?.length || 0); j++) {
      if (!q.options[j] || q.options[j].trim().length === 0) {
        warnings.push(`Question ${i + 1}: option ${String.fromCharCode(65 + j)} is empty.`);
      }
    }
  }
  return warnings;
}

function chunkText(text: string, maxChunkSize: number): string[] {
  if (text.length <= maxChunkSize) return [text];
  const chunks: string[] = [];
  const sentences = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
  let current = '';
  for (const sentence of sentences) {
    if ((current + sentence).length > maxChunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim().length > 0) chunks.push(current.trim());
  return chunks;
}

function detectFileTypes(dataUri: string): string[] {
  const uris = dataUri.includes(SEPARATOR) ? dataUri.split(SEPARATOR) : [dataUri];
  return uris.map(detectFileType);
}

export async function generateQuizFromPDF(input: GenerateQuizFromPDFInput): Promise<GenerateQuizFromPDFOutput> {
  const startTime = Date.now();
  const fileTypes = detectFileTypes(input.pdfDataUri);

  try {
    const execAuth = await verifyFirebaseTokenWithRole(input.idToken, 'executive');
    const cmdAuth = !execAuth ? await verifyFirebaseTokenWithRole(input.idToken, 'commander') : null;
    if (!execAuth && !cmdAuth) {
      console.error('[Forge] Unauthorized');
      return { questions: [], difficulty: input.difficulty, error: 'UNAUTHORIZED' };
    }
    const uid = execAuth?.uid || cmdAuth!.uid;
    const role = execAuth ? 'executive' : 'commander';

    const rl = await rateLimiter.check(`ai:pdf:${uid}`, { maxRequests: 5, windowMs: 60000, message: 'PDF Forge rate limit exceeded (5/min).' });
    if (!rl.allowed) {
      console.error('[Forge] Rate limited');
      return { questions: [], difficulty: input.difficulty, error: 'PDF_FORGE_RATE_LIMITED' };
    }

    const rawBase64 = input.pdfDataUri.split(',')[1] || input.pdfDataUri;
    const decodedBytes = Buffer.from(rawBase64, 'base64').length;
    if (decodedBytes > MAX_FILE_SIZE_BYTES) {
      console.error('[Forge] File too large:', decodedBytes);
      return { questions: [], difficulty: input.difficulty, error: 'PDF_TOO_LARGE' };
    }
    const result = await generateQuizFromPDFFlow(input);

    const durationMs = Date.now() - startTime;
    aiLogService.record({
      userId: uid,
      userRole: role,
      model: result.engine || 'unknown',
      fileCount: fileTypes.length,
      fileTypes,
      questionCount: result.questions?.length || 0,
      difficulty: input.difficulty,
      success: !result.error && (result.questions?.length || 0) > 0,
      durationMs,
      error: result.error || undefined,
      metadata: result.error ? { rawErrors: result.error } : undefined,
    });

    if (result.questions && result.questions.length > 0) {
      const warnings = validateQuestions(result.questions);
      if (warnings.length > 0 && !result.error) {
        (result as any).warnings = warnings;
      }
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Forge] Fatal error:', msg, '\n', formatError(err));
    const durationMs = Date.now() - startTime;
    aiLogService.record({
      userId: 'unknown',
      userRole: 'unknown',
      model: 'unknown',
      fileCount: fileTypes.length,
      fileTypes,
      questionCount: 0,
      difficulty: input.difficulty,
      success: false,
      durationMs,
      error: msg,
      metadata: { fullError: err instanceof Error ? formatError(err) : String(err) },
    });
    return { questions: [], difficulty: input.difficulty, error: msg };
  }
}

// ── Client-side-extraction entry point ───────────────────────────────
// The Commander-facing upload flow extracts text and per-page images in
// the browser (src/lib/prepare-documents.ts) and sends only this small
// derived payload. This sidesteps Vercel's hard 4.5 MB Function
// request/response ceiling that previously rejected multi-megabyte
// base64 data URIs with 413 FUNCTION_PAYLOAD_TOO_LARGE (which surfaced
// to the UI as the opaque "unexpected response" error).
//
// Vercel Functions cap the request body at ~4.5 MB; base64 inflates a
// raw file by ~33%. A 4.44 MB PDF became ~5.92 MB of base64 in the old
// `pdfDataUri` JSON body. The legacy generateQuizFromPDF route remains
// for non-browser/API consumers with smaller files.

const ExtractedDocumentSchema = z.object({
  name: z.string().optional(),
  kind: z.enum(['pdf', 'docx', 'txt', 'md', 'image']),
  text: z.string().optional(),
  imageDataUris: z.array(z.string()).optional(),
});

const GenerateQuizFromExtractedInputSchema = z.object({
  documents: z.array(ExtractedDocumentSchema).min(1).max(10),
  difficulty: z.enum(['easy', 'moderate', 'hard']),
  questionCount: z.number().min(1).max(30),
  idToken: z.string(),
});
type GenerateQuizFromExtractedInput = z.infer<typeof GenerateQuizFromExtractedInputSchema>;

const MAX_EXTRACTED_IMAGES = 24;
const MAX_EXTRACTED_TEXT_CHARS = 500000;

async function authorizeForgeRequest(idToken: string): Promise<{ uid: string; role: 'executive' | 'commander' } | null> {
  const execAuth = await verifyFirebaseTokenWithRole(idToken, 'executive');
  if (execAuth) return { uid: execAuth.uid, role: 'executive' };
  const cmdAuth = await verifyFirebaseTokenWithRole(idToken, 'commander');
  if (cmdAuth) return { uid: cmdAuth.uid, role: 'commander' };
  return null;
}

export async function generateQuizFromExtracted(input: GenerateQuizFromExtractedInput): Promise<GenerateQuizFromPDFOutput> {
  const startTime = Date.now();
  const fileTypes = input.documents.map((d) => d.kind);

  try {
    const auth = await authorizeForgeRequest(input.idToken);
    if (!auth) {
      console.error('[Forge] Unauthorized (extracted)');
      return { questions: [], difficulty: input.difficulty, error: 'UNAUTHORIZED' };
    }
    const uid = auth.uid;
    const role = auth.role;

    const rl = await rateLimiter.check(`ai:pdf:${uid}`, { maxRequests: 5, windowMs: 60000, message: 'PDF Forge rate limit exceeded (5/min).' });
    if (!rl.allowed) {
      console.error('[Forge] Rate limited (extracted)');
      return { questions: [], difficulty: input.difficulty, error: 'PDF_FORGE_RATE_LIMITED' };
    }

    // Structural guards — the browser already caps these, but defend the
    // server-side budget for non-browser callers too.
    const texts: string[] = [];
    const imageDataUris: string[] = [];
    for (const d of input.documents) {
      if (d.text) texts.push(d.text);
      for (const img of d.imageDataUris || []) {
        imageDataUris.push(img);
      }
      if (imageDataUris.length > MAX_EXTRACTED_IMAGES) {
        return { questions: [], difficulty: input.difficulty, error: 'PDF_TOO_LARGE' };
      }
    }
    const combinedText = texts.join('\n\n---\n\n');
    if (combinedText.length > MAX_EXTRACTED_TEXT_CHARS) {
      return { questions: [], difficulty: input.difficulty, error: 'PDF_TOO_LARGE' };
    }

    const result = await generateContentFromExtracted(combinedText, imageDataUris, input.difficulty, input.questionCount);

    const durationMs = Date.now() - startTime;
    aiLogService.record({
      userId: uid,
      userRole: role,
      model: result.engine || 'unknown',
      fileCount: input.documents.length,
      fileTypes,
      questionCount: result.questions?.length || 0,
      difficulty: input.difficulty,
      success: !result.error && (result.questions?.length || 0) > 0,
      durationMs,
      error: result.error || undefined,
      metadata: result.error ? { rawErrors: result.error } : undefined,
    });

    if (result.questions && result.questions.length > 0) {
      const warnings = validateQuestions(result.questions);
      if (warnings.length > 0 && !result.error) {
        (result as any).warnings = warnings;
      }
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Forge] Fatal error (extracted):', msg, '\n', formatError(err));
    const durationMs = Date.now() - startTime;
    aiLogService.record({
      userId: 'unknown',
      userRole: 'unknown',
      model: 'unknown',
      fileCount: input.documents.length,
      fileTypes,
      questionCount: 0,
      difficulty: input.difficulty,
      success: false,
      durationMs,
      error: msg,
      metadata: { fullError: err instanceof Error ? formatError(err) : String(err) },
    });
    return { questions: [], difficulty: input.difficulty, error: msg };
  }
}

// ── Multi-format extraction ──────────────────────────────────────────

const SEPARATOR = '||PDF_SEPARATOR||';

function detectFileType(dataUri: string): 'pdf' | 'docx' | 'txt' | 'md' | 'image' | 'unknown' {
  const lower = dataUri.slice(0, 120).toLowerCase();
  if (lower.startsWith('data:application/pdf') || lower.includes('%pdf')) return 'pdf';
  if (lower.includes('wordprocessingml')) return 'docx';
  if (lower.includes('presentationml') || lower.includes('spreadsheetml')) return 'unknown'; // not supported — UI will reject, backend treats as unknown
  if (lower.startsWith('data:text/markdown')) return 'md';
  if (lower.startsWith('data:text/plain')) return 'txt';
  if (lower.startsWith('data:image/')) return 'image';
  if (lower.startsWith('data:text/')) return 'txt';
  return 'unknown';
}

function extractTextFromTxt(dataUri: string): string {
  const base64 = dataUri.split(',')[1] || dataUri;
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function extractTextFromDocxBuffer(buffer: Buffer): string {
  try {
    let offset = 0;
    const entries: { name: string; data: Buffer }[] = [];

    while (offset < buffer.length - 30) {
      const sig = buffer.readUInt32LE(offset);
      if (sig !== 0x04034b50) break;

      const compression = buffer.readUInt16LE(offset + 8);
      const nameLength = buffer.readUInt16LE(offset + 26);
      const extraLength = buffer.readUInt16LE(offset + 28);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const dataOffset = offset + 30 + nameLength + extraLength;

      const name = buffer.toString('utf8', offset + 30, offset + 30 + nameLength);

      let data: Buffer;
      if (compression === 0) {
        data = buffer.slice(dataOffset, dataOffset + compressedSize);
      } else if (compression === 8) {
        data = zlib.inflateRawSync(buffer.slice(dataOffset, dataOffset + compressedSize));
      } else {
        offset = dataOffset + compressedSize;
        continue;
      }

      entries.push({ name, data });
      offset = dataOffset + compressedSize;
    }

    const docEntry = entries.find(e => e.name === 'word/document.xml');
    if (!docEntry) return '';

    const xml = docEntry.data.toString('utf8');
    const matches = xml.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
    if (!matches) return '';

    return matches
      .map(m => m.replace(/<[^>]+>/g, ''))
      .join(' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  } catch (e) {
    console.error('[DocxExtract] Error:', e);
    return '';
  }
}

async function ensurePdfJsPolyfills(): Promise<void> {
  // pdfjs-dist legacy build in Node requires DOMMatrix/Path2D globals.
  // We stub minimal versions so pdfjs does not need the heavy native
  // canvas (@napi-rs/canvas) for text extraction — keeps memory low on
  // Vercel and avoids ERR_ABORTED. The package stays in dependencies so
  // pdfjs's internal try-require can succeed if present, but we don't
  // load it here.
  if (typeof (globalThis as any).DOMMatrix !== 'undefined' && typeof (globalThis as any).Path2D !== 'undefined') return;
  if (typeof (globalThis as any).DOMMatrix === 'undefined') {
    (globalThis as any).DOMMatrix = class DOMMatrix {
      constructor(_init?: string | number[]) {}
      toString() { return 'matrix(1, 0, 0, 1, 0, 0)'; }
    };
    (global as any).DOMMatrix = (globalThis as any).DOMMatrix;
  }
  if (typeof (globalThis as any).Path2D === 'undefined') {
    (globalThis as any).Path2D = class Path2D {};
    (global as any).Path2D = (globalThis as any).Path2D;
  }
  // Also stub ImageData/canvas elements that pdfjs may probe in Node.
  if (typeof (globalThis as any).ImageData === 'undefined') {
    (globalThis as any).ImageData = class ImageData {
      constructor() {}
    };
  }
}

async function extractTextFromPdfBuffer(buffer: Buffer): Promise<{
  text: string;
  numpages: number;
  isImageOnly: boolean;
}> {
  const issue = detectPdfIssue(buffer);
  if (issue) {
    throw new Error(issue);
  }

  return withTimeout<{ text: string; numpages: number; isImageOnly: boolean }>(
    (async () => {
      await ensurePdfJsPolyfills();
      // Vercel standalone trace fix: `outputFileTracingIncludes` in next.config.ts
      // now ensures pdf.worker.* and @napi-rs/canvas are present at
      // /var/task/node_modules/... Without that, Node ESM import of
      // pdf.mjs fails at top-level: "Cannot find module pdf.worker.mjs".
      // We also set disableWorker:true so no separate thread is needed, and
      // set workerSrc to '' to avoid any fetch. The dynamic import is wrapped
      // to allow a fallback to pdfjs build/ variant if legacy is missing.
      let pdfjs: any;
      try {
        pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      } catch (e) {
        const msg = errorToString(e);
        if (msg.includes('pdf.worker') || msg.includes('Cannot find module')) {
          console.warn('[Forge] legacy pdf.mjs import failed, trying build/pdf.mjs fallback', msg);
          // @ts-ignore — build/pdf.mjs has no types
          pdfjs = await import('pdfjs-dist/build/pdf.mjs');
        } else {
          throw e;
        }
      }
      // For Node with disableWorker:true, workerSrc should be empty / disabled.
      // Previously we set an absolute file:// URL which still required the file
      // to exist (tracing miss → fatal). Now we explicitly disable and leave
      // workerSrc empty; pdf.js will use the in-process fake worker.
      if (typeof window === 'undefined' && (pdfjs as any).GlobalWorkerOptions) {
        try {
          (pdfjs as any).GlobalWorkerOptions.workerSrc = '';
        } catch {}
      }
      const { getDocument } = pdfjs;
      const loadingTask: PDFDocumentLoadingTask = getDocument({
        data: new Uint8Array(buffer),
        disableWorker: true,
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
        disableFontFace: true,
        verbosity: 0,
      } as any);
      const pdf = await loadingTask.promise;

      try {
        const textsByPage: string[] = [];
        let pagesWithText = 0;

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          try {
            const textContent = await page.getTextContent();
            const pageText = textContent.items
              .map((item: any) => ('str' in item ? item.str : ''))
              .join(' ')
              .trim();
            textsByPage.push(pageText);
            if (pageText.length > 0) pagesWithText++;
          } finally {
            page.cleanup();
          }
        }

        const text = textsByPage.join('\n').trim();
        const numpages = pdf.numPages;
        const isImageOnly = numpages > 0 && pagesWithText === 0;

        return { text, numpages, isImageOnly };
      } finally {
        await loadingTask.destroy();
      }
    })(),
    EXTRACTION_TIMEOUT_MS,
    'PDF extraction'
  ).catch((err) => {
    if (err instanceof Error && err.message.startsWith('TIMEOUT:')) {
      throw new Error('PDF_EXTRACTION_TIMEOUT');
    }
    const readable = errorToString(err);
    const lower = readable.toLowerCase();
    if (lower.includes('encrypt') || lower.includes('password') || lower.includes('permission')) {
      throw new Error('PDF_ENCRYPTED');
    }
    if (lower.includes('format') || lower.includes('invalid') || lower.includes('corrupt') || lower.includes('parse')) {
      throw new Error('PDF_CORRUPTED');
    }
    // Worker/canvas missing should be surfaced as extraction failed but with tracing hint
    if (lower.includes('pdf.worker') || lower.includes('cannot find module')) {
      console.error('[Forge] Worker/canvas missing — check outputFileTracingIncludes', readable);
    }
    throw new Error(`PDF_EXTRACTION_FAILED: ${readable}`);
  });
}

function detectPdfIssue(buffer: Buffer): string | null {
  const header = buffer.slice(0, 8).toString('ascii');
  if (!header.startsWith('%PDF-')) {
    return 'PDF_UNSUPPORTED';
  }

  const content = buffer.toString('latin1').toLowerCase();
  if (content.includes('/encrypt')) {
    return 'PDF_ENCRYPTED';
  }

  if (buffer.length < 100) {
    return 'PDF_CORRUPTED';
  }

  return null;
}

async function extractTextFromDocument(dataUri: string): Promise<string> {
  const rawBase64 = dataUri.split(',')[1] || dataUri;
  const fileType = detectFileType(dataUri);

  try {
    switch (fileType) {
      case 'txt':
      case 'md':
        return extractTextFromTxt(dataUri);

      case 'docx': {
        const buffer = Buffer.from(rawBase64, 'base64');
        return extractTextFromDocxBuffer(buffer);
      }

      case 'pdf': {
        const buffer = Buffer.from(rawBase64, 'base64');
        const result = await extractTextFromPdfBuffer(buffer);
        if (result.isImageOnly) {
          // Scanned/image-only PDFs have no selectable text layer — surface a
          // distinct error so the UI can show the clearer "scanned images"
          // message instead of the generic "Not enough content" fallback.
          throw new Error('PDF_IMAGE_ONLY');
        }
        return result.text;
      }

      case 'image':
        return ''; // Images are passed as vision input

      default:
        throw new Error('PDF_UNSUPPORTED');
    }
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    throw err;
  }
}

async function extractTextFromAllDocuments(dataUris: string[]): Promise<{
  combinedText: string;
  imageDataUris: string[];
}> {
  const texts: string[] = [];
  const imageDataUris: string[] = [];

  for (const dataUri of dataUris) {
    const fileType = detectFileType(dataUri);
    if (fileType === 'image') {
      imageDataUris.push(dataUri);
      continue;
    }

    try {
      const text = await extractTextFromDocument(dataUri);
      if (text.trim().length > 0) {
        texts.push(text.trim());
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'PDF_CONTENT_TOO_SHORT') {
        continue;
      }
      // PDF_IMAGE_ONLY is a legitimate user-facing error for scanned PDFs —
      // do not swallow it; let it propagate so the caller can return the
      // specific "This PDF appears to be scanned images with no text" message.
      throw e;
    }
  }

  return {
    combinedText: texts.join('\n\n---\n\n'),
    imageDataUris,
  };
}

// ── Gemini vision for images ─────────────────────────────────────────

async function generatePromptWithImages(
  textContent: string,
  imageDataUris: string[],
  difficulty: string,
  questionCount: number
): Promise<GeminiResult> {
  const MAX_CHUNK = 40000;
  const chunks = chunkText(textContent, MAX_CHUNK);

  const errors: string[] = [];
  const chain = await modelFallbackChain();

  for (const modelName of chain) {
    for (let attempt = 1; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
      let apiKeyUsed: string | null = null;
      try {
        const promptText = buildVisionPrompt(chunks[0], difficulty, questionCount);

        const parts: any[] = [{ text: promptText }];
        for (const imgUri of imageDataUris) {
          // Genkit expects { media: { url: dataUri } }, not raw inlineData
          // (inlineData is the underlying Google API type that caused
          // "Unsupported Part type" for gemini-3.6-flash).
          parts.push({ media: { url: imgUri } });
        }

        apiKeyUsed = await getGeminiApiKey();
        const tmpAi = createGenkitForKey(apiKeyUsed);
        const _response = await withTimeout(
          tmpAi.generate({
            model: googleAI.model(modelName),
            prompt: parts,
            output: {
              schema: z.object({
                questions: z.array(QuizQuestionOutputSchema),
              }),
            },
          }),
          GEMINI_TIMEOUT_MS,
          `Gemini:${modelName}`
        );

        const genResponse = _response as { output?: Record<string, unknown>; text?: string };
        const raw = genResponse.text;
        if (raw) {
          const repaired = repairJson(raw);
          const parsed = tryParseQuestions(repaired);
          if (parsed) {
            return { ok: true, output: parsed, engine: modelName };
          }
        }

        const output = genResponse.output as { questions: QuizQuestions } | undefined;
        if (output?.questions?.length) {
          return { ok: true, output, engine: modelName };
        }

        throw new Error(`PARSE_FAILED_${modelName}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const retrySec = getRetryDelaySeconds(err);
        const enriched = retrySec ? `${msg} (retryAfter ${retrySec}s)` : msg;
        errors.push(`${modelName} attempt ${attempt}: ${enriched}`);
        console.error(`[Forge] Gemini vision call failed (${modelName}, attempt ${attempt}/${MAX_RETRIES_PER_MODEL})`, '\n' + formatError(err));

        if (isAuthError(err) || isResolverAuthError(err)) {
          if (apiKeyUsed) markKeyCooldown(apiKeyUsed, 24 * 60 * 60 * 1000);
          if (getConfiguredKeys().length > 1) {
            continue;
          }
          throw err;
        }
        if (isResolverQuotaError(err)) {
          const delayMs = parseRetryDelayMs(err);
          if (apiKeyUsed) markKeyCooldown(apiKeyUsed, delayMs);
          // If we have spare keys, try next key immediately without backoff
          if (getConfiguredKeys().length > 1) {
            continue;
          }
        }
        if (isTimeoutError(err)) {
          if (attempt < MAX_RETRIES_PER_MODEL) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
          }
          continue;
        }
        if (attempt < MAX_RETRIES_PER_MODEL) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }
  }

  // Classify reason similarly to callGeminiWithFallback for vision path
  const anyQuota = errors.some(e => isRateLimitError(e));
  const anyTimeout = errors.some(e => isTimeoutError(e));
  if (anyQuota && !anyTimeout) return { ok: false, reason: 'quota_exceeded', errors };
  if (anyTimeout && !anyQuota) return { ok: false, reason: 'timeout', errors };
  return { ok: false, reason: 'all_models_failed', errors };
}

function buildPrompt(text: string, difficulty: string, questionCount: number): string {
  const difficultyMap: Record<string, string> = {
    easy: 'Beginner (Factual Recall)',
    moderate: 'Intermediate (Concept Application)',
    hard: 'Advanced (Critical Synthesis)',
  };
  const exemplars = getForgeFewShotExemplars(difficulty);
  return `Generate exactly ${questionCount} high-quality multiple-choice questions based on the following content.

Difficulty: ${difficultyMap[difficulty]}

Few-shot examples (${difficulty} style — follow this quality and format, do NOT copy content):
${exemplars}
- Questions must be derived ONLY from the provided content.
- Provide exactly 4 options for each question.
- Ensure distractors are plausible but incorrect.
- Include a clear explanation for the correct answer.

Output format MUST be a JSON object with a "questions" array:
{
  "questions": [
    {
      "text": "The question string",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswerIndex": 0,
      "explanation": "Why this is correct"
    }
  ]
}

Content:
${text}`;
}

function buildVisionPrompt(text: string, difficulty: string, questionCount: number): string {
  const difficultyMap: Record<string, string> = {
    easy: 'Beginner (Factual Recall)',
    moderate: 'Intermediate (Concept Application)',
    hard: 'Advanced (Critical Synthesis)',
  };
  const exemplars = getForgeFewShotExemplars(difficulty);
  return `Generate exactly ${questionCount} high-quality multiple-choice questions based on the following content and the provided image(s).

Difficulty: ${difficultyMap[difficulty]}

Few-shot examples (${difficulty} style — follow this quality and format, do NOT copy content):
${exemplars}
- Questions must be derived ONLY from the provided content.
- Provide exactly 4 options for each question.
- Ensure distractors are plausible but incorrect.
- Include a clear explanation for the correct answer.

Output format MUST be a JSON object with a "questions" array:
{
  "questions": [
    {
      "text": "The question string",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswerIndex": 0,
      "explanation": "Why this is correct"
    }
  ]
}

Content:
${text}`;
}

// ── Phase 2 prompt/output hardening (prompt/output layer ONLY) ───────
// Few-shot exemplars per difficulty (3 each). Injected into buildPrompt /
// buildVisionPrompt text only — QuizQuestionOutputSchema is unchanged and
// repairJson's 3-tier repair is untouched.
function getForgeFewShotExemplars(difficulty: string): string {
  const blocks: Record<string, string> = {
    easy: [
      'EX 1 (easy/recall): {"text": "What organelle is known as the powerhouse of the cell?", "options": ["Nucleus", "Mitochondria", "Ribosome", "Golgi apparatus"], "correctAnswerIndex": 1, "explanation": "Mitochondria generate ATP through cellular respiration."}',
      'EX 2 (easy/recall): {"text": "Which planet is closest to the Sun?", "options": ["Venus", "Earth", "Mercury", "Mars"], "correctAnswerIndex": 2, "explanation": "Mercury orbits closest to the Sun."}',
      'EX 3 (easy/recall): {"text": "What is H2O commonly known as?", "options": ["Salt", "Water", "Oxygen", "Hydrogen"], "correctAnswerIndex": 1, "explanation": "H2O is the chemical formula for water."}',
    ].join('\n'),
    moderate: [
      'EX 1 (moderate/application): {"text": "A plant kept in the dark for 48 hours is exposed to light with a destarched leaf partially covered. Why is iodine brown on the covered part?", "options": ["No chlorophyll there", "No photosynthesis without light", "Too much water", "Starch moved away"], "correctAnswerIndex": 1, "explanation": "The covered region received no light, so no starch formed and iodine stays brown."}',
      'EX 2 (moderate/application): {"text": "If a circuit doubles voltage while resistance stays constant, what happens to current?", "options": ["Halves", "Doubles", "Stays the same", "Quadruples"], "correctAnswerIndex": 1, "explanation": "Ohm\\u0027s law I=V/R: doubling V doubles I."}',
      'EX 3 (moderate/application): {"text": "A historian finds two conflicting accounts of one event. What is the best next step?", "options": ["Pick the longer account", "Corroborate with a third independent source", "Discard both", "Choose the older one"], "correctAnswerIndex": 1, "explanation": "Corroboration across independent sources is the standard method."}',
    ].join('\n'),
    hard: [
      'EX 1 (hard/synthesis): {"text": "Two studies on the same drug reach opposite conclusions with similar sample sizes. Which flaw most undermines a causal claim?", "options": ["Different journal prestige", "Uncontrolled confounding differing between cohorts", "Different font in reports", "Authors from different countries"], "correctAnswerIndex": 1, "explanation": "Uncontrolled confounding breaks causal identification even with equal N."}',
      'EX 2 (hard/synthesis): {"text": "An economy shows rising GDP with falling median wages and rising debt. Which inference is most defensible?", "options": ["Everyone is better off", "Growth is concentrated and debt-financed", "GDP is mismeasured to zero", "Wages are irrelevant"], "correctAnswerIndex": 1, "explanation": "Aggregates can rise while medians fall when gains concentrate at the top."}',
      'EX 3 (hard/synthesis): {"text": "A model scores 99% on training but 60% on unseen data from a new hospital. What is the primary diagnosis?", "options": ["Underfitting", "Overfitting / distribution shift", "Perfect generalization", "Label noise only"], "correctAnswerIndex": 1, "explanation": "Large train-test gap plus site shift indicates overfitting to the source distribution."}',
    ].join('\n'),
  };
  return blocks[difficulty] ?? blocks.moderate;
}

// Cross-tick near-duplicate filter (prompt/output layer only).
// Normalizes text (lower + trim + collapse whitespace); drops an incoming
// question when Jaccard token overlap vs any existing question exceeds 0.90.
function normalizeForgeQuestionText(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

function tokenizeForgeQuestionText(s: string): string[] {
  return normalizeForgeQuestionText(s).split(/[^a-z0-9]+/).filter(Boolean);
}

function jaccardForgeSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const setA = new Set(tokenizeForgeQuestionText(a));
  const setB = new Set(tokenizeForgeQuestionText(b));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const tok of setA) {
    if (setB.has(tok)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function isNearDuplicateForgeQuestion(a: string, b: string): boolean {
  const na = normalizeForgeQuestionText(a);
  const nb = normalizeForgeQuestionText(b);
  if (na === nb) return true;
  return jaccardForgeSimilarity(na, nb) > 0.9;
}

function dedupeForgeQuestions(
  existing: ForgeQuestion[],
  incoming: ForgeQuestion[]
): { kept: ForgeQuestion[]; dropped: number } {
  const kept: ForgeQuestion[] = [];
  const seen: string[] = existing.map((q) => q.text ?? '');
  let dropped = 0;
  for (const q of incoming) {
    const duplicate = seen.some((prev) => isNearDuplicateForgeQuestion(prev, q.text ?? ''));
    if (duplicate) {
      dropped++;
      continue;
    }
    kept.push(q);
    seen.push(q.text ?? '');
  }
  return { kept, dropped };
}

// Grounding score (prompt/output layer only — warnings, never failures):
// GroundingScore(Q, D) = |Tokens(Q) ∩ Tokens(D)| / |Tokens(Q)|.
// Tokens are lowercased alphanumeric tokens. Q = question text + options.
// If score < 0.70, callers attach a warnings entry; the job still succeeds.
function tokenizeGroundingText(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function groundingScoreForQuestion(q: ForgeQuestion, docTokenSet: Set<string>): number {
  const qText = [q.text ?? '', ...(q.options ?? [])].join(' ');
  const qTokens = tokenizeGroundingText(qText);
  if (qTokens.length === 0) return 1;
  let hits = 0;
  for (const tok of qTokens) {
    if (docTokenSet.has(tok)) hits++;
  }
  return hits / qTokens.length;
}

function groundingWarningsForQuestions(
  questions: ForgeQuestion[],
  docText: string,
  threshold = 0.7
): string[] {
  const warnings: string[] = [];
  if (questions.length === 0) return warnings;
  const docTokenSet = new Set(tokenizeGroundingText(docText));
  if (docTokenSet.size === 0) return warnings;
  questions.forEach((q, i) => {
    const score = groundingScoreForQuestion(q, docTokenSet);
    if (score < threshold) {
      warnings.push(
        `Question ${i + 1} may be weakly grounded in the source (score ${score.toFixed(2)} < ${threshold.toFixed(2)}).`
      );
    }
  });
  return warnings;
}

// R2-25 / Feature 25: Dual-agent critique pass (flagged, quota-gated).
// Solver = generation above; Critique = discriminability/ambiguity check.
// Default OFF (`platform_settings.ai.critiqueEnabled !== true`); when ON it
// runs a heuristic pass only (no extra Gemini tokens in Set 2). A Gemini
// second pass stays deferred until `getKeyHealth` headroom + explicit flag
// value 'gemini'. Returns kept questions + warnings (never fails the job).
async function isCritiqueEnabled(): Promise<boolean> {
  try {
    const { getAdminDb } = await import('@/lib/firebase-admin');
    const snap = await getAdminDb().collection(COLLECTIONS.PLATFORM_SETTINGS).doc('global').get();
    return (snap.data() as Record<string, unknown> | undefined) !== undefined &&
      ((snap.data() as { ai?: { critiqueEnabled?: unknown } }).ai?.critiqueEnabled === true);
  } catch {
    return false;
  }
}

function critiqueQuestions(
  questions: QuizQuestions,
): { kept: QuizQuestions; warnings: string[] } {
  const kept: QuizQuestions = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  questions.forEach((q, i) => {
    const opts = (q.options ?? []).map((o) => (o ?? '').trim().toLowerCase());
    const uniq = new Set(opts);
    // D(Q) proxy: ambiguous when options collapse or correct duplicates another.
    if (opts.length < 2 || uniq.size !== opts.length) {
      warnings.push(`Question ${i + 1} flagged by critique: duplicate or missing options.`);
      return;
    }
    const key = `${(q.text ?? '').trim().toLowerCase()}||${opts.join('||')}`;
    if (seen.has(key)) {
      warnings.push(`Question ${i + 1} flagged by critique: exact duplicate of an earlier question.`);
      return;
    }
    seen.add(key);
    kept.push(q);
  });
  return { kept, warnings };
}

// Shared generation step used by both the legacy `pdfDataUri` flow and the
// client-side-extraction server action (generateQuizFromExtracted). Takes
// already-extracted text + optional image data URIs; no file bytes cross
// this boundary beyond the small derived payload.
async function generateContentFromExtracted(
  combinedText: string,
  imageDataUris: string[],
  difficulty: 'easy' | 'moderate' | 'hard',
  questionCount: number
): Promise<GenerateQuizFromPDFOutput> {
  const text = combinedText.replace(/\s+/g, ' ').trim();

  if (text.length < 20 && imageDataUris.length === 0) {
    throw new Error('PDF_CONTENT_TOO_SHORT');
  }

  let result: GeminiResult;
  if (imageDataUris.length > 0) {
    result = await generatePromptWithImages(text, imageDataUris, difficulty, questionCount);
  } else {
    const MAX_CHUNK = 40000;
    const chunks = chunkText(text, MAX_CHUNK);
    const chunkCount = chunks.length;

    if (chunkCount > 1) {
      const perChunk = Math.max(1, Math.ceil(questionCount / chunkCount));
      const allQuestions: QuizQuestions = [];
      let lastEngine = '';
      for (let ci = 0; ci < chunks.length; ci++) {
        const chunkResult = await callGeminiWithFallback(
          buildPrompt(chunks[ci], difficulty, ci === chunks.length - 1 ? questionCount - allQuestions.length : perChunk)
        );
        if (chunkResult.ok) {
          allQuestions.push(...chunkResult.output.questions);
          lastEngine = chunkResult.engine;
        }
        if (allQuestions.length >= questionCount) break;
      }
      if (allQuestions.length > 0) {
        result = { ok: true, output: { questions: allQuestions.slice(0, questionCount) }, engine: lastEngine };
      } else {
        result = { ok: false, reason: 'all_models_failed', errors: ['All chunks failed'] };
      }
    } else {
      result = await callGeminiWithFallback(buildPrompt(text, difficulty, questionCount));
    }
  }

  if (!result.ok) {
    const rawErrors = result.errors.join(' || ');
    console.error('[Forge] All models failed. RAW errors:', '\n' + rawErrors);
    let errorMsg: string;
    // Extract retryAfter if any error contains it (e.g., "retryAfter 32s")
    const retryMatch = rawErrors.match(/retryAfter\s*(\d+)s/i);
    const retryHint = retryMatch ? ` Retry after ~${retryMatch[1]}s.` : '';
    const quotaPrefix = rawErrors.includes('ALL_GEMINI_KEYS_EXHAUSTED')
      ? 'ALL_GEMINI_KEYS_EXHAUSTED: All AI capacity exhausted.'
      : 'quota_exceeded';
    switch (result.reason) {
      case 'quota_exceeded':
        errorMsg = `${quotaPrefix}: AI generation temporarily unavailable due to quota limits.${retryHint} Please wait a few minutes before retrying. RAW: ${rawErrors}`;
        break;
      case 'timeout':
        errorMsg = `AI generation timed out after ${Math.round(GEMINI_TIMEOUT_MS / 1000)}s.${retryHint} Your PDF may be too large or complex. Try with fewer questions or a smaller PDF. RAW: ${rawErrors}`;
        break;
      default: {
        // For all_models_failed, check if underlying was actually quota or timeout but misclassified due to mixed errors
        if (rawErrors.toLowerCase().includes('quota') || rawErrors.includes('429') || rawErrors.includes('ALL_GEMINI_KEYS_EXHAUSTED')) {
          errorMsg = `${quotaPrefix}: AI generation quota exhausted.${retryHint} RAW: ${rawErrors}`;
        } else if (rawErrors.includes('TIMEOUT:')) {
          errorMsg = `AI generation timed out.${retryHint} RAW: ${rawErrors}`;
        } else {
          errorMsg = `AI generation failed. RAW: ${rawErrors}`;
        }
        break;
      }
    }
    return {
      questions: [],
      difficulty,
      engine: result.reason,
      error: errorMsg,
    };
  }

  // Flagged critique (Set 2): heuristic only, warnings additive, never fails.
  // The `await` is inside the flagged branch so the default OFF path adds
  // zero latency/quota cost.
  if (await isCritiqueEnabled()) {
    const { kept, warnings } = critiqueQuestions(result.output.questions);
    if (kept.length > 0) {
      return {
        questions: kept,
        difficulty,
        engine: result.engine,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }
    return {
      questions: result.output.questions,
      difficulty,
      engine: result.engine,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  return {
    questions: result.output.questions,
    difficulty,
    engine: result.engine,
  };
}

// ── Main flow ────────────────────────────────────────────────────────

const generateQuizFromPDFFlow = ai.defineFlow(
  {
    name: 'generateQuizFromPDFFlow',
    inputSchema: GenerateQuizFromPDFInputSchema,
    outputSchema: GenerateQuizFromPDFOutputSchema,
  },
  async (input: GenerateQuizFromPDFInput) => {
    const dataUris: string[] = input.pdfDataUri.includes(SEPARATOR)
      ? input.pdfDataUri.split(SEPARATOR)
      : [input.pdfDataUri];

    const { combinedText, imageDataUris } = await extractTextFromAllDocuments(dataUris);
    return generateContentFromExtracted(combinedText, imageDataUris, input.difficulty, input.questionCount);
  }
);

// ── Async job pipeline (Phase 115C) ──────────────────────────────────
// The production failure was a 504 FUNCTION_INVOCATION_TIMEOUT: one synchronous
// server action tried to complete a full Gemini generation (large/scanned
// documents, hard mode, up to 25 questions) inside a single Vercel invocation,
// blowing past maxDuration. The permanent $0 fix decomposes generation into
// Firestore-backed jobs with quota-aware "ticks":
//
//   createForgeJob  → validates auth, dedupes via forge_cache, creates the job
//                     + payload docs, returns a jobId.
//   runForgeTick    → ONE Gemini call per invocation (each stays < 60s ceiling).
//                     Claims the job with an atomic lease (single writer),
//                     generates up to FORGE_TICK_QA questions, persists progress
//                     (cursor, generatedCount, accumulated questions), and
//                     returns the current state. Called in a loop by the client
//                     and by the /api/cron/forge-worker backstop (tab closed).
//
// Clients never read Firestore directly — ai_jobs/forge_cache are locked.

interface ForgeQuestion {
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

const CreateForgeJobInputSchema = z.object({
  documents: z.array(ExtractedDocumentSchema).min(1).max(10),
  difficulty: z.enum(['easy', 'moderate', 'hard']),
  questionCount: z.number().min(1).max(30),
  idToken: z.string(),
});
type CreateForgeJobInput = z.infer<typeof CreateForgeJobInputSchema>;

const RunForgeTickInputSchema = z.object({
  jobId: z.string().min(1),
  idToken: z.string().optional(),
  workerToken: z.string().optional(),
});
type RunForgeTickInput = z.infer<typeof RunForgeTickInputSchema>;

interface ForgeTickOutput {
  status: 'done' | 'failed' | 'busy' | 'queued' | 'not_found';
  jobId: string;
  generatedCount: number;
  questionCount: number;
  progressNote: string;
  questions: ForgeQuestion[];
  error?: string;
  retryAfterMs?: number;
  engine?: string | null;
  cached?: boolean;
  /** Phase 2 grounding warnings — informational only, never fails the job. */
  warnings?: string[];
}

interface ForgeCreateOutput {
  jobId?: string;
  status: 'queued' | 'done';
  cached?: boolean;
  questions?: ForgeQuestion[];
  engine?: string | null;
  generatedCount?: number;
  questionCount: number;
  error?: string;
}

type SingleAttemptResult =
  | { ok: true; questions: QuizQuestions; engine: string }
  | { ok: false; category: 'quota' | 'timeout' | 'auth' | 'other'; error: string; retryAfterMs?: number };

function checkForgePayload(documents: GenerateQuizFromExtractedInput['documents']):
  | { combinedText: string; imageDataUris: string[] }
  | { error: string } {
  const texts: string[] = [];
  const imageDataUris: string[] = [];
  for (const d of documents) {
    if (d.text) texts.push(d.text);
    for (const img of d.imageDataUris || []) {
      if (imageDataUris.length >= MAX_EXTRACTED_IMAGES) return { error: 'PDF_TOO_LARGE' };
      imageDataUris.push(img);
    }
  }
  const combinedText = texts.join('\n\n---\n\n');
  if (combinedText.length > MAX_EXTRACTED_TEXT_CHARS) return { error: 'PDF_TOO_LARGE' };
  return { combinedText, imageDataUris };
}

// One and only one Gemini attempt — no in-invocation retry loops. Every retry
// happens across ticks (next tick picks the next key / model and re-claims the
// lease), which keeps each function invocation comfortably inside maxDuration.
async function generateOnceForJob(promptText: string, modelName: string, parts?: any[]): Promise<SingleAttemptResult> {
  let apiKey: string | null = null;
  try {
    apiKey = await getGeminiApiKey();
    const tmpAi = createGenkitForKey(apiKey);
    const _response = await withTimeout(
      tmpAi.generate({
        model: googleAI.model(modelName),
        prompt: parts ?? promptText,
        output: {
          schema: z.object({
            questions: z.array(QuizQuestionOutputSchema),
          }),
        },
      }),
      GEMINI_TIMEOUT_MS,
      `Gemini:${modelName}`
    );

    const genResponse = _response as { output?: Record<string, unknown>; text?: string };
    const raw = genResponse.text;
    if (raw) {
      const parsed = tryParseQuestions(repairJson(raw));
      if (parsed) return { ok: true, questions: parsed.questions, engine: modelName };
    }
    const output = genResponse.output as { questions: QuizQuestions } | undefined;
    if (output?.questions?.length) return { ok: true, questions: output.questions, engine: modelName };
    return { ok: false, category: 'other', error: `PARSE_FAILED_${modelName}: model returned unparseable output` };
  } catch (err) {
    const msg = errorToString(err);
    const lower = msg.toLowerCase();
    const resolverQuota = isResolverQuotaError(err);

    if (isAuthError(err) || isResolverAuthError(err) || lower.includes('api_key_invalid')) {
      if (apiKey) markKeyCooldown(apiKey, 24 * 60 * 60 * 1000);
      return { ok: false, category: 'auth', error: msg };
    }
    if (
      resolverQuota ||
      lower.includes('quota') ||
      lower.includes('429') ||
      lower.includes('resource_exhausted') ||
      lower.includes('resource exhausted') ||
      lower.includes('rate limit') ||
      lower.includes('rate_limit') ||
      lower.includes('too many requests') ||
      lower.includes('all_gemini_keys_exhausted') ||
      lower.includes('all ai capacity exhausted')
    ) {
      const delayMs = parseRetryDelayMs(err);
      if (apiKey) markKeyCooldown(apiKey, delayMs);
      return { ok: false, category: 'quota', error: msg, retryAfterMs: delayMs ?? undefined };
    }
    if (isTimeoutError(err)) {
      return { ok: false, category: 'timeout', error: msg };
    }
    return { ok: false, category: 'other', error: msg };
  }
}

function compileForgeError(attempt: Extract<SingleAttemptResult, { ok: false }>): string {
  const suffix = attempt.retryAfterMs ? ` Retry after ~${Math.round(attempt.retryAfterMs / 1000)}s.` : '';
  switch (attempt.category) {
    case 'quota':
      return `FORGE_QUOTA: AI generation temporarily unavailable due to quota limits.${suffix}`;
    case 'timeout':
      return `FORGE_TIMEOUT: AI generation timed out after ${Math.round(GEMINI_TIMEOUT_MS / 1000)}s.${suffix} Your document may be very large or complex.`;
    case 'auth':
      return `FORGE_AUTH: AI is not configured correctly (invalid API key).${suffix} Contact your administrator.`;
    default:
      return `FORGE_OTHER: AI generation failed. ${attempt.error}`;
  }
}

function buildTerminalOutput(job: ForgeJobDoc): ForgeTickOutput {
  const questions = (job.questions as ForgeQuestion[] | undefined) ?? [];
  return {
    status: job.status === AI_JOB_DONE ? 'done' : 'failed',
    jobId: job.id,
    generatedCount: job.generatedCount,
    questionCount: job.questionCount,
    progressNote: job.progressNote,
    questions,
    error: job.error ?? undefined,
    engine: job.engine,
  };
}

async function finalizeForgeJob(job: ForgeJobDoc): Promise<void> {
  const questions = (job.questions as ForgeQuestion[] | undefined) ?? [];
  if (questions.length > 0 && job.contentHash) {
    try {
      await forgeJobService.writeCache(job.contentHash, questions, job.engine ?? 'unknown');
    } catch (err) {
      console.warn('[Forge] cache write failed:', errorToString(err));
    }
  }
  aiLogService.record({
    userId: job.userId,
    userRole: job.userRole,
    model: job.engine || 'unknown',
    fileCount: job.fileCount,
    fileTypes: job.fileTypes,
    questionCount: questions.length,
    difficulty: job.difficulty,
    success: job.status === AI_JOB_DONE,
    durationMs: Math.max(0, Date.now() - job.createdAt),
    error: job.error ?? undefined,
    metadata: { jobId: job.id, progress: job.progressNote },
  });
}

async function authorizeForgeJob(job: { userId: string; workerToken: string }, idToken?: string, workerToken?: string): Promise<'owner' | 'worker' | null> {
  if (workerToken && safeTokenEqual(workerToken, job.workerToken)) return 'worker';
  if (idToken) {
    const auth = await authorizeForgeRequest(idToken);
    if (auth && auth.uid === job.userId) return 'owner';
  }
  return null;
}

export async function createForgeJob(input: CreateForgeJobInput): Promise<ForgeCreateOutput> {
  try {
    const auth = await authorizeForgeRequest(input.idToken);
    if (!auth) {
      return { status: 'queued', questionCount: input.questionCount, error: 'UNAUTHORIZED' };
    }

    const rl = await rateLimiter.check(`ai:forge:create:${auth.uid}`, {
      maxRequests: 10,
      windowMs: 60000,
      message: 'AI Forge job limit reached (10/min). Please wait.',
    });
    if (!rl.allowed) {
      return { status: 'queued', questionCount: input.questionCount, error: 'FORGE_RATE_LIMITED' };
    }

    const payload = checkForgePayload(input.documents);
    if ('error' in payload) {
      return { status: 'queued', questionCount: input.questionCount, error: payload.error };
    }
    if (payload.combinedText.replace(/\s+/g, ' ').trim().length < 20 && payload.imageDataUris.length === 0) {
      return { status: 'queued', questionCount: input.questionCount, error: 'PDF_CONTENT_TOO_SHORT' };
    }

    // Content-addressable cache: identical source material + difficulty +
    // question count returns instantly. File names are excluded so a rename
    // still hits; text/data-URIs fully determine the identity.
    const hashInput = input.documents.map((d) => ({
      kind: d.kind,
      text: d.text ?? '',
      imageDataUris: d.imageDataUris ?? [],
    }));
    const contentHash = contentHashOf({
      documents: hashInput,
      difficulty: input.difficulty,
      questionCount: input.questionCount,
    });

    const cached = await forgeJobService.readCache(contentHash);
    if (cached && cached.questions.length > 0) {
      aiLogService.record({
        userId: auth.uid,
        userRole: auth.role,
        model: cached.engine || 'cache',
        fileCount: input.documents.length,
        fileTypes: input.documents.map((d) => d.kind),
        questionCount: cached.questions.length,
        difficulty: input.difficulty,
        success: true,
        durationMs: 0,
        metadata: { cached: true },
      });
      return {
        status: 'done',
        cached: true,
        questions: cached.questions as ForgeQuestion[],
        engine: cached.engine,
        generatedCount: cached.questions.length,
        questionCount: input.questionCount,
      };
    }

    const job = await forgeJobService.createJob({
      userId: auth.uid,
      userRole: auth.role,
      difficulty: input.difficulty,
      questionCount: input.questionCount,
      documents: input.documents,
      contentHash,
    });
    return { jobId: job.id, status: 'queued', cached: false, questionCount: input.questionCount };
  } catch (err) {
    const msg = errorToString(err);
    console.error('[Forge] createForgeJob failed:', msg, '\n', formatError(err));
    return { status: 'queued', questionCount: input.questionCount, error: msg };
  }
}

export async function runForgeTick(input: RunForgeTickInput): Promise<ForgeTickOutput> {
  const { jobId, idToken, workerToken } = input;
  const now = Date.now();

  const job0 = await forgeJobService.getJob(jobId);
  if (!job0) {
    return { status: 'not_found', jobId, generatedCount: 0, questionCount: 0, progressNote: 'Job not found', questions: [], error: 'FORGE_JOB_NOT_FOUND' };
  }

  // Terminal fast path (cron may have completed the job) — still auth-gated so
  // questions never leak to unauthorized callers.
  if (job0.status === AI_JOB_DONE || job0.status === AI_JOB_FAILED || job0.status === AI_JOB_CANCELLED) {
    const authz = await authorizeForgeJob(job0, idToken, workerToken);
    if (!authz) {
      return { status: 'failed', jobId, generatedCount: job0.generatedCount, questionCount: job0.questionCount, progressNote: 'Not authorized', questions: [], error: 'UNAUTHORIZED' };
    }
    return buildTerminalOutput(job0);
  }

  const authz = await authorizeForgeJob(job0, idToken, workerToken);
  if (!authz) {
    return { status: 'failed', jobId, generatedCount: job0.generatedCount, questionCount: job0.questionCount, progressNote: 'Not authorized', questions: [], error: 'UNAUTHORIZED' };
  }
  const workerId = authz === 'worker' ? `worker:${jobId}` : `owner:${job0.userId}`;

  const rl = await rateLimiter.check(`ai:forge:tick:${jobId}`, {
    maxRequests: 60,
    windowMs: 60000,
    message: 'Too many job ticks. Please slow down.',
  });
  if (!rl.allowed) {
    return { status: 'busy', jobId, generatedCount: job0.generatedCount, questionCount: job0.questionCount, progressNote: 'Rate limited', questions: [], retryAfterMs: 30000 };
  }

  const claim = await forgeJobService.claimNextTick(jobId, workerId, now);
  if (claim.outcome === 'not_found') {
    return { status: 'not_found', jobId, generatedCount: 0, questionCount: 0, progressNote: 'Job not found', questions: [], error: 'FORGE_JOB_NOT_FOUND' };
  }
  if (claim.outcome === 'terminal') {
    return buildTerminalOutput(claim.job);
  }
  if (claim.outcome === 'busy') {
    return { status: 'busy', jobId, generatedCount: claim.job.generatedCount, questionCount: claim.job.questionCount, progressNote: claim.job.progressNote || 'Working…', questions: [], retryAfterMs: claim.retryAfterMs };
  }

  const job = claim.job;

  // If another tick already satisfied the question budget (should be rare with
  // the lease), finalize instead of generating.
  if (job.generatedCount >= job.questionCount) {
    await forgeJobService.appendQuestions(jobId, {
      questions: [],
      engine: job.engine ?? 'gemini-3.6-flash',
      cursor: job.cursor,
      generatedCount: job.generatedCount,
      questionCount: job.questionCount,
      final: true,
    });
    const finalized = await forgeJobService.getJob(jobId);
    if (finalized) await finalizeForgeJob(finalized);
    const doneDoc = finalized ?? job;
    return buildTerminalOutput({ ...doneDoc, status: AI_JOB_DONE });
  }

  let payload: PayloadParts;
  try {
    payload = await forgeJobService.loadPayload(jobId);
  } catch (err) {
    const msg = `Failed to load source material: ${errorToString(err)}`;
    await forgeJobService.markTickFailed(jobId, { error: msg, final: true, cursor: job.cursor, progressNote: 'Failed to load source material', nextAttemptAt: 0 });
    const failedJob = await forgeJobService.getJob(jobId);
    if (failedJob) await finalizeForgeJob(failedJob);
    return { status: 'failed', jobId, generatedCount: job.generatedCount, questionCount: job.questionCount, progressNote: 'Failed to load source material', questions: [], error: msg };
  }

  const normalizedText = payload.text.replace(/\s+/g, ' ').trim();
  const chain = await modelFallbackChain();
  const modelIndex = job.cursor.modelIndex % Math.max(1, chain.length);
  const modelName = chain[modelIndex];
  const remaining = job.questionCount - job.generatedCount;
  const requested = Math.min(FORGE_TICK_QA, remaining);

  const chunks = chunkText(normalizedText, FORGE_TEXT_CHUNK);
  const chunkIndex = job.cursor.chunkIndex % Math.max(1, chunks.length);
  const hasImages = payload.imageDataUris.length > 0;
  const chunkContent = chunks[chunkIndex] || '';

  const attempt = hasImages
    ? (() => {
        const visionPrompt = buildVisionPrompt(chunkContent, job.difficulty, requested);
        return generateOnceForJob(
          visionPrompt,
          modelName,
          [{ text: visionPrompt }, ...payload.imageDataUris.map((uri) => ({ media: { url: uri } }))]
        );
      })()
    : await generateOnceForJob(buildPrompt(chunkContent, job.difficulty, requested), modelName);
  const resolvedAttempt = await attempt;

  const nextChunkIndex = (chunkIndex + 1) % Math.max(1, chunks.length);
  const nextCursor = {
    chunkIndex: nextChunkIndex,
    modelIndex: resolvedAttempt.ok ? modelIndex : (modelIndex + 1) % Math.max(1, chain.length),
    ticks: job.cursor.ticks + 1,
  };

  if (!resolvedAttempt.ok) {
    const error = compileForgeError(resolvedAttempt);
    const consecutiveFailures = (job.consecutiveFailures ?? 0) + 1;
    const final = consecutiveFailures >= FORGE_MAX_CONSECUTIVE_FAILURES;
    const backoff = resolvedAttempt.retryAfterMs
      ?? (resolvedAttempt.category === 'quota' ? FORGE_QUOTA_BACKOFF_MS : resolvedAttempt.category === 'timeout' ? FORGE_TIMEOUT_BACKOFF_MS : FORGE_GENERIC_BACKOFF_MS);
    const nextAttemptAt = now + backoff;

    await forgeJobService.markTickFailed(jobId, {
      error,
      final,
      cursor: nextCursor,
      progressNote: final ? `Failed after ${consecutiveFailures} attempts` : `Retrying in ${Math.round(backoff / 1000)}s`,
      nextAttemptAt: final ? 0 : nextAttemptAt,
    });

    if (final) {
      const failedJob = await forgeJobService.getJob(jobId);
      if (failedJob) await finalizeForgeJob(failedJob);
      return { status: 'failed', jobId, generatedCount: job.generatedCount, questionCount: job.questionCount, progressNote: `Failed after ${consecutiveFailures} attempts`, questions: [], error, retryAfterMs: backoff };
    }
    return { status: 'queued', jobId, generatedCount: job.generatedCount, questionCount: job.questionCount, progressNote: `Retrying in ${Math.round(backoff / 1000)}s`, questions: [], retryAfterMs: backoff };
  }

  const rawToAdd = (resolvedAttempt.questions as ForgeQuestion[]).slice(0, requested);
  // Phase 2 cross-tick dedupe (prompt/output layer only): drop incoming
  // questions whose normalized text has Jaccard/token overlap > 0.90 vs any
  // already-accumulated job question (or earlier question in this batch).
  const existingQuestions = ((job.questions as ForgeQuestion[] | undefined) ?? []) as ForgeQuestion[];
  const { kept: toAdd, dropped: dedupedCount } = dedupeForgeQuestions(existingQuestions, rawToAdd);
  // Phase 2 grounding score (warnings only — never fails the job).
  const groundingWarnings = groundingWarningsForQuestions(toAdd, normalizedText, 0.7);
  const generatedCount = job.generatedCount + toAdd.length;
  const final = generatedCount >= job.questionCount || nextCursor.ticks >= FORGE_MAX_TICKS;

  await forgeJobService.appendQuestions(jobId, {
    questions: toAdd,
    engine: resolvedAttempt.engine,
    cursor: nextCursor,
    generatedCount,
    questionCount: job.questionCount,
    final,
  });

  if (final) {
    const finalized = await forgeJobService.getJob(jobId);
    if (finalized) await finalizeForgeJob(finalized);
    const doneJob = finalized ?? { ...job, status: AI_JOB_DONE, generatedCount, questions: toAdd };
    doneJob.generatedCount = generatedCount;
    if (!doneJob.questions) doneJob.questions = [];
    const terminal = buildTerminalOutput(doneJob);
    if (groundingWarnings.length > 0 || dedupedCount > 0) {
      const notes: string[] = [...groundingWarnings];
      if (dedupedCount > 0) notes.push(`${dedupedCount} near-duplicate question(s) dropped across ticks.`);
      terminal.warnings = notes;
    }
    return terminal;
  }

  return {
    status: 'queued',
    jobId,
    generatedCount,
    questionCount: job.questionCount,
    progressNote:
      dedupedCount > 0
        ? `${generatedCount}/${job.questionCount} questions generated (${dedupedCount} duplicate(s) dropped)`
        : `${generatedCount}/${job.questionCount} questions generated`,
    questions: [],
    engine: resolvedAttempt.engine,
    warnings: groundingWarnings.length > 0 ? groundingWarnings : undefined,
  };
}
