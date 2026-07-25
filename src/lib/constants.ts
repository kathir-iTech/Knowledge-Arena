export const ROLES = ['executive', 'commander', 'gladiator'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_EXECUTIVE: Role = 'executive';
export const ROLE_COMMANDER: Role = 'commander';
export const ROLE_GLADIATOR: Role = 'gladiator';

export const QUIZ_STATUSES = ['draft', 'waiting', 'live', 'finished'] as const;
export type QuizStatus = (typeof QUIZ_STATUSES)[number];
export const QUIZ_WAITING: QuizStatus = 'waiting';
export const QUIZ_LIVE: QuizStatus = 'live';
export const QUIZ_FINISHED: QuizStatus = 'finished';
export const QUIZ_DRAFT: QuizStatus = 'draft';

export const PARTICIPANT_STATUSES = ['playing', 'finished', 'blocked'] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];
export const PS_PLAYING: ParticipantStatus = 'playing';
export const PS_FINISHED: ParticipantStatus = 'finished';
export const PS_BLOCKED: ParticipantStatus = 'blocked';

export const ALLOWED_QUIZ_TRANSITIONS: Record<string, string[]> = {
  draft: ['waiting'],
  waiting: ['live'],
  live: ['finished'],
  finished: [],
};

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
} as const;

export const NOTIFICATION_TYPES = [
  'commander_request',
  'gladiator_registration',
  'battle_completed',
  'ai_import_completed',
  'new_announcement',
  'new_message',
  'operation_failed',
  'system_warning',
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
