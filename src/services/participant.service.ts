
import { supabase } from '@/lib/supabase';
import { ParticipantSchema, type ValidatedParticipant } from '@/lib/schemas';
import { DatabaseError, ValidationError } from '@/lib/errors';

export const participantService = {
  /**
   * Registers a new gladiator in the participant list.
   */
  async joinQuiz(quizId: string, userId: string): Promise<void> {
    const input = {
      quiz_id: quizId,
      user_id: userId,
      score: 0,
      status: 'playing',
      violations_count: 0
    };
    
    const result = ParticipantSchema.safeParse(input);
    if (!result.success) throw new ValidationError('Invalid Participant data', result.error.format());

    const { error } = await supabase.from('participants').insert(result.data);

    if (error) throw new DatabaseError(error.message, error);
  },

  /**
   * Updates a participant's score or status.
   */
  async updateParticipant(quizId: string, userId: string, updates: any): Promise<void> {
    const { error } = await supabase
      .from('participants')
      .update(updates)
      .eq('quiz_id', quizId)
      .eq('user_id', userId);

    if (error) throw new DatabaseError(error.message, error);
  },

  /**
   * Subscribes to the real-time leaderboard/gladiator list for an arena.
   */
  subscribeToParticipants(quizId: string, onUpdate: (participants: ValidatedParticipant[]) => void) {
    this.getAllParticipants(quizId).then(onUpdate);

    return supabase
      .channel(`participants-sync-${quizId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants', filter: `quiz_id=eq.${quizId}` },
        async () => {
          const data = await this.getAllParticipants(quizId);
          onUpdate(data);
        }
      )
      .subscribe();
  },

  /**
   * Resets a student's malpractice status.
   */
  async unblockParticipant(quizId: string, userId: string): Promise<void> {
    await this.updateParticipant(quizId, userId, { 
      status: 'playing', 
      violations_count: 0 
    });
  },

  /**
   * Clears all student participants (used during quiz reset).
   */
  async clearAllStudents(quizId: string): Promise<void> {
    const { error } = await supabase
      .from('participants')
      .delete()
      .eq('quiz_id', quizId);

    if (error) throw new DatabaseError(error.message, error);
  },

  async getAllParticipants(quizId: string): Promise<ValidatedParticipant[]> {
    const { data, error } = await supabase
      .from('participants')
      .select('*')
      .eq('quiz_id', quizId)
      .order('score', { ascending: false });

    if (error) throw new DatabaseError(error.message, error);
    
    return (data || []).map((p: any) => {
      const result = ParticipantSchema.safeParse(p);
      return result.success ? result.data : p;
    }) as ValidatedParticipant[];
  }
};
