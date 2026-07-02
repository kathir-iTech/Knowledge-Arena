'use server';
/**
 * @fileOverview AI flow for generating multiple-choice questions from a PDF.
 * Powered by Anthropic Claude 3.5 Sonnet via direct API integration for maximum stability.
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

/**
 * Direct call to Anthropic API to bypass broken Genkit plugins.
 * Ensures Claude 3.5 Sonnet is used without model-not-found or plugin errors.
 */
async function callAnthropicClaude(prompt: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("MISSING_ANTHROPIC_API_KEY");

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
      system: "You are a professional educational assessment designer. You output ONLY valid JSON."
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`ANTHROPIC_API_ERROR: ${errorData.error?.message || response.statusText}`);
  }

  const result = await response.json();
  const text = result.content[0].text;
  
  // Extract JSON from potential markdown wrapping
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI_JSON_PARSE_FAILED");
  
  return JSON.parse(jsonMatch[0]);
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
    // 1. Extract Text from PDF
    const base64Data = input.pdfDataUri.split(',')[1];
    if (!base64Data) throw new Error("INVALID_PDF_DATA");
    
    const buffer = Buffer.from(base64Data, 'base64');
    let extracted;
    try {
        extracted = await pdf(buffer);
    } catch (e) {
        console.error("PDF Parsing Error:", e);
        throw new Error("PDF_EXTRACTION_FAILED");
    }

    const text = extracted.text.replace(/\s+/g, ' ').trim();
    if (text.length < 100) throw new Error("PDF_CONTENT_TOO_SHORT");

    const difficultyMap = {
      easy: "Beginner (Factual Recall)",
      moderate: "Intermediate (Concept Application)",
      hard: "Advanced (Critical Synthesis)"
    };

    // 2. Build the prompt for Claude
    const prompt = `Generate exactly ${input.questionCount} high-quality multiple-choice questions based on the following content.

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
${text.substring(0, 50000)}`;

    // 3. Call Claude directly
    const data = await callAnthropicClaude(prompt);

    if (!data.questions || !Array.isArray(data.questions)) {
      throw new Error("AI_INVALID_RESPONSE_FORMAT");
    }

    return {
      questions: data.questions,
      difficulty: input.difficulty
    };
  }
);
