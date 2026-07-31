import { googleAI } from '@genkit-ai/googleai';
import { z } from 'genkit';
import { ai } from '@/ai/genkit';
import type { AiProvider, QuizGenerationInput, QuizGenerationOutput, GeneratedQuestion } from './provider';

const GEMINI_TIMEOUT_MS = 30000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`TIMEOUT:${label} exceeded ${ms}ms`)), ms)
    ),
  ]);
}

function repairJson(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    if (firstNewline > 0) cleaned = cleaned.slice(firstNewline + 1);
    const lastFence = cleaned.lastIndexOf('```');
    if (lastFence >= 0) cleaned = cleaned.slice(0, lastFence);
  }
  try { JSON.parse(cleaned); return cleaned; } catch {}
  let repaired = cleaned.replace(/'/g, '"').replace(/,(\s*[}\]])/g, '$1').replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
  try { JSON.parse(repaired); return repaired; } catch {}
  const objectMatch = repaired.match(/\{[\s\S]*\}/);
  if (objectMatch) return objectMatch[0].replace(/[\u0000-\u001F]+/g, ' ').replace(/\s+/g, ' ').trim();
  return raw;
}

const QuestionSchema = z.object({
  text: z.string().describe('The question text.'),
  options: z.array(z.string()).describe('Exactly 4 options.'),
  correctAnswerIndex: z.number().describe('0-based index of the correct option.'),
  explanation: z.string().describe('Short explanation of why the answer is correct.'),
});

export const genkitProvider: AiProvider = {
  name: 'genkit',

  async generateQuestions(input: QuizGenerationInput): Promise<QuizGenerationOutput> {
    const difficultyMap: Record<string, string> = {
      easy: 'Beginner (Factual Recall)',
      moderate: 'Intermediate (Concept Application)',
      hard: 'Advanced (Critical Synthesis)',
    };

    const promptText = `Generate exactly ${input.questionCount} high-quality multiple-choice questions based on the following content${input.imageDataUris.length > 0 ? ' and the provided image(s)' : ''}.

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
${input.textContent}`;

    const parts: any[] = [{ text: promptText }];
    for (const imgUri of input.imageDataUris) {
      parts.push({ inlineData: { data: imgUri.split(',')[1], mimeType: 'image/png' } });
    }

    const response = await withTimeout(
      ai.generate({
        model: googleAI.model('gemini-2.0-flash'),
        prompt: parts,
        output: { schema: z.object({ questions: z.array(QuestionSchema) }) },
      }),
      GEMINI_TIMEOUT_MS,
      'Gemini:genkit-provider'
    );

    const genResponse = response as { output?: Record<string, unknown>; text?: string };
    const raw = genResponse.text;
    if (raw) {
      const repaired = repairJson(raw);
      try {
        const parsed = JSON.parse(repaired);
        if (parsed.questions && Array.isArray(parsed.questions)) {
          return { questions: parsed.questions as GeneratedQuestion[], model: 'gemini-2.0-flash' };
        }
      } catch {}
    }

    const output = genResponse.output as { questions: GeneratedQuestion[] } | undefined;
    if (output?.questions?.length) {
      return { questions: output.questions, model: 'gemini-2.0-flash' };
    }

    throw new Error('PARSE_FAILED');
  },
};
