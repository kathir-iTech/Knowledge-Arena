'use server';
/**
 * @fileOverview AI flow for generating multiple-choice questions from a PDF.
 * Implements strict validation, retry logic, and difficulty-based prompting using Gemini 2.5 Pro.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import pdf from 'pdf-parse';

const GenerateQuizFromPDFInputSchema = z.object({
  pdfDataUri: z.string().describe("A PDF as a data URI (base64)."),
  difficulty: z.enum(['easy', 'moderate', 'hard']).describe('Difficulty of the questions.'),
  questionCount: z.number().min(5).max(30).describe('Number of questions to generate.'),
});
export type GenerateQuizFromPDFInput = z.infer<typeof GenerateQuizFromPDFInputSchema>;

// Internal AI Schema (matching the user's preferred A/B/C/D format)
const QuizQuestionInternalSchema = z.object({
  question: z.string().describe('The question text.'),
  options: z.object({
    A: z.string(),
    B: z.string(),
    C: z.string(),
    D: z.string(),
  }).describe('Exactly 4 options keyed A, B, C, D.'),
  correctAnswer: z.enum(['A', 'B', 'C', 'D']).describe('The key of the correct answer.'),
  explanation: z.string().describe('Explanation for the correct answer.'),
});

const GenerateQuizFromPDFInternalOutputSchema = z.object({
  questions: z.array(QuizQuestionInternalSchema),
});

// Final Output Schema for UI consumption
const QuizQuestionOutputSchema = z.object({
  text: z.string(),
  options: z.array(z.string()),
  correctAnswerIndex: z.number(),
  explanation: z.string(),
});

const GenerateQuizFromPDFOutputSchema = z.object({
  questions: z.array(QuizQuestionOutputSchema),
  partial: z.boolean().optional(),
  difficulty: z.string(),
});
export type GenerateQuizFromPDFOutput = z.infer<typeof GenerateQuizFromPDFOutputSchema>;

export async function generateQuizFromPDF(input: GenerateQuizFromPDFInput): Promise<GenerateQuizFromPDFOutput> {
  return generateQuizFromPDFFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateQuizFromPDFPrompt',
  model: 'googleai/gemini-2.5-pro',
  input: { schema: z.object({ text: z.string(), difficulty: z.string(), count: z.number() }) },
  output: { schema: GenerateQuizFromPDFInternalOutputSchema },
  prompt: `You are an expert educational assessment designer. 
Generate exactly {{{count}}} multiple-choice questions based on the following context.

Difficulty Level: {{{difficulty}}}
- Easy: Factual recall, definitions, basic concepts.
- Moderate: Application, inference, cause and effect.
- Hard: Analysis, evaluation, edge cases, tricky distractors.

Requirements:
- Each question must have exactly 4 options (A, B, C, D).
- Identify the correct option key.
- Provide a brief explanation.
- Ensure questions are derived strictly from the context.
- IMPORTANT: You MUST return exactly {{{count}}} questions.

Context:
{{{text}}}`,
});

const generateQuizFromPDFFlow = ai.defineFlow(
  {
    name: 'generateQuizFromPDFFlow',
    inputSchema: GenerateQuizFromPDFInputSchema,
    outputSchema: GenerateQuizFromPDFOutputSchema,
  },
  async input => {
    // 1. Extract text
    const base64Data = input.pdfDataUri.split(',')[1];
    if (!base64Data) throw new Error("INVALID_INPUT");
    
    const buffer = Buffer.from(base64Data, 'base64');
    let extracted;
    try {
        extracted = await pdf(buffer);
    } catch (e) {
        throw new Error("PDF_PARSE_FAILED");
    }

    let text = extracted.text.replace(/\s+/g, ' ').trim();
    if (text.length < 200) throw new Error("PDF_TOO_SHORT");

    // Truncate to stay within safety limits (approx 12k chars)
    text = text.substring(0, 12000);

    const difficultyMap = {
      easy: "Easy (Factual recall, definitions)",
      moderate: "Moderate (Application, inference)",
      hard: "Hard (Analysis, evaluation, distractors)"
    };

    // 2. Initial Generation
    let { output } = await prompt({
      text,
      difficulty: difficultyMap[input.difficulty],
      count: input.questionCount
    });

    // 3. One-shot Retry if count is wrong
    if (!output || output.questions.length !== input.questionCount) {
        console.warn(`Retry triggered: Expected ${input.questionCount}, got ${output?.questions.length || 0}`);
        const retry = await prompt({
            text,
            difficulty: difficultyMap[input.difficulty],
            count: input.questionCount
        });
        output = retry.output;
    }

    if (!output || !output.questions || output.questions.length === 0) {
      throw new Error("AI_FAILED");
    }

    // 4. Validation & Mapping
    const validInternal = output.questions.filter(q => {
        return (
            q.question && 
            q.options && 
            ['A', 'B', 'C', 'D'].every(k => (q.options as any)[k]?.trim().length > 0) &&
            ['A', 'B', 'C', 'D'].includes(q.correctAnswer) &&
            q.explanation
        );
    });

    // Distribution Check (Logging)
    const dist = validInternal.reduce((acc: any, q) => {
        acc[q.correctAnswer] = (acc[q.correctAnswer] || 0) + 1;
        return acc;
    }, {});
    
    Object.keys(dist).forEach(key => {
        if (dist[key] / validInternal.length > 0.6) {
            console.warn(`Skewed distribution detected for ${key}: ${dist[key]}/${validInternal.length}`);
        }
    });

    // Map to UI Format
    const mappedQuestions = validInternal.map(q => ({
        text: q.question,
        options: [q.options.A, q.options.B, q.options.C, q.options.D],
        correctAnswerIndex: ['A', 'B', 'C', 'D'].indexOf(q.correctAnswer),
        explanation: q.explanation
    }));

    return {
      questions: mappedQuestions,
      partial: mappedQuestions.length < input.questionCount,
      difficulty: input.difficulty
    };
  }
);
