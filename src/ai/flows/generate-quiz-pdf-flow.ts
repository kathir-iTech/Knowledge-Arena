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
Generate {{{count}}} multiple-choice questions based on the following text extracted from a PDF.

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
    if (!base64Data) throw new Error("Invalid PDF data URI format.");
    
    const buffer = Buffer.from(base64Data, 'base64');
    let extracted;
    try {
        extracted = await pdf(buffer);
    } catch (e) {
        throw new Error("PDF_PARSING_FAILED");
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

    // 3. Generate Questions
    const { output } = await prompt({
      text,
      difficulty: difficultyMap[input.difficulty],
      count: input.questionCount
    });

    if (!output || !output.questions || output.questions.length === 0) {
      throw new Error("AI_GENERATION_FAILED");
    }

    return output;
  }
);
