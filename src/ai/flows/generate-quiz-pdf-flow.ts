'use server';
/**
 * @fileOverview AI flow for generating multiple-choice questions from a PDF.
 * Engine: Google Gemini (Genkit Plugin) — free tier, with multi-model fallback.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

import pdf from 'pdf-parse';

const QuizQuestionOutputSchema = z.object({
  text: z.string().describe('The question text.'),
  options: z.array(z.string()).describe('Exactly 4 options.'),
  correctAnswerIndex: z.number().describe('0-based index of the correct option.'),
  explanation: z.string().describe('Short explanation of why the answer is correct.'),
});

const GenerateQuizFromPDFInputSchema = z.object({
  pdfDataUri: z.string().describe("A PDF as a data URI (base64)."),
  difficulty: z.enum(['easy', 'moderate', 'hard']).describe('Difficulty of the questions.'),
  questionCount: z.number().min(3).max(30).describe('Number of questions to generate.'),
});
export type GenerateQuizFromPDFInput = z.infer<typeof GenerateQuizFromPDFInputSchema>;

const GenerateQuizFromPDFOutputSchema = z.object({
  questions: z.array(QuizQuestionOutputSchema),
  difficulty: z.string(),
  engine: z.string().optional(),
});
export type GenerateQuizFromPDFOutput = z.infer<typeof GenerateQuizFromPDFOutputSchema>;

// Ordered fallback chain — tries each model in order until one succeeds.
// Ordered roughly by quality first, then by daily quota size.
const MODEL_FALLBACK_CHAIN = [
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
];

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('403') // some quota-denied cases surface as 403 too
  );
}

async function callGeminiWithFallback(promptText: string) {
  const errors: string[] = [];

  for (const modelName of MODEL_FALLBACK_CHAIN) {
    try {
      const response = await ai.generate({
        model: googleAI.model(modelName),
        prompt: promptText,
        output: {
          schema: z.object({
            questions: z.array(QuizQuestionOutputSchema)
          })
        }
      });

      if (!response.output) {
        throw new Error(`EMPTY_OUTPUT_${modelName}`);
      }

      return { output: response.output, engine: modelName };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${modelName}: ${msg}`);

      if (isRateLimitError(err)) {
        // Try next model in the chain
        continue;
      }

      // Non-rate-limit error (bad prompt, invalid schema, etc.) — no point
      // retrying other models with the same broken input, but try once more
      // in case it's model-specific, then give up if the chain is exhausted.
      continue;
    }
  }

  throw new Error(`ALL_MODELS_EXHAUSTED: ${errors.join(' | ')}`);
}

export async function generateQuizFromPDF(input: GenerateQuizFromPDFInput): Promise<GenerateQuizFromPDFOutput> {
  return generateQuizFromPDFFlow(input);
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
    if (!base64Data) throw new Error("INVALID_PDF_DATA");

    const buffer = Buffer.from(base64Data, 'base64');
    let extracted;
    try {
      extracted = await pdf(buffer);
    } catch (e) {
      throw new Error("PDF_EXTRACTION_FAILED");
    }

    const text = extracted.text.replace(/\s+/g, ' ').trim();
    if (text.length < 20) {
      throw new Error("PDF_CONTENT_TOO_SHORT");
    }

    const difficultyMap = {
      easy: "Beginner (Factual Recall)",
      moderate: "Intermediate (Concept Application)",
      hard: "Advanced (Critical Synthesis)"
    };

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
${text.substring(0, 40000)}`;

    const { output, engine } = await callGeminiWithFallback(promptText);
    return {
      questions: output.questions,
      difficulty: input.difficulty,
      engine
    };
  }
);