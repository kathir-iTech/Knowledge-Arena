export const ROLES = ['executive', 'commander', 'gladiator'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_EXECUTIVE: Role = 'executive';
export const ROLE_COMMANDER: Role = 'commander';
export const ROLE_GLADIATOR: Role = 'gladiator';

export const QUIZ_STATUSES = ['draft', 'waiting', 'ready', 'starting', 'live', 'paused', 'finished', 'archived', 'abandoned'] as const;
export type QuizStatus = (typeof QUIZ_STATUSES)[number];
export const QUIZ_WAITING: QuizStatus = 'waiting';
export const QUIZ_READY: QuizStatus = 'ready';
export const QUIZ_STARTING: QuizStatus = 'starting';
export const QUIZ_LIVE: QuizStatus = 'live';
export const QUIZ_PAUSED: QuizStatus = 'paused';
export const QUIZ_FINISHED: QuizStatus = 'finished';
export const QUIZ_ARCHIVED: QuizStatus = 'archived';
export const QUIZ_DRAFT: QuizStatus = 'draft';
export const QUIZ_ABANDONED: QuizStatus = 'abandoned';

export const PARTICIPANT_STATUSES = ['playing', 'finished', 'blocked', 'flagged'] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];
export const PS_PLAYING: ParticipantStatus = 'playing';
export const PS_FINISHED: ParticipantStatus = 'finished';
export const PS_BLOCKED: ParticipantStatus = 'blocked';
export const PS_FLAGGED: ParticipantStatus = 'flagged';

export const BATTLE_MODES = ['synchronized', 'independent'] as const;
export type BattleMode = (typeof BATTLE_MODES)[number];
export const BATTLE_MODE_SYNCHRONIZED: BattleMode = 'synchronized';
export const BATTLE_MODE_INDEPENDENT: BattleMode = 'independent';

export const ALLOWED_QUIZ_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ['waiting'],
  waiting: ['ready', 'starting'],
  ready: ['waiting', 'starting'],
  starting: ['live', 'waiting'],
  live: ['paused', 'finished', 'abandoned'],
  paused: ['live', 'finished', 'abandoned'],
  finished: ['archived'],
  // Zombie-battle sweep (Phase 115B): 'abandoned' is terminal — an abandoned
  // battle cannot transition anywhere else.
  abandoned: [],
  archived: [],
};

// Zombie-battle threshold (Phase 115B): a 'live' arena with no question
// activity for this long is treated as abandoned and swept. Kept as a named
// constant rather than a magic number.
export const QUIZ_ABANDONED_AFTER_MS = 3 * 60 * 60 * 1000;

// Lobby (not-yet-started 'waiting' arena) staleness for the logout lock.
// A waiting room sitting idle far shorter than a live battle should release
// the logout lock: a Commander who created a lobby and walked away has no
// reason to trap a gladiator in the sidebar for hours. The generous
// QUIZ_ABANDONED_AFTER_MS above stays for genuinely live battles where a
// Commander may legitimately step away mid-session.
export const QUIZ_WAITING_ABANDONED_AFTER_MS = 30 * 60 * 1000;

export const DEFAULT_SCORE_MAX = 1000;
export const DEFAULT_SCORE_MIN = 100;
export const DEFAULT_WRONG_PENALTY = 0;
export const DEFAULT_SKIP_PENALTY = 0;
export const DEFAULT_TIME_DECAY = true;
export const DEFAULT_STREAK_MULTIPLIER = 0;
export const DEFAULT_TIME_LIMIT_SECONDS = 30;
export const DEFAULT_REQUIRE_ALL_READY = false;
export const STARTING_TRANSITION_MS = 4000;
export const PRESENCE_WINDOW_MS = 30000;
export const COMMANDER_PRESENCE_WINDOW_MS = 45000;
export const RECONNECT_SUSPICION_WINDOW_MS = 60000;
export const ANSWER_GRACE_MS = 3000;
export const ANSWER_VIOLATION_MARGIN_MS = 15000;
export const SUBMIT_CLOCK_SKEW_TOLERANCE_MS = 5000;

export const COLLECTIONS = {
  USERS: 'users',
  QUIZZES: 'quizzes',
  PARTICIPANTS: 'participants',
  QUESTIONS: 'questions',
  ANSWER_KEYS: 'answerKeys',
  SUBMISSIONS: 'submissions',
  AUDIT_LOGS: 'auditLogs',
  NOTIFICATIONS: 'notifications',
  EXECUTIVE_REQUESTS: 'executive_requests',
  QUESTION_BANK: 'question_bank',
  CONVERSATIONS: 'conversations',
  MESSAGES: 'messages',
  ANNOUNCEMENTS: 'announcements',
  AI_LOGS: 'ai_logs',
  BATTLE_LOGS: 'battle_logs',
  SECURITY_LOGS: 'security_logs',
  PLATFORM_SETTINGS: 'platform_settings',
  REQUEST_RESPONSES: 'responses',
  // Gated arena internals (scoring_config, skipped_question_ids). A single
  // 'settings' doc lives in this subcollection so pre-join readers of the
  // parent quiz doc never see scoring or internal question state.
  QUIZ_CONFIG: 'config',
  // Distributed rate-limit counters (Phase 115A). One doc per rate-limit key;
  // fields { windowStart, count, expiresAt }. TTL on expiresAt auto-purges
  // stale counters so the collection does not grow unbounded.
  RATE_LIMITS: 'rate_limits',
  // Async AI-forge job pipeline (Phase 115C). Jobs and their payload subdocs
  // are written exclusively by the Admin SDK (worker ticks + cron); the rules
  // lock these collections so clients can never read or write them directly.
  AI_JOBS: 'ai_jobs',
  FORGE_CACHE: 'forge_cache',
} as const;

// Doc id of the single arena-internals document inside the config
// subcollection (quizzes/{quizId}/config/settings).
export const QUIZ_CONFIG_SETTINGS_DOC = 'settings';

export const NOTIFICATION_TYPES = [
  'commander_request',
  'gladiator_registration',
  'battle_completed',
  'ai_import_completed',
  'new_announcement',
  'new_message',
  'operation_failed',
  'system_warning',
  'ownership_transferred',
  'new_arena',
  'arena_created',
  'commander_created',
  'commander_disabled',
  'commander_enabled',
  'password_reset',
  'question_added',
  'question_deleted',
  'arena_started',
  'arena_completed',
  'student_joined',
  'student_kicked',
  'student_unblocked',
  'settings_updated',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const MAX_BATCH_OPS = 500;
export const ROOM_CODE_RETRIES = 5;
export const ROOM_CODE_LENGTH = 6;
export const MAX_ATTACHMENTS_PER_REQUEST = 10;
export const MAX_PER_FILE_SIZE_BYTES = 500 * 1024;
export const MAX_TOTAL_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_FILENAME_LENGTH = 120;
export const DEFAULT_PAGE_LIMIT = 100;
export const DEFAULT_QUERY_LIMIT = 1000;
export const MIN_SEARCH_LENGTH = 2;

export const SCORE_BASE = 500;
export const SCORE_TIMED_BONUS = 500;
export const DEFAULT_TIMER_SECONDS = 30;

export const MIN_TITLE_LENGTH = 3;
export const MIN_QUESTIONS = 1;
export const MIN_QUESTION_LENGTH = 5;
export const MAX_QUESTION_LENGTH = 500;
export const MIN_OPTION_LENGTH = 1;
export const MAX_OPTION_LENGTH = 200;

export const STAFF_EMAIL_DOMAIN = 'knowledgearena.app';

// ── Async AI Forge job pipeline (Phase 115C) ─────────────────────────
// The production failure (504 FUNCTION_INVOCATION_TIMEOUT) happens because a
// single Gemini generation for a large/scanned document can take 20–40s+, and
// Vercel caps a single function invocation at `maxDuration` (30s on the old
// config; 60s Hobby ceiling now). Instead of one long blocking server action,
// generation is decomposed into quota-aware "ticks": each tick makes exactly
// ONE Gemini call and stays well inside the invocation ceiling, and the job
// state (cursor, progress, accumulated questions) lives in Firestore so work
// can resume across invocations even if the tab is closed (cron worker).
// All of this is $0: Vercel Hobby + Firebase Spark + free Gemini keys.
export const AI_JOB_STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'] as const;
export type AiJobStatus = (typeof AI_JOB_STATUSES)[number];
export const AI_JOB_QUEUED: AiJobStatus = 'queued';
export const AI_JOB_RUNNING: AiJobStatus = 'running';
export const AI_JOB_DONE: AiJobStatus = 'done';
export const AI_JOB_FAILED: AiJobStatus = 'failed';
export const AI_JOB_CANCELLED: AiJobStatus = 'cancelled';

// Max questions generated in a single vision tick. Vision calls carry every
// image (scanned pages) so each call is heavier than plain text; keeping the
// per-tick question budget small bounds per-tick latency. Text-only ticks use
// the same budget for a predictable, chunked pacing.
export const FORGE_TICK_QA = 5;

// Text window fed to Gemini per text tick (matches MAX_CHUNK in the flow).
export const FORGE_TEXT_CHUNK = 40000;

// After this many consecutive failed ticks the job is marked 'failed'.
export const FORGE_MAX_CONSECUTIVE_FAILURES = 4;

// Backoff when a tick fails (quota or timeout) — the next tick is not
// attemptable until now + backoff.
export const FORGE_QUOTA_BACKOFF_MS = 60 * 1000;
export const FORGE_TIMEOUT_BACKOFF_MS = 20 * 1000;
export const FORGE_GENERIC_BACKOFF_MS = 10 * 1000;

// Lease for the single-writer guarantee: a job can only be ticked by one
// caller at a time. Busy callers receive retryAfterMs; after LEASE_STALE_MS
// a fresh worker may reclaim the lease (crash recovery without a stuck job).
export const FORGE_LEASE_MS = 55 * 1000;
export const FORGE_LEASE_STALE_MS = 3 * 60 * 1000;

// Absolute cap on tick count so a model that repeatedly under-delivers cannot
// spin forever. When reached the job finalizes with whatever was generated.
export const FORGE_MAX_TICKS = 40;

// Jobs and cache documents are deleted after this long (data-URI images and
// question blobs are large; results are preserved in ai_logs + forge_cache).
export const FORGE_JOB_TTL_MS = 6 * 60 * 60 * 1000;
export const FORGE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Firestore payload docs hold text/image parts (each well under the 1 MiB
// document ceiling even with heavy UTF-8 content).
export const FORGE_PAYLOAD_TEXT_PART = 200000;
