'use server';
/**
 * @fileOverview AI Mind Map flow — generates a structured topic hierarchy
 * from quiz questions and correct answers using Gemini.
 */

import { ai, createGenkitForKey } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { verifyFirebaseTokenWithAnyRole } from '@/lib/verify-auth';
import { rateLimiter } from '@/lib/rate-limiter';
import { aiLogService } from '@/services/ai-log.service';
import { getGeminiApiKey, isQuotaError, isAuthError, parseRetryDelayMs, markKeyCooldown, getConfiguredKeys } from '@/ai/key-resolver';

const MINDMAP_TIMEOUT_MS = 35000;

const MindMapNodeSchema = z.object({
  topic: z.string().describe('Topic or concept name'),
  subtopics: z.array(z.string()).describe('Sub-concepts under this topic'),
});

const MindMapConnectionSchema = z.object({
  from: z.string().describe('Source topic'),
  to: z.string().describe('Target topic'),
  label: z.string().optional().describe('Relationship label'),
});

const MindMapOutputSchema = z.object({
  title: z.string().describe('Central topic / quiz title'),
  nodes: z.array(MindMapNodeSchema).describe('Topic clusters with subtopics'),
  connections: z.array(MindMapConnectionSchema).describe('Relationships between topics'),
});
export type MindMapData = z.infer<typeof MindMapOutputSchema>;

const MindMapInputSchema = z.object({
  quizTitle: z.string().describe('The quiz/arena title'),
  questions: z.array(z.object({
    text: z.string().describe('Question text'),
    correctAnswer: z.string().describe('The correct answer text'),
  })).describe('List of questions with their correct answers'),
  idToken: z.string().describe('Firebase ID token for auth'),
});
export type MindMapInput = z.infer<typeof MindMapInputSchema>;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error('MINDMAP_TIMEOUT')), ms);
    promise.then(
      (v) => { clearTimeout(tid); resolve(v); },
      (e) => { clearTimeout(tid); reject(e); }
    );
  });
}

async function callMindmapWithRotation(promptText: string): Promise<unknown> {
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
          output: { schema: MindMapOutputSchema },
        }),
        MINDMAP_TIMEOUT_MS
      );
      return res;
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
        throw new Error(`GEMINI_QUOTA_EXCEEDED: Mind map quota exhausted. Retry after ~${sec}s. Raw: ${err instanceof Error ? err.message : String(err)}`);
      }
      throw err;
    }
  }
  throw lastError;
}

export const mindmapFlow = ai.defineFlow(
  {
    name: 'mindmapFlow',
    inputSchema: MindMapInputSchema,
    outputSchema: MindMapOutputSchema,
  },
  async (input) => {
    const promptText = `You are an educational content analyst. Given a set of quiz questions and their correct answers, generate a structured mind map that organizes the concepts into topic clusters.

Quiz Title: ${input.quizTitle}

Questions and Correct Answers:
${input.questions.map((q, i) => `${i + 1}. Q: ${q.text}\n   A: ${q.correctAnswer}`).join('\n')}

Generate a mind map with:
1. A central node (the quiz title / main subject area)
2. 3-7 topic clusters that group related questions
3. Subtopics under each cluster for individual concepts
4. Connections between related topic clusters

Return JSON matching the schema: { title, nodes: [{topic, subtopics[]}], connections: [{from, to, label?}] }`;

    const response = await callMindmapWithRotation(promptText) as { output?: MindMapData; text?: string };

    const out = (response as { output?: MindMapData; text?: string }).output;
    if (out?.nodes && out.nodes.length > 0) {
      return out;
    }
    // Fallback: try to parse raw text as JSON
    const raw = (response as { text?: string }).text ?? '';
    try {
      const parsed = JSON.parse(raw);
      if (parsed.nodes && parsed.nodes.length > 0) {
        return parsed as MindMapData;
      }
    } catch {
      // ignore
    }
    // Minimal fallback — single node with all topics
    return {
      title: input.quizTitle || 'Quiz Topics',
      nodes: [{ topic: 'Quiz Concepts', subtopics: input.questions.map(q => q.text.slice(0, 60)) }],
      connections: [],
    };
  }
);

export async function generateMindMap(input: MindMapInput): Promise<MindMapData & { error?: string }> {
  const start = Date.now();
  try {
    const auth = await verifyFirebaseTokenWithAnyRole(input.idToken, ['commander', 'executive']);
    if (!auth) {
      return { title: '', nodes: [], connections: [], error: 'UNAUTHORIZED' };
    }

    const rl = rateLimiter.check(`ai:mindmap:${auth.uid}`, { maxRequests: 5, windowMs: 60000, message: 'Mind map rate limit exceeded (5/min).' });
    if (!rl.allowed) {
      return { title: '', nodes: [], connections: [], error: 'MINDMAP_RATE_LIMITED' };
    }

    const result = await mindmapFlow(input);

    const durationMs = Date.now() - start;
    aiLogService.record({
      userId: auth.uid,
      userRole: auth.role || 'commander',
      model: 'gemini-3.6-flash',
      fileCount: 0,
      fileTypes: ['mindmap'],
      questionCount: 0,
      difficulty: 'moderate',
      success: result.nodes.length > 0,
      durationMs,
      error: undefined,
      metadata: { mindmapRequest: input.quizTitle.slice(0, 100), questionCount: input.questions.length },
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
      fileTypes: ['mindmap'],
      questionCount: 0,
      difficulty: 'moderate',
      success: false,
      durationMs,
      error: msg,
    });
    return { title: '', nodes: [], connections: [], error: msg };
  }
}
