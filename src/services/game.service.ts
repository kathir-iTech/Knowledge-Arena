
import { supabase } from '@/lib/supabase';
import { QuestionSchema, AnswerKeySchema, SubmissionSchema, type ValidatedQuestion, type ValidatedAnswerKey, type ValidatedSubmission } from '@/lib/schemas';
import { DatabaseError, NotFoundError, ValidationError } from '@/lib/errors';
import { participantService } from '@/services/participant.service';

export const questionService = {
  /**
   * Bulk inserts questions for a newly created arena.
   */
  async createQuestions(questions: any[]): Promise<ValidatedQuestion[]> {
    const validated = questions.map(q => {
      const res = QuestionSchema.safeParse(q);
      if (!res.success) throw new ValidationError('Invalid Question data', res.error.format());
      return res.data;
    });

    const { data, error } = await supabase
      .from('questions')
      .insert(validated)
      .select();

    if (error) throw new DatabaseError(error.message, error);
    return data as ValidatedQuestion[];
  },

  /**
   * Securely creates answer keys for a quiz.
   */
  async createAnswerKeys(keys: any[]): Promise<void> {
    const validated = keys.map(k => {
      const res = AnswerKeySchema.safeParse(k);
      if (!res.success) throw new ValidationError('Invalid Answer Key data', res.error.format());
      return res.data;
    });

    const { error } = await supabase.from('answer_keys').insert(validated);
    if (error) throw new DatabaseError(error.message, error);
  },

  /**
   * Fetches all questions for a specific quiz.
   */
  async getQuestionsByQuizId(quizId: string): Promise<ValidatedQuestion[]> {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('quiz_id', quizId)
      .order('sort_index', { ascending: true });

    if (error) throw new DatabaseError(error.message, error);
    return (data || []) as ValidatedQuestion[];
  },

  /**
   * Fetches answer keys (Only called by the Teacher).
   */
  async getAnswerKeys(quizId: string): Promise<ValidatedAnswerKey[]> {
    const { data, error } = await supabase
      .from('answer_keys')
      .select('*')
      .eq('quiz_id', quizId);

    if (error) throw new DatabaseError(error.message, error);
    return (data || []) as ValidatedAnswerKey[];
  },

  subscribeToQuestions(quizId: string, onUpdate: (questions: ValidatedQuestion[]) => void) {
    this.getQuestionsByQuizId(quizId).then(onUpdate);

    return supabase
      .channel(`questions-sync-${quizId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'questions', filter: `quiz_id=eq.${quizId}` },
        async () => {
          const data = await this.getQuestionsByQuizId(quizId);
          onUpdate(data);
        }
      )
      .subscribe();
  },

  async evaluateQuestion(quizId: string, questionId: string, startTime: number): Promise<void> {
    const keys = await this.getAnswerKeys(quizId);
    const key = keys.find(k => k.question_id === questionId);
    if (!key) throw new NotFoundError('AnswerKey', questionId);

    const parts = await participantService.getAllParticipants(quizId);
    const submissions = await submissionService.getSubmissionsForQuestion(questionId);
    const submissionsMap = new Map(submissions.map((s: ValidatedSubmission) => [s.user_id, s]));

    for (const p of parts) {
      if ((p as any).role === 'teacher' || p.status === 'blocked') continue;
      const submission = submissionsMap.get(p.user_id);
      if (submission && submission.selected_option === key.correct_option_index) {
        const submittedAt = typeof submission.submitted_at === 'string'
          ? new Date(submission.submitted_at).getTime()
          : Date.now();
        const question = await this.getQuestionsByQuizId(quizId).then(qs => qs.find(q => q.id === questionId));
        if (!question) continue;
        const timeUsed = submittedAt - startTime;
        const bonus = Math.max(0, Math.floor((1 - timeUsed / (question.timer * 1000)) * 500));
        await participantService.updateParticipant(quizId, p.user_id, {
          score: (p.score || 0) + 500 + bonus
        });
      }
    }
  }
};

export const submissionService = {
  /**
   * Records a student's answer choice.
   */
  async submitAnswer(input: any): Promise<void> {
    const result = SubmissionSchema.safeParse({
      ...input,
      submitted_at: new Date().toISOString()
    });
    if (!result.success) throw new ValidationError('Invalid Submission data', result.error.format());

    const { error } = await supabase.from('submissions').insert(result.data);

    if (error) throw new DatabaseError(error.message, error);
  },

  /**
   * Retrieves all submissions for a specific question.
   */
  async getSubmissionsForQuestion(questionId: string): Promise<ValidatedSubmission[]> {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('question_id', questionId);

    if (error) throw new DatabaseError(error.message, error);
    return (data || []) as ValidatedSubmission[];
  }
};
