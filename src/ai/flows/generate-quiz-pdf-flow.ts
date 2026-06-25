'use server';
/**
 * @fileOverview AI flow for generating multiple-choice questions from a PDF.
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

const QuizQuestionOutputSchema = z.object({
  text: z.string().describe('The question text.'),
  options: z.array(z.string()).length(4).describe('Exactly 4 multiple-choice options.'),
  correctAnswerIndex: z.number().min(0).max(3).describe('Index of the correct option (0-3).'),
  explanation: z.string().describe('A brief explanation of why this answer is correct.'),
});

const GenerateQuizFromPDFOutputSchema = z.object({
  questions: z.array(QuizQuestionOutputSchema),
  partial: z.boolean().optional().describe('True if not all requested questions could be generated.'),
});
export type GenerateQuizFromPDFOutput = z.infer<typeof GenerateQuizFromPDFOutputSchema>;

export async function generateQuizFromPDF(input: GenerateQuizFromPDFInput): Promise<GenerateQuizFromPDFOutput> {
  return generateQuizFromPDFFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateQuizFromPDFPrompt',
  input: { schema: z.object({ text: z.string(), difficulty: z.string(), count: z.number() }) },
  output: { schema: GenerateQuizFromPDFOutputSchema },
  prompt: `You are an expert educational assessment designer.
Generate exactly {{{count}}} multiple-choice questions based on the following text extracted from a PDF.

Difficulty Level: {{{difficulty}}}
Criteria for difficulty:
- Easy: Factual recall, definitions, basic concepts.
- Moderate: Application, inference, cause and effect.
- Hard: Analysis, evaluation, edge cases, tricky distractors.

Requirements:
- Each question must have exactly 4 options.
- Identify the correct option with a 0-based index.
- Provide a brief, helpful explanation for each answer.
- Ensure questions are derived strictly from the provided context.
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
    // 1. Extract text from PDF
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
    if (text.length < 200) {
      throw new Error("PDF_TOO_SHORT");
    }

    // Truncate to stay within context limits
    text = text.substring(0, 12000);

    // 2. Map difficulty description
    const difficultyMap = {
      easy: "Easy (Factual recall, definitions, basic concepts)",
      moderate: "Moderate (Application, inference, cause and effect)",
      hard: "Hard (Analysis, evaluation, edge cases, tricky distractors)"
    };

    // 3. Generate Questions with validation
    let { output } = await prompt({
      text,
      difficulty: difficultyMap[input.difficulty],
      count: input.questionCount
    });

    // Retry once if count is wrong
    if (output && output.questions.length !== input.questionCount) {
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

    // Validation & Cleaning
    const validatedQuestions = output.questions.filter(q => {
        return (
            q.text && 
            q.options && 
            q.options.length === 4 && 
            q.options.every(opt => opt.trim().length > 0) &&
            q.correctAnswerIndex >= 0 && 
            q.correctAnswerIndex <= 3 &&
            q.explanation
        );
    });

    // Check distribution
    const distribution = validatedQuestions.reduce((acc: any, q) => {
        const letter = String.fromCharCode(65 + q.correctAnswerIndex);
        acc[letter] = (acc[letter] || 0) + 1;
        return acc;
    }, {});
    
    const total = validatedQuestions.length;
    Object.keys(distribution).forEach(key => {
        if (distribution[key] / total > 0.6) {
            console.warn(`Skewed answer distribution detected for ${key}: ${distribution[key]}/${total}`);
        }
    });

    return {
      questions: validatedQuestions,
      partial: validatedQuestions.length !== input.questionCount
    };
  }
);
