import type { BattleMode } from './constants';

export interface QuestionDoc {
  id: string;
  text: string;
  options: string[];
  timer: number;
  sort_index: number;
}

export interface StartConfig {
  require_all_ready?: boolean;
}

export interface ScoringConfig {
  score_max?: number;
  score_min?: number;
  wrong_penalty?: number;
  skip_penalty?: number;
  time_decay?: boolean;
}

export interface ValidatedQuiz {
  id: string;
  title: string;
  status: 'waiting' | 'ready' | 'starting' | 'live' | 'paused' | 'finished' | 'archived';
  created_by: string;
  current_question_index?: number;
  question_count?: number;
  question_start_at?: number | null;
  created_at?: number;
  archived?: boolean;
  commanderLastSeen?: unknown;
  battle_mode?: BattleMode;
  start_config?: StartConfig;
  scoring_config?: ScoringConfig;
  paused_at?: number | null;
  paused_ms?: number;
  started_at?: number | null;
  ended_at?: number | null;
  skipped_question_ids?: string[];
  owner_transferred_at?: number | null;
}

export interface ValidatedParticipant {
  user_id: string;
  status: 'playing' | 'finished' | 'blocked';
  score: number;
  name?: string;
  avatar?: string;
  violations_count?: number;
  lastSeen?: unknown;
  ready?: boolean;
  session_token?: string;
  current_question_index?: number;
  question_start_at?: number | null;
  question_order?: string[];
  option_shuffle?: Record<string, number[]>;
  answered_question_ids?: string[];
  skipped_question_ids?: string[];
  timed_out_question_ids?: string[];
  reconnect_count?: number;
  suspicious_reconnects?: number;
  last_reconnected_at?: number | null;
  finished_at?: number | null;
}
