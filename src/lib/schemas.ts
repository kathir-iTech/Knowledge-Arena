
export interface ValidatedQuiz {
  id: string;
  title: string;
  status: 'waiting' | 'live' | 'finished';
  created_by: string;
  current_question_index?: number;
  question_count?: number;
  question_start_at?: number | null;
  created_at?: number;
  archived?: boolean;
}

export interface ValidatedParticipant {
  user_id: string;
  status: 'playing' | 'finished' | 'blocked';
  score: number;
  name?: string;
  avatar?: string;
  violations_count?: number;
  lastSeen?: unknown;
}
