'use server';
/**
 * @fileOverview AI Explanation flow — generates educational explanations
 * for why a wrong answer is incorrect and why the correct answer is right.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { verifyFirebaseTokenWithAnyRole } from '@/lib/verify-auth';
import { rateLimiter } from '@/lib/rate-limiter';
import { aiLogService } from '@/services/ai-log.service';

const EXPLANATION_TIMEOUT_MS = 20000;

const ExplanationOutputSchema = z.object({
  explanation: z.string().describe('Clear, educational explanation of why the correct answer is right and why the wrong answer is a common misconception'),
});
export type ExplanationData = z.infer<typeof ExplanationOutputSchema>;

const ExplanationInputSchema = z.object({
  questionText: z.string().describe('The question text'),
  options: z.array(z.string()).describe('All answer options'),
  correctAnswer: z.string().describe('The correct answer text'),
  correctOptionIndex: z.number().describe('Index of the correct option'),
  wrongAnswer: z.string().describe('The wrong answer the gladiator chose'),
  wrongOptionIndex: z.number().describe('Index of the wrong answer chosen'),
  idToken: z.string().describe('Firebase ID token for auth'),
});
export type ExplanationInput = z.infer<typeof ExplanationInputSchema>;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('EXPLANATION_TIMEOUT')), ms)),
  ]);
}

export const explanationFlow = ai.defineFlow(
  {
    name: 'explanationFlow',
    inputSchema: ExplanationInputSchema,
    outputSchema: ExplanationOutputSchema,
  },
  async (input) => {
    const promptText = `You are an expert educator. A student answered a quiz question incorrectly. Provide a clear, educational explanation.

Question: ${input.questionText}

Options:
${input.options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}${i === input.correctOptionIndex ? ' ✓' : ''}${i === input.wrongOptionIndex ? ' ✗ (student chose)' : ''}`).join('\n')}

The correct answer is: ${input.correctAnswer}
The student chose: ${input.wrongAnswer}

Provide an explanation that:
1. Explains WHY the correct answer is right (conceptual understanding)
2. Explains WHY the student's wrong answer is a common misconception
3. Helps the student learn the underlying concept

Keep the explanation concise (2-4 paragraphs) and educational. Do not just restate the answer — explain the reasoning.`;

    const response = await withTimeout(
      ai.generate({
        model: googleAI.model('gemini-3.6-flash'),
        prompt: promptText,
        output: {
          schema: ExplanationOutputSchema,
        },
      }),
      EXPLANATION_TIMEOUT_MS
    );

    const out = (response as { output?: ExplanationData; text?: string }).output;
    if (out?.explanation) {
      return out;
    }
    const raw = (response as { text?: string }).text ?? '';
    return { explanation: raw.slice(0, 1000) || 'Explanation unavailable.' };
  }
);

export async function getExplanation(input: ExplanationInput): Promise<ExplanationData & { error?: string }> {
  const start = Date.now();
  try {
    const auth = await verifyFirebaseTokenWithAnyRole(input.idToken, ['gladiator', 'commander', 'executive']);
    if (!auth) {
      return { explanation: '', error: 'UNAUTHORIZED' };
    }

    const rl = rateLimiter.check(`ai:explanation:${auth.uid}`, { maxRequests: 30, windowMs: 60000, message: 'Explanation rate limit exceeded (30/min).' });
    if (!rl.allowed) {
      return { explanation: '', error: 'EXPLANATION_RATE_LIMITED' };
    }

    const result = await explanationFlow(input);

    const durationMs = Date.now() - start;
    aiLogService.record({
      userId: auth.uid,
      userRole: auth.role || 'gladiator',
      model: 'gemini-3.6-flash',
      fileCount: 0,
      fileTypes: ['explanation'],
      questionCount: 0,
      difficulty: 'easy',
      success: !!result.explanation,
      durationMs,
      error: undefined,
      metadata: { questionText: input.questionText.slice(0, 100) },
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
      fileTypes: ['explanation'],
      questionCount: 0,
      difficulty: 'easy',
      success: false,
      durationMs,
      error: msg,
    });
    return { explanation: '', error: msg };
  }
}
