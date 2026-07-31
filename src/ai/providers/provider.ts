export const AI_PROVIDER = 'genkit' as const;
export type AiProviderName = 'genkit';

export interface GeneratedQuestion {
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface QuizGenerationInput {
  textContent: string;
  imageDataUris: string[];
  difficulty: 'easy' | 'moderate' | 'hard';
  questionCount: number;
}

export interface QuizGenerationOutput {
  questions: GeneratedQuestion[];
  model: string;
}

export interface AiProvider {
  name: AiProviderName;
  generateQuestions(input: QuizGenerationInput): Promise<QuizGenerationOutput>;
}
