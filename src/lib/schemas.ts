
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['teacher', 'student']),
  avatar: z.string()
});

export const QuizSchema = z.object({
  id: z.string().length(6),
  title: z.string().min(3),
  status: z.enum(['waiting', 'live', 'finished']),
  current_question_index: z.number().int().min(-1),
  question_count: z.number().int().min(1),
  created_by: z.string(),
  question_start_at: z.string().optional().nullable()
});

export const QuestionSchema = z.object({
  id: z.string().uuid().optional(),
  quiz_id: z.string().length(6),
  text: z.string().min(1),
  options: z.array(z.string()).length(4),
  timer: z.number().int().min(5),
  sort_index: z.number().int()
});

export const ParticipantSchema = z.object({
  quiz_id: z.string().length(6),
  user_id: z.string(),
  score: z.number().int().min(0),
  status: z.enum(['playing', 'blocked']),
  violations_count: z.number().int().min(0),
  joined_at: z.string().optional()
});

export const SubmissionSchema = z.object({
  quiz_id: z.string().length(6),
  question_id: z.string().uuid(),
  user_id: z.string(),
  selected_option: z.number().int().min(0).max(3),
  submitted_at: z.string().optional()
});

export const AnswerKeySchema = z.object({
  question_id: z.string().uuid(),
  quiz_id: z.string().length(6),
  correct_option_index: z.number().int().min(0).max(3)
});

export type ValidatedUser = z.infer<typeof UserSchema>;
export type ValidatedQuiz = z.infer<typeof QuizSchema>;
export type ValidatedQuestion = z.infer<typeof QuestionSchema>;
export type ValidatedParticipant = z.infer<typeof ParticipantSchema>;
export type ValidatedSubmission = z.infer<typeof SubmissionSchema>;
export type ValidatedAnswerKey = z.infer<typeof AnswerKeySchema>;
