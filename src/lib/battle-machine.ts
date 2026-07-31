import {
  ALLOWED_QUIZ_TRANSITIONS,
  DEFAULT_SCORE_MAX,
  DEFAULT_SCORE_MIN,
  DEFAULT_TIME_DECAY,
  DEFAULT_WRONG_PENALTY,
  DEFAULT_SKIP_PENALTY,
  QUIZ_WAITING,
  QUIZ_READY,
  QUIZ_STARTING,
  QUIZ_LIVE,
  QUIZ_PAUSED,
  QUIZ_FINISHED,
  QUIZ_ARCHIVED,
} from './constants';

export function canTransitionQuiz(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_QUIZ_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

export function assertQuizTransition(from: string, to: string): void {
  if (!canTransitionQuiz(from, to)) {
    throw new Error(`Invalid battle state transition: ${from} → ${to}`);
  }
}

export function canJoinArena(status: string): boolean {
  return status === QUIZ_WAITING || status === QUIZ_READY;
}

export function canSubmitAnswer(status: string): boolean {
  return status === QUIZ_LIVE;
}

export function isBattleActive(status: string): boolean {
  return status === QUIZ_STARTING || status === QUIZ_LIVE || status === QUIZ_PAUSED;
}

export function isBattleTerminal(status: string): boolean {
  return status === QUIZ_FINISHED || status === QUIZ_ARCHIVED;
}

export interface ScoringConfig {
  score_max: number;
  score_min: number;
  wrong_penalty: number;
  skip_penalty: number;
  time_decay: boolean;
}

export function normalizeScoringConfig(
  raw: Partial<ScoringConfig> | null | undefined
): ScoringConfig {
  return {
    score_max: Math.max(0, raw?.score_max ?? DEFAULT_SCORE_MAX),
    score_min: Math.max(0, raw?.score_min ?? DEFAULT_SCORE_MIN),
    wrong_penalty: Math.max(0, raw?.wrong_penalty ?? DEFAULT_WRONG_PENALTY),
    skip_penalty: Math.max(0, raw?.skip_penalty ?? DEFAULT_SKIP_PENALTY),
    time_decay: raw?.time_decay ?? DEFAULT_TIME_DECAY,
  };
}

export function timeFractionOf(elapsedMs: number, timeLimitMs: number): number {
  if (timeLimitMs <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - elapsedMs / timeLimitMs));
}

export function computeCorrectScore(
  config: ScoringConfig,
  elapsedMs: number,
  timeLimitMs: number
): number {
  const fraction = timeFractionOf(elapsedMs, timeLimitMs);
  if (!config.time_decay || config.score_max <= config.score_min) {
    return config.score_max;
  }
  return Math.round(config.score_max - (1 - fraction) * (config.score_max - config.score_min));
}

export function shuffledOrder<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function buildOptionShuffle(
  questionIds: readonly string[],
  optionCount: number,
  rng: () => number = Math.random
): Record<string, number[]> {
  const map: Record<string, number[]> = {};
  for (const qid of questionIds) {
    const indices = Array.from({ length: optionCount }, (_, i) => i);
    map[qid] = shuffledOrder(indices, rng);
  }
  return map;
}

export function applyOptionShuffle(options: readonly string[], permutation: number[]): string[] {
  if (!permutation || permutation.length !== options.length) return [...options];
  return permutation.map(i => options[i]);
}

export function invertPermutation(perm: number[]): number[] {
  const inverse: number[] = new Array(perm.length);
  for (let i = 0; i < perm.length; i++) {
    inverse[perm[i]] = i;
  }
  return inverse;
}
