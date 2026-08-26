'use server';
/**
 * @fileOverview AI flow for generating multiple-choice questions from PDF, DOCX, TXT, MD, and images.
 * Engine: Google Gemini (Genkit Plugin) — free tier, with multi-model fallback.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import * as zlib from 'zlib';

import type { PDFDocumentLoadingTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { rateLimiter } from '@/lib/rate-limiter';
import { COLLECTIONS } from '@/lib/constants';
import { aiLogService } from '@/services/ai-log.service';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const EXTRACTION_TIMEOUT_MS = 30000;
const GEMINI_TIMEOUT_MS = 30000;

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
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`TIMEOUT:${label} exceeded ${ms}ms`)), ms)
    ),
  ]);
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
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('500') ||
    msg.includes('503') ||
    msg.includes('temporarily')
  );
}

function isTimeoutError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.startsWith('TIMEOUT:');
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

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const _response = await withTimeout(
        ai.generate({
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
      errors.push(`${modelName} attempt ${attempt}: ${msg}`);
      console.error(`[Forge] Gemini call failed (${modelName}, attempt ${attempt}/${maxAttempts})`, '\n' + formatError(err));

      if (isAuthError(err)) {
        throw err;
      }

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

    const rl = rateLimiter.check(`ai:pdf:${uid}`, { maxRequests: 5, windowMs: 60000, message: 'PDF Forge rate limit exceeded (5/min).' });
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

// ── Multi-format extraction ──────────────────────────────────────────

const SEPARATOR = '||PDF_SEPARATOR||';

function detectFileType(dataUri: string): 'pdf' | 'docx' | 'txt' | 'md' | 'image' | 'unknown' {
  const lower = dataUri.slice(0, 100).toLowerCase();
  if (lower.startsWith('data:application/pdf') || lower.includes('%pdf')) return 'pdf';
  if (lower.startsWith('data:application/vnd.openxmlformats-officedocument.wordprocessingml') || lower.includes('application/vnd.openxmlformats')) return 'docx';
  if (lower.startsWith('data:text/plain') || lower.startsWith('data:text/markdown')) return 'txt';
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
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const loadingTask: PDFDocumentLoadingTask = getDocument({ data: new Uint8Array(buffer) });
      const pdf = await loadingTask.promise;

      try {
        const textsByPage: string[] = [];
        let pagesWithText = 0;

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          try {
            const textContent = await page.getTextContent();
            const pageText = textContent.items
              .map((item) => ('str' in item ? item.str : ''))
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
  const difficultyMap: Record<string, string> = {
    easy: 'Beginner (Factual Recall)',
    moderate: 'Intermediate (Concept Application)',
    hard: 'Advanced (Critical Synthesis)',
  };

  const MAX_CHUNK = 40000;
  const chunks = chunkText(textContent, MAX_CHUNK);

  const errors: string[] = [];
  const chain = await modelFallbackChain();

  for (const modelName of chain) {
    for (let attempt = 1; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
      try {
        const promptText = `Generate exactly ${questionCount} high-quality multiple-choice questions based on the following content${imageDataUris.length > 0 ? ' and the provided image(s)' : ''}.

Difficulty: ${difficultyMap[difficulty]}
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
${chunks[0]}`;

        const parts: any[] = [{ text: promptText }];
        for (const imgUri of imageDataUris) {
          parts.push({ inlineData: { data: imgUri.split(',')[1], mimeType: 'image/png' } });
        }

        const _response = await withTimeout(
          ai.generate({
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
        errors.push(`${modelName} attempt ${attempt}: ${msg}`);
        console.error(`[Forge] Gemini vision call failed (${modelName}, attempt ${attempt}/${MAX_RETRIES_PER_MODEL})`, '\n' + formatError(err));

        if (isAuthError(err)) throw err;
        if (attempt < MAX_RETRIES_PER_MODEL) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }
  }

  return { ok: false, reason: 'all_models_failed', errors };
}

function buildPrompt(text: string, difficulty: string, questionCount: number): string {
  const difficultyMap: Record<string, string> = {
    easy: 'Beginner (Factual Recall)',
    moderate: 'Intermediate (Concept Application)',
    hard: 'Advanced (Critical Synthesis)',
  };
  return `Generate exactly ${questionCount} high-quality multiple-choice questions based on the following content.

Difficulty: ${difficultyMap[difficulty]}
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

    const text = combinedText.replace(/\s+/g, ' ').trim();

    if (text.length < 20 && imageDataUris.length === 0) {
      throw new Error('PDF_CONTENT_TOO_SHORT');
    }

    let result: GeminiResult;
    if (imageDataUris.length > 0) {
      result = await generatePromptWithImages(text, imageDataUris, input.difficulty, input.questionCount);
    } else {
      const MAX_CHUNK = 40000;
      const chunks = chunkText(text, MAX_CHUNK);
      const chunkCount = chunks.length;

      if (chunkCount > 1) {
        const perChunk = Math.max(1, Math.ceil(input.questionCount / chunkCount));
        const allQuestions: QuizQuestions = [];
        let lastEngine = '';
        for (let ci = 0; ci < chunks.length; ci++) {
          const chunkResult = await callGeminiWithFallback(
            buildPrompt(chunks[ci], input.difficulty, ci === chunks.length - 1 ? input.questionCount - allQuestions.length : perChunk)
          );
          if (chunkResult.ok) {
            allQuestions.push(...chunkResult.output.questions);
            lastEngine = chunkResult.engine;
          }
          if (allQuestions.length >= input.questionCount) break;
        }
        if (allQuestions.length > 0) {
          result = { ok: true, output: { questions: allQuestions.slice(0, input.questionCount) }, engine: lastEngine };
        } else {
          result = { ok: false, reason: 'all_models_failed', errors: ['All chunks failed'] };
        }
      } else {
        result = await callGeminiWithFallback(buildPrompt(text, input.difficulty, input.questionCount));
      }
    }

    if (!result.ok) {
      const rawErrors = result.errors.join(' || ');
      console.error('[Forge] All models failed. RAW errors:', '\n' + rawErrors);
      let errorMsg: string;
      switch (result.reason) {
        case 'quota_exceeded':
          errorMsg = `AI generation temporarily unavailable due to quota limits. RAW: ${rawErrors}`;
          break;
        case 'timeout':
          errorMsg = `AI generation timed out. RAW: ${rawErrors}`;
          break;
        default:
          errorMsg = `AI generation failed. RAW: ${rawErrors}`;
      }
      return {
        questions: [],
        difficulty: input.difficulty,
        engine: result.reason,
        error: errorMsg,
      };
    }

    return {
      questions: result.output.questions,
      difficulty: input.difficulty,
      engine: result.engine,
    };
  }
);
