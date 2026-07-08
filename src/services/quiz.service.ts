
import { supabase } from '@/lib/supabase';
import { QuizSchema, type ValidatedQuiz } from '@/lib/schemas';
import { DatabaseError, NotFoundError, ValidationError } from '@/lib/errors';

export const quizService = {
  /**
   * Generates a new quiz arena in the relational database.
   */
  async createQuiz(input: any): Promise<string> {
    const result = QuizSchema.safeParse(input);
    if (!result.success) throw new ValidationError('Invalid Quiz data', result.error.format());

    const { error } = await supabase.from('quizzes').insert(result.data);

    if (error) throw new DatabaseError(error.message, error);
    return result.data.id;
  },

  /**
   * Fetches a single quiz by its 6-character room code.
   */
  async getQuizById(id: string): Promise<ValidatedQuiz> {
    const { data, error } = await supabase
      .from('quizzes')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new DatabaseError(error.message, error);
    if (!data) throw new NotFoundError('Quiz', id);

    const result = QuizSchema.safeParse(data);
    if (!result.success) throw new ValidationError('Database record corrupted', result.error.format());

    return result.data;
  },

  /**
   * Updates the global status of the quiz.
   */
  async updateQuizStatus(id: string, status: 'waiting' | 'live' | 'finished'): Promise<void> {
    const { error } = await supabase
      .from('quizzes')
      .update({ status })
      .eq('id', id);

    if (error) throw new DatabaseError(error.message, error);
  },

  /**
   * Updates the current question index and start time.
   */
  async advanceToQuestion(id: string, index: number): Promise<void> {
    const { error } = await supabase
      .from('quizzes')
      .update({
        current_question_index: index,
        question_start_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw new DatabaseError(error.message, error);
  },

  /**
   * Fetches all quizzes created by a specific teacher.
   */
  async getQuizzesByCreator(userId: string): Promise<ValidatedQuiz[]> {
    const { data, error } = await supabase
      .from('quizzes')
      .select('*')
      .eq('created_by', userId)
      .order('created_at', { ascending: false });

    if (error) throw new DatabaseError(error.message, error);
    
    return (data || []).map((q: any) => {
      const result = QuizSchema.safeParse(q);
      return result.success ? result.data : q;
    }) as ValidatedQuiz[];
  },

  /**
   * Permanent deletion of a quiz and all associated data.
   */
  async deleteQuiz(id: string): Promise<void> {
    const { error } = await supabase
      .from('quizzes')
      .delete()
      .eq('id', id);

    if (error) throw new DatabaseError(error.message, error);
  },

  /**
   * Resets a quiz for replay, returning it to the waiting state.
   */
  async resetQuiz(id: string): Promise<void> {
    const { error } = await supabase
      .from('quizzes')
      .update({
        status: 'waiting',
        current_question_index: -1,
        question_start_at: null
      })
      .eq('id', id);

    if (error) throw new DatabaseError(error.message, error);
  },

  /**
   * Subscribes to real-time changes of a single quiz document.
   */
  subscribeToQuiz(id: string, onUpdate: (quiz: ValidatedQuiz) => void) {
    return supabase
      .channel(`quiz-sync-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quizzes', filter: `id=eq.${id}` },
        (payload: any) => {
          const result = QuizSchema.safeParse(payload.new);
          if (result.success) onUpdate(result.data);
        }
      )
      .subscribe();
  }
};
