'use server';
/**
 * @fileOverview AI flow for generating multiple-choice questions from a PDF.
 * Engine: Google Gemini (Genkit Plugin) — free tier, with multi-model fallback.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

import { PdfReader } from 'pdfreader';
import { verifyFirebaseToken } from '@/lib/verify-auth';
import { rateLimiter } from '@/lib/rate-limiter';

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;
const EXTRACTION_TIMEOUT_MS = 30000;
const GEMINI_TIMEOUT_MS = 60000;

const QuizQuestionOutputSchema = z.object({
  text: z.string().describe('The question text.'),
  options: z.array(z.string()).describe('Exactly 4 options.'),
  correctAnswerIndex: z.number().describe('0-based index of the correct option.'),
  explanation: z.string().describe('Short explanation of why the answer is correct.'),
});

const GenerateQuizFromPDFInputSchema = z.object({
  pdfDataUri: z.string().describe("A PDF as a data URI (base64)."),
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
});
export type GenerateQuizFromPDFOutput = z.infer<typeof GenerateQuizFromPDFOutputSchema>;

const MODEL_FALLBACK_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.5-pro',
];

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

  // Strip markdown fences
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
    // Attempt repairs
    let repaired = cleaned;

    // Replace single quotes with double quotes (for keys and string values)
    repaired = repaired.replace(/'/g, '"');

    // Remove trailing commas before closing braces/brackets
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

    // Ensure property names are double-quoted
    repaired = repaired.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');

    // Try parsing repaired version
    try {
      JSON.parse(repaired);
      return repaired;
    } catch {
      // If still invalid, try to extract a JSON object from the text
      const objectMatch = repaired.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          JSON.parse(objectMatch[0]);
          return objectMatch[0];
        } catch {
          // Remove any remaining problematic characters
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
    // Some models wrap questions differently
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
  const maxAttempts = 2; // Retry once on parse failure

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await withTimeout(
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

      if (!response.output) {
        throw new Error(`EMPTY_OUTPUT_${modelName}`);
      }

      const raw = response.text;
      if (raw) {
        const repaired = repairJson(raw);
        const parsed = tryParseQuestions(repaired);
        if (parsed) {
          return { ok: true, output: parsed, engine: modelName };
        }
      }

      // Use the structured output directly if available
      const output = response.output as { questions: QuizQuestions } | undefined;
      if (output?.questions?.length) {
        return { ok: true, output, engine: modelName };
      }

      throw new Error(`PARSE_FAILED_${modelName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${modelName} attempt ${attempt}: ${msg}`);

      if (isAuthError(err)) {
        throw err;
      }

      // On last attempt, don't continue
      if (attempt === maxAttempts) {
        return { ok: false, reason: 'all_models_failed', errors };
      }

      // Wait briefly before retry
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return { ok: false, reason: 'all_models_failed', errors };
}

async function callGeminiWithFallback(promptText: string): Promise<GeminiResult> {
  const errors: string[] = [];
  let allQuota = true;
  let allTimeout = true;

  for (const modelName of MODEL_FALLBACK_CHAIN) {
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

export async function generateQuizFromPDF(input: GenerateQuizFromPDFInput): Promise<GenerateQuizFromPDFOutput> {
  try {
    console.log('[Forge] PDF generation requested, difficulty:', input.difficulty, 'questionCount:', input.questionCount);
    const auth = await verifyFirebaseToken(input.idToken);
    if (!auth) {
      console.error('[Forge] Unauthorized');
      return { questions: [], difficulty: input.difficulty, error: 'UNAUTHORIZED' };
    }

    const rl = rateLimiter.check(`ai:pdf:${auth.uid}`, { maxRequests: 5, windowMs: 60000, message: 'PDF Forge rate limit exceeded (5/min).' });
    if (!rl.allowed) {
      console.error('[Forge] Rate limited');
      return { questions: [], difficulty: input.difficulty, error: 'PDF_FORGE_RATE_LIMITED' };
    }

    const rawBase64 = input.pdfDataUri.split(',')[1] || input.pdfDataUri;
    const decodedBytes = Buffer.from(rawBase64, 'base64').length;
    if (decodedBytes > MAX_PDF_SIZE_BYTES) {
      console.error('[Forge] PDF too large:', decodedBytes);
      return { questions: [], difficulty: input.difficulty, error: 'PDF_TOO_LARGE' };
    }
    console.log('[Forge] Authenticated, rate-limited, PDF size:', decodedBytes, 'bytes');

    return await generateQuizFromPDFFlow(input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Forge] Fatal error:', msg);
    return { questions: [], difficulty: input.difficulty, error: msg };
  }
}

function detectPdfIssue(buffer: Buffer): string | null {
  // Check PDF header
  const header = buffer.slice(0, 8).toString('ascii');
  if (!header.startsWith('%PDF-')) {
    return 'PDF_UNSUPPORTED';
  }

  // Check for encryption
  const content = buffer.toString('latin1').toLowerCase();
  if (content.includes('/encrypt')) {
    return 'PDF_ENCRYPTED';
  }

  // Check for empty file (header only, no objects)
  if (buffer.length < 100) {
    return 'PDF_CORRUPTED';
  }

  return null;
}

async function extractTextFromPdfBuffer(buffer: Buffer): Promise<{
  text: string;
  numpages: number;
  isImageOnly: boolean;
}> {
  // Quick validation
  const issue = detectPdfIssue(buffer);
  if (issue) {
    throw new Error(issue);
  }

  return withTimeout<{ text: string; numpages: number; isImageOnly: boolean }>(
    new Promise((resolve, reject) => {
      const textsByPage: Map<number, string[]> = new Map();
      let maxPage = 0;
      let settled = false;

      const reader = new PdfReader();
      reader.parseBuffer(buffer, (err: any, item?: any) => {
        if (settled) return;

        if (err) {
          settled = true;
          const msg = String(err.message || err).toLowerCase();
          if (msg.includes('encrypt') || msg.includes('password') || msg.includes('permission')) {
            reject(new Error('PDF_ENCRYPTED'));
          } else if (msg.includes('format') || msg.includes('invalid') || msg.includes('corrupt') || msg.includes('parse')) {
            reject(new Error('PDF_CORRUPTED'));
          } else {
            reject(new Error(`PDF_EXTRACTION_FAILED: ${err.message || err}`));
          }
          return;
        }

        if (!item) {
          settled = true;
          const totalPages = Math.max(maxPage, 1);

          // Build text per page
          const pageTexts: string[] = [];
          let pagesWithText = 0;
          for (let i = 1; i <= totalPages; i++) {
            const t = (textsByPage.get(i) || []).join(' ').trim();
            pageTexts.push(t);
            if (t.length > 0) pagesWithText++;
          }

          const text = pageTexts.join('\n').trim();
          const isImageOnly = totalPages > 0 && pagesWithText === 0;

          resolve({ text, numpages: totalPages, isImageOnly });
          return;
        }

        if (item.page) {
          if (item.page > maxPage) maxPage = item.page;
          return;
        }

        if (item.text) {
          const pageNum = maxPage || 1;
          if (!textsByPage.has(pageNum)) {
            textsByPage.set(pageNum, []);
          }
          textsByPage.get(pageNum)!.push(item.text);
        }
      });
    }),
    EXTRACTION_TIMEOUT_MS,
    'PDF extraction'
  ).catch((err) => {
    if (err instanceof Error && err.message.startsWith('TIMEOUT:')) {
      throw new Error('PDF_EXTRACTION_TIMEOUT');
    }
    throw err;
  });
}

const generateQuizFromPDFFlow = ai.defineFlow(
  {
    name: 'generateQuizFromPDFFlow',
    inputSchema: GenerateQuizFromPDFInputSchema,
    outputSchema: GenerateQuizFromPDFOutputSchema,
  },
  async (input) => {
    const parts = input.pdfDataUri.split(',');
    const base64Data = parts[parts.length - 1];
    if (!base64Data) throw new Error('INVALID_PDF_DATA');

    const buffer = Buffer.from(base64Data, 'base64');

    let extracted;
    try {
      console.log('[Forge] Starting PDF extraction...');
      extracted = await extractTextFromPdfBuffer(buffer);
      console.log('[Forge] PDF extraction complete:', extracted.numpages, 'pages, text length:', extracted.text.length);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      const code = err.message;
      // Pass through known error codes
      if (
        code === 'PDF_IMAGE_ONLY' ||
        code === 'PDF_ENCRYPTED' ||
        code === 'PDF_CORRUPTED' ||
        code === 'PDF_UNSUPPORTED' ||
        code === 'PDF_EXTRACTION_TIMEOUT' ||
        code === 'PDF_CONTENT_TOO_SHORT' ||
        code.startsWith('PDF_EXTRACTION_FAILED')
      ) {
        throw err;
      }
      throw new Error(`PDF_EXTRACTION_FAILED: ${err.message}`);
    }

    const text = extracted.text.replace(/\s+/g, ' ').trim();
    console.log(`[PDF] Cleaned text length: ${text.length}, pages: ${extracted.numpages}, imageOnly: ${extracted.isImageOnly}`);

    if (text.length < 20) {
      if (extracted.isImageOnly) {
        throw new Error('PDF_IMAGE_ONLY');
      }
      throw new Error('PDF_CONTENT_TOO_SHORT');
    }

    const difficultyMap = {
      easy: 'Beginner (Factual Recall)',
      moderate: 'Intermediate (Concept Application)',
      hard: 'Advanced (Critical Synthesis)',
    };

    const MAX_INPUT_CHARS = 40000;
    let truncated = text;
    if (text.length > MAX_INPUT_CHARS) {
      const target = text.lastIndexOf('. ', MAX_INPUT_CHARS);
      const target2 = text.lastIndexOf('\n', MAX_INPUT_CHARS);
      const breakAt = Math.max(target, target2);
      if (breakAt > MAX_INPUT_CHARS * 0.5) {
        truncated = text.slice(0, breakAt + 1);
      } else {
        truncated = text.slice(0, MAX_INPUT_CHARS);
      }
      console.log(`[PDF] Text truncated from ${text.length} to ${truncated.length} chars (sentence-boundary-aware)`);
    }

    const promptText = `Generate exactly ${input.questionCount} high-quality multiple-choice questions based on the following content.

Difficulty: ${difficultyMap[input.difficulty]}
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
${truncated}`;

    console.log('[Forge] Starting Gemini generation...');
    const result = await callGeminiWithFallback(promptText);
    console.log('[Forge] Gemini result:', result.ok ? 'success' : 'failed', 'engine:', result.ok ? result.engine : result.reason);
    if (!result.ok) {
      let errorMsg: string;
      switch (result.reason) {
        case 'quota_exceeded':
          errorMsg = 'AI generation temporarily unavailable due to quota limits.';
          break;
        case 'timeout':
          errorMsg = 'AI generation timed out. Your PDF may be too large or complex. Try with fewer questions or a smaller PDF.';
          break;
        default:
          errorMsg = 'AI generation failed. Please try again.';
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
