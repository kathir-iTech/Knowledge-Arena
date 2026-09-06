'use server';
/**
 * @fileOverview AI Copilot flow — expert quiz question writer assistant.
 * System prompt: "You are an expert quiz question writer. Help the Commander improve, rephrase, or generate new questions for their arena."
 * Accepts a user message + current question context, returns a suggested question.
 * Uses the existing Gemini free-tier pattern (googleAI model, single call).
 */

import { ai, createGenkitForKey } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { rateLimiter } from '@/lib/rate-limiter';
import { aiLogService } from '@/services/ai-log.service';
import { getGeminiApiKey, isQuotaError, isAuthError, parseRetryDelayMs, markKeyCooldown, getConfiguredKeys } from '@/ai/key-resolver';

const COPILOT_TIMEOUT_MS = 30000;

const CopilotQuestionSchema = z.object({
  text: z.string().describe('The suggested question text.'),
  options: z.array(z.string()).length(4).describe('Exactly 4 options.'),
  correctAnswerIndex: z.number().min(0).max(3).describe('0-based correct option index.'),
  explanation: z.string().describe('Short explanation of why the answer is correct.'),
});

const CopilotInputSchema = z.object({
  userMessage: z.string().min(1).max(2000).describe('Commander request: rephrase, improve, or generate.'),
  questionContext: z.string().optional().describe('Current question text + options if editing.'),
  titleContext: z.string().optional().describe('Arena title for theme context.'),
  domain: z.string().max(80).optional().describe('Subject domain for few-shot templating (e.g. Biology, History).'),
  difficulty: z.enum(['easy', 'moderate', 'hard']).optional().describe('Target difficulty for few-shot templating.'),
  idToken: z.string().describe('Firebase ID token for auth.'),
});
export type CopilotInput = z.infer<typeof CopilotInputSchema>;

const CopilotOutputSchema = z.object({
  suggestion: z.string().describe('Natural language suggestion / improved phrasing.'),
  generatedQuestion: CopilotQuestionSchema.nullable().describe('A complete suggested question, or null if only advice was requested.'),
  rawSuggestion: z.string().optional(),
});
export type CopilotOutput = z.infer<typeof CopilotOutputSchema>;

// ── Phase 2 Copilot prompt templating (prompt/output layer ONLY) ─────
// Prompt_final = SystemRole + 3 exemplars (domain+difficulty) +
// Context_quiz + UserQuery. Rate limit (10/min dual-layer) and
// per-request createGenkitForKey (never singleton ai) are unchanged.
const COPILOT_SYSTEM_ROLE =
  'You are an expert quiz question writer. Help the Commander improve, rephrase, or generate new questions for their arena.';

function getCopilotFewShotExemplars(difficulty?: string, domain?: string): string {
  const scope = domain?.trim() ? ` (domain: ${domain.trim().slice(0, 80)})` : '';
  const blocks: Record<string, string> = {
    easy: [
      `EX 1 (easy${scope}): Suggestion: "Kept one fact per question with short options." Question: {"text": "What gas do plants absorb for photosynthesis?", "options": ["Oxygen", "Carbon dioxide", "Nitrogen", "Helium"], "correctAnswerIndex": 1, "explanation": "Plants absorb carbon dioxide and release oxygen."}`,
      `EX 2 (easy${scope}): Suggestion: "Used plain wording and one clearly correct option." Question: {"text": "Which instrument measures temperature?", "options": ["Barometer", "Thermometer", "Ammeter", "Voltmeter"], "correctAnswerIndex": 1, "explanation": "A thermometer measures temperature."}`,
      `EX 3 (easy${scope}): Suggestion: "Tested recall of a single definition." Question: {"text": "What does CPU stand for?", "options": ["Central Processing Unit", "Computer Personal Unit", "Central Program Utility", "Control Processing Unit"], "correctAnswerIndex": 0, "explanation": "CPU stands for Central Processing Unit."}`,
    ].join('\n'),
    moderate: [
      `EX 1 (moderate${scope}): Suggestion: "Asked the Commander to apply the concept to a new case." Question: {"text": "A sealed syringe is compressed at constant temperature. What happens to the gas pressure?", "options": ["Decreases", "Stays the same", "Increases", "Drops to zero"], "correctAnswerIndex": 2, "explanation": "Boyle's law: smaller volume at constant temperature means higher pressure."}`,
      `EX 2 (moderate${scope}): Suggestion: "Required inference from two facts rather than recall." Question: {"text": "A night-shift nurse notices a patient is most alert at 2 AM. Which rhythm best explains this?", "options": ["Ultradian hunger cycle", "Shifted circadian rhythm", "Menstrual cycle", "Cardiac cycle"], "correctAnswerIndex": 1, "explanation": "Circadian rhythms shift with sustained night activity."}`,
      `EX 3 (moderate${scope}): Suggestion: "Made distractors share the same category as the answer." Question: {"text": "Which source is strongest for verifying a breaking news claim?", "options": ["A viral screenshot", "Two independent reputable outlets", "An anonymous comment", "A year-old article"], "correctAnswerIndex": 1, "explanation": "Independent corroboration by reputable outlets is strongest."}`,
    ].join('\n'),
    hard: [
      `EX 1 (hard${scope}): Suggestion: "Forced synthesis across conflicting evidence." Question: {"text": "Two equal-size trials of a fertilizer disagree. Trial A irrigated, Trial B did not. What most undermines a blanket causal claim?", "options": ["Journal prestige differs", "Uncontrolled irrigation confound", "Different harvest months only", "Author nationality"], "correctAnswerIndex": 1, "explanation": "Irrigation confounds the fertilizer effect, blocking a general causal claim."}`,
      `EX 2 (hard${scope}): Suggestion: "Tested evaluation of a flawed argument." Question: {"text": "A policy memo argues crime fell after cameras were installed, so cameras caused the fall. What is the key weakness?", "options": ["Cameras are expensive", "No control for concurrent patrol increases", "Crime data is boring", "Memos are short"], "correctAnswerIndex": 1, "explanation": "Without controlling for concurrent changes, causation is not identified."}`,
      `EX 3 (hard${scope}): Suggestion: "Required diagnosing distribution shift, not just accuracy." Question: {"text": "A quiz generator scores well on training topics but poorly on unseen domains. What is the primary diagnosis?", "options": ["Perfect generalization", "Overfitting to training distribution", "Too much data", "No possible fix"], "correctAnswerIndex": 1, "explanation": "The gap indicates overfitting to the training topic distribution."}`,
    ].join('\n'),
  };
  if (difficulty && blocks[difficulty]) return blocks[difficulty];
  return blocks.moderate;
}

function buildCopilotPrompt(input: CopilotInput): string {
  const systemRole = COPILOT_SYSTEM_ROLE;
  const exemplars = getCopilotFewShotExemplars(input.difficulty, input.domain);
  const contextQuiz = [
    input.titleContext ? `Arena title: ${input.titleContext}` : '',
    input.domain ? `Domain: ${input.domain}` : '',
    input.difficulty ? `Target difficulty: ${input.difficulty}` : '',
    input.questionContext
      ? `Current question context:\n${input.questionContext}`
      : 'No current question — the commander wants a brand new question.',
  ]
    .filter(Boolean)
    .join('\n');
  const userQuery = `Commander request: ${input.userMessage}`;
  // Prompt_final = SystemRole + 3 exemplars + Context_quiz + UserQuery
  return `${systemRole}

Few-shot examples (follow this quality and format, do NOT copy content):
${exemplars}

Quiz context:
${contextQuiz}

${userQuery}

Respond with:
1. A concise suggestion (1-2 sentences) describing what you did.
2. A complete multiple-choice question with exactly 4 options, a correct answer index (0-3), and a short explanation. If the commander only asked for advice (not a new question), you may still provide a best-effort example question.

Output JSON must match the schema: { suggestion, generatedQuestion: { text, options[4], correctAnswerIndex, explanation } }`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error('COPILOT_TIMEOUT')), ms);
    promise.then(
      (v) => { clearTimeout(tid); resolve(v); },
      (e) => { clearTimeout(tid); reject(e); }
    );
  });
}

async function callCopilotWithRotation(promptText: string): Promise<{ response: unknown }> {
  const keys = getConfiguredKeys();
  const maxAttempts = Math.min(keys.length || 1, 3);
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const apiKey = await getGeminiApiKey();
    const tmpAi = createGenkitForKey(apiKey);
    try {
      const res = await withTimeout(
        tmpAi.generate({
          model: googleAI.model('gemini-3.6-flash'),
          prompt: promptText,
          output: {
            schema: z.object({
              suggestion: z.string(),
              generatedQuestion: CopilotQuestionSchema.nullable(),
            }),
          },
        }),
        COPILOT_TIMEOUT_MS
      );
      return { response: res };
    } catch (err) {
      lastError = err;
      if (isAuthError(err)) {
        markKeyCooldown(apiKey, 24 * 60 * 60 * 1000);
        if (attempt < maxAttempts - 1 && keys.length > 1) continue;
        throw new Error(`GEMINI_AUTH_FAILED: Invalid API key. Check GEMINI_API_KEYS. Raw: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (isQuotaError(err)) {
        const delay = parseRetryDelayMs(err);
        markKeyCooldown(apiKey, delay);
        if (attempt < maxAttempts - 1 && keys.length > 1) continue;
        const sec = delay ? Math.ceil(delay / 1000) : 60;
        throw new Error(`GEMINI_QUOTA_EXCEEDED: Copilot quota exhausted. Retry after ~${sec}s. Raw: ${err instanceof Error ? err.message : String(err)}`);
      }
      throw err;
    }
  }
  throw lastError;
}

// The actual Genkit flow — makes a real Gemini API call.
export const copilotFlow = ai.defineFlow(
  {
    name: 'copilotFlow',
    inputSchema: CopilotInputSchema,
    outputSchema: CopilotOutputSchema,
  },
  async (input) => {
    // Phase 2: Prompt_final = SystemRole + 3 exemplars + Context_quiz + UserQuery
    const promptText = buildCopilotPrompt(input);

    const { response } = await callCopilotWithRotation(promptText);

    const out = (response as { output?: CopilotOutput; text?: string }).output;
    if (out?.suggestion) {
      return {
        suggestion: out.suggestion,
        generatedQuestion: out.generatedQuestion ?? null,
        rawSuggestion: (response as { text?: string }).text ?? undefined,
      };
    }
    // Fallback: try to parse raw text
    const raw = (response as { text?: string }).text ?? '';
    return {
      suggestion: raw.slice(0, 500) || 'Here is a suggestion for your arena.',
      generatedQuestion: null,
      rawSuggestion: raw,
    };
  }
);

// Server-action wrapper with auth, rate limiting, and logging — mirrors generateQuizFromPDF pattern.
export async function copilotAssist(input: CopilotInput): Promise<CopilotOutput & { error?: string }> {
  const start = Date.now();
  try {
    const execAuth = await verifyFirebaseTokenWithRole(input.idToken, 'executive');
    const cmdAuth = !execAuth ? await verifyFirebaseTokenWithRole(input.idToken, 'commander') : null;
    if (!execAuth && !cmdAuth) {
      return { suggestion: '', generatedQuestion: null, error: 'UNAUTHORIZED' };
    }
    const uid = execAuth?.uid ?? cmdAuth!.uid;
    const role = execAuth ? 'executive' : 'commander';

    const rl = await rateLimiter.check(`ai:copilot:${uid}`, { maxRequests: 10, windowMs: 60000, message: 'Copilot rate limit exceeded (10/min).' });
    if (!rl.allowed) {
      return { suggestion: '', generatedQuestion: null, error: 'COPILOT_RATE_LIMITED' };
    }

    const result = await copilotFlow(input);

    const durationMs = Date.now() - start;
    aiLogService.record({
      userId: uid,
      userRole: role,
      model: 'gemini-3.6-flash',
      fileCount: 0,
      fileTypes: ['copilot'],
      questionCount: result.generatedQuestion ? 1 : 0,
      difficulty: 'moderate',
      success: !!(result.generatedQuestion || result.suggestion),
      durationMs,
      error: undefined,
      metadata: { copilotRequest: input.userMessage.slice(0, 200) },
    });

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - start;
    aiLogService.record({
      userId: 'unknown',
      userRole: 'unknown',
      model: 'gemini-3.6-flash',
      fileCount: 0,
      fileTypes: ['copilot'],
      questionCount: 0,
      difficulty: 'moderate',
      success: false,
      durationMs,
      error: msg,
    });
    return { suggestion: '', generatedQuestion: null, error: msg };
  }
}
