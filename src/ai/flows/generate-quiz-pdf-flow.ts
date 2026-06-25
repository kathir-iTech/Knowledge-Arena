'use server';
/**
 * @fileOverview AI flow for generating high-quality multiple-choice questions from a PDF.
 * 
 * - generateQuizFromPDF - Entry point for the AI quiz generation.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import pdf from 'pdf-parse';

const GenerateQuizFromPDFInputSchema = z.object({
  pdfDataUri: z.string().describe("A PDF as a data URI (base64)."),
  difficulty: z.enum(['easy', 'moderate', 'hard']).describe('Difficulty of the questions.'),
  questionCount: z.number().min(3).max(30).describe('Number of questions to generate.'),
});
export type GenerateQuizFromPDFInput = z.infer<typeof GenerateQuizFromPDFInputSchema>;

const QuizQuestionInternalSchema = z.object({
  question: z.string().describe('The question text.'),
  options: z.object({
    A: z.string(),
    B: z.string(),
    C: z.string(),
    D: z.string(),
  }).describe('Exactly 4 options keyed A, B, C, D.'),
  correctAnswer: z.enum(['A', 'B', 'C', 'D']).describe('The key of the correct answer.'),
  explanation: z.string().describe('Explanation for why this is correct.'),
});

const GenerateQuizFromPDFInternalOutputSchema = z.object({
  questions: z.array(QuizQuestionInternalSchema),
});

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
  input: { 
    schema: z.object({ 
      text: z.string(), 
      difficulty: z.string(), 
      count: z.number() 
    }) 
  },
  output: { 
    schema: GenerateQuizFromPDFInternalOutputSchema 
  },
  prompt: `You are a professional academic assessment expert. 
Generate exactly {{{count}}} multiple-choice questions based strictly on the provided context.

Difficulty Level: {{{difficulty}}}
- Easy: Basic factual recall and terminology.
- Moderate: Application of concepts and analytical reasoning.
- Hard: Complex synthesis, critical evaluation, and subtle distractors.

Rules:
1. Each question must have exactly 4 options.
2. Provide a clear, educational explanation for the correct answer.
3. Return the results in the requested structured format.

Context:
{{{text}}}`,
});

const generateQuizFromPDFFlow = ai.defineFlow(
  {
    name: 'generateQuizFromPDFFlow',
    inputSchema: GenerateQuizFromPDFInputSchema,
    outputSchema: GenerateQuizFromPDFOutputSchema,
  },
  async (input) => {
    // 1. Extract Text from PDF
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
    if (text.length < 100) throw new Error("PDF_TOO_SHORT");

    // Conservative context window for stability
    text = text.substring(0, 15000);

    const difficultyLabels = {
      easy: "Easy (Factual Recall)",
      moderate: "Moderate (Concept Application)",
      hard: "Hard (Critical Analysis)"
    };

    // 2. Generate with stable Gemini 1.5 Pro
    const { output } = await prompt({
      text,
      difficulty: difficultyLabels[input.difficulty],
      count: input.questionCount
    });

    if (!output || !output.questions || output.questions.length === 0) {
      throw new Error("AI_FAILED");
    }

    const mappedQuestions = output.questions.map(q => ({
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
