import {
  PRESENCE_WINDOW_MS,
  QUIZ_READY,
  QUIZ_STARTING,
  QUIZ_LIVE,
  QUIZ_PAUSED,
  QUIZ_WAITING,
} from '@/lib/constants';
import type { QuizStatus } from '@/lib/constants';

export const ACTIVE_BATTLE_STATUSES: QuizStatus[] = [
  QUIZ_WAITING,
  QUIZ_READY,
  QUIZ_STARTING,
  QUIZ_LIVE,
  QUIZ_PAUSED,
];

export interface CommandParticipant {
  uid: string;
  name?: string | null;
  avatar?: string | null;
  score: number;
  status: 'playing' | 'finished' | 'blocked';
  ready?: boolean;
  lastSeen?: number | null;
  answeredIds: string[];
  timedOutIds: string[];
  skippedIds: string[];
  violations?: number;
}

export interface CommandQuestion {
  id: string;
  index: number;
  timer: number;
}

export interface CommandBattle {
  id: string;
  title: string;
  status: QuizStatus;
  mode: string;
  current: number;
  questionCount: number;
  questionStartAt?: number | null;
  startedAt?: number | null;
  pausedAt?: number | null;
  commanderId?: string | null;
  createdAt?: number;
  participants: CommandParticipant[];
  questions: CommandQuestion[];
}

export interface LiveEvent {
  id: string;
  battleId: string;
  type: 'joined' | 'left';
  uid: string;
  name: string;
  timestamp: number;
}

export function isOnline(lastSeenAt: number | null | undefined, now: number): boolean {
  return !!lastSeenAt && now - lastSeenAt <= PRESENCE_WINDOW_MS;
}

export function rankParticipants(participants: CommandParticipant[]): CommandParticipant[] {
  return participants
    .filter(p => p.status !== 'blocked')
    .sort((a, b) => b.score - a.score);
}

export interface TimerInfo {
  state: 'idle' | 'running' | 'paused' | 'done';
  seconds: number;
  total: number;
  fraction: number;
  label: string;
}

export function getTimerInfo(battle: CommandBattle, now: number): TimerInfo {
  if (battle.status === QUIZ_PAUSED) {
    return { state: 'paused', seconds: 0, total: 0, fraction: 0, label: 'Paused' };
  }
  if (battle.status !== QUIZ_LIVE) {
    return { state: 'idle', seconds: 0, total: 0, fraction: 0, label: battle.status };
  }
  if (!battle.questionStartAt || battle.questions.length === 0) {
    return { state: 'idle', seconds: 0, total: 0, fraction: 0, label: 'Starting…' };
  }
  const question = battle.questions.find(q => q.index === battle.current);
  if (!question) {
    return { state: 'idle', seconds: 0, total: 0, fraction: 0, label: 'Waiting…' };
  }
  const total = question.timer;
  const deadline = battle.questionStartAt + total * 1000;
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const fraction = total > 0 ? Math.max(0, Math.min(1, seconds / total)) : 0;
  return { state: 'running', seconds, total, fraction, label: `${seconds}s` };
}

export interface PredictionRow {
  uid: string;
  name: string;
  score: number;
  projected: number;
  probability: number;
  lead: boolean;
}

export function computeWinnerPrediction(
  participants: CommandParticipant[],
  questionCount: number,
  current: number
): PredictionRow[] {
  const candidates = participants.filter(
    p => p.status !== 'blocked' && (p.score > 0 || p.answeredIds.length > 0)
  );
  const remaining = Math.max(0, questionCount - (current + 1));
  const projected = candidates.map(p => {
    const perAnswered = p.score / Math.max(1, p.answeredIds.length);
    return {
      uid: p.uid,
      name: p.name || 'Player',
      score: p.score,
      projected: p.score + remaining * perAnswered,
    };
  });
  const total = projected.reduce((sum, r) => sum + r.projected, 0);
  const rows: PredictionRow[] = projected.map(r => ({
    ...r,
    probability: total > 0 ? Math.round((r.projected / total) * 100) : 0,
    lead: false,
  }));
  rows.sort((a, b) => b.projected - a.projected);
  if (rows.length > 0) rows[0].lead = true;
  return rows;
}

export type HeatCell = 'answered' | 'timedout' | 'skipped' | 'none' | 'current';

export interface HeatRow {
  uid: string;
  name: string;
  score: number;
  overall: HeatCell[];
}

export function buildHeatmap(
  battle: CommandBattle,
  columnsShown: number
): { rows: HeatRow[]; from: number; to: number } {
  const rank = rankParticipants(battle.participants);
  const maxIndex = Math.max(
    battle.current,
    battle.questions.reduce((m, q) => Math.max(m, q.index), battle.current)
  );
  const to = Math.max(maxIndex, Math.min(columnsShown - 1, battle.questionCount - 1));
  const from = Math.max(0, to - columnsShown + 1);

  const keysAt = new Map<number, string>();
  for (const q of battle.questions) keysAt.set(q.index, q.id);

  const rows: HeatRow[] = rank.slice(0, 24).map(p => {
    const answeredSet = new Set(p.answeredIds);
    const timedSet = new Set(p.timedOutIds);
    const skippedSet = new Set(p.skippedIds);
    const overall: HeatCell[] = [];
    for (let i = from; i <= to; i++) {
      const qid = keysAt.get(i);
      let cell: HeatCell = 'none';
      if (qid) {
        if (skippedSet.has(qid)) cell = 'skipped';
        else if (timedSet.has(qid)) cell = 'timedout';
        else if (answeredSet.has(qid)) cell = 'answered';
      }
      if (i === battle.current && battle.status === QUIZ_LIVE && cell === 'none') {
        cell = 'current';
      }
      overall.push(cell);
    }
    return { uid: p.uid, name: p.name || 'Player', score: p.score, overall };
  });

  return { rows, from, to };
}

export function formatDuration(ms?: number | null): string {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export function battleSortKey(battle: CommandBattle): number {
  const statusRank = [QUIZ_LIVE, QUIZ_STARTING, QUIZ_PAUSED, QUIZ_READY, QUIZ_WAITING];
  const rank = statusRank.indexOf(battle.status);
  return rank < 0 ? 99 : rank;
}