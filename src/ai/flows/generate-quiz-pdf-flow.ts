'use server';
/**
 * @fileOverview AI flow for generating multiple-choice questions from a PDF.
 * Powered by Anthropic Claude 3.5 Sonnet for high-quality assessment generation.
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
  }).describe('Exactly 4 options.'),
  correctAnswer: z.enum(['A', 'B', 'C', 'D']).describe('The key of the correct answer.'),
  explanation: z.string().describe('Explanation for the correct answer.'),
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
  prompt: `You are a professional educational assessment designer.
Generate exactly {{{count}}} high-quality multiple-choice questions based on the following content.

Difficulty: {{{difficulty}}}
- Easy: Focus on direct facts and simple recall.
- Moderate: Focus on application of concepts and understanding.
- Hard: Focus on synthesis, critical analysis, and nuanced distinctions.

Content:
{{{text}}}

Guidelines:
1. Questions must be derived ONLY from the provided content.
2. Provide 4 distinct options (A, B, C, D) for each question.
3. Ensure distractors (incorrect answers) are plausible but clearly incorrect.
4. Include a clear explanation for the correct answer.`,
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
    if (!base64Data) throw new Error("INVALID_PDF_DATA");
    
    const buffer = Buffer.from(base64Data, 'base64');
    let extracted;
    try {
        extracted = await pdf(buffer);
    } catch (e) {
        throw new Error("PDF_EXTRACTION_FAILED");
    }

    const text = extracted.text.replace(/\s+/g, ' ').trim();
    if (text.length < 50) throw new Error("PDF_CONTENT_TOO_SHORT");

    const difficultyMap = {
      easy: "Beginner (Factual Recall)",
      moderate: "Intermediate (Concept Application)",
      hard: "Advanced (Critical Synthesis)"
    };

    // 2. Generate with Claude
    const { output } = await prompt({
      text: text.substring(0, 30000), // Safety limit for context
      difficulty: difficultyMap[input.difficulty],
      count: input.questionCount
    });

    if (!output?.questions) throw new Error("AI_GENERATION_EMPTY");

    const mappedQuestions = output.questions.map(q => ({
      text: q.question,
      options: [q.options.A, q.options.B, q.options.C, q.options.D],
      correctAnswerIndex: ['A', 'B', 'C', 'D'].indexOf(q.correctAnswer),
      explanation: q.explanation
    }));

    return {
      questions: mappedQuestions,
      difficulty: input.difficulty
    };
  }
);