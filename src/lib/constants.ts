export const ROLES = ['executive', 'commander', 'gladiator'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_EXECUTIVE: Role = 'executive';
export const ROLE_COMMANDER: Role = 'commander';
export const ROLE_GLADIATOR: Role = 'gladiator';

export const QUIZ_STATUSES = ['draft', 'waiting', 'ready', 'starting', 'live', 'paused', 'finished', 'archived'] as const;
export type QuizStatus = (typeof QUIZ_STATUSES)[number];
export const QUIZ_WAITING: QuizStatus = 'waiting';
export const QUIZ_READY: QuizStatus = 'ready';
export const QUIZ_STARTING: QuizStatus = 'starting';
export const QUIZ_LIVE: QuizStatus = 'live';
export const QUIZ_PAUSED: QuizStatus = 'paused';
export const QUIZ_FINISHED: QuizStatus = 'finished';
export const QUIZ_ARCHIVED: QuizStatus = 'archived';
export const QUIZ_DRAFT: QuizStatus = 'draft';

export const PARTICIPANT_STATUSES = ['playing', 'finished', 'blocked'] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];
export const PS_PLAYING: ParticipantStatus = 'playing';
export const PS_FINISHED: ParticipantStatus = 'finished';
export const PS_BLOCKED: ParticipantStatus = 'blocked';

export const BATTLE_MODES = ['synchronized', 'independent'] as const;
export type BattleMode = (typeof BATTLE_MODES)[number];
export const BATTLE_MODE_SYNCHRONIZED: BattleMode = 'synchronized';
export const BATTLE_MODE_INDEPENDENT: BattleMode = 'independent';

export const ALLOWED_QUIZ_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ['waiting'],
  waiting: ['ready', 'starting'],
  ready: ['waiting', 'starting'],
  starting: ['live', 'waiting'],
  live: ['paused', 'finished'],
  paused: ['live', 'finished'],
  finished: ['archived'],
  archived: [],
};

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
