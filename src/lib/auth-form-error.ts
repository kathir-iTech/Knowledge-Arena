// SIH-26242 Part 1.1 / 1.2 — form errors travel as THROWN errors with their
// Firebase code attached, so the login form can render them inline (and react
// to specific codes) without ever touching the global authError takeover.
//
// Contract:
//   - login/signUp/signInWithGoogle/sendPasswordReset THROW; they never set the
//     global authError for an ordinary form problem.
//   - the caller (LoginForm) shows the message inline and keeps the form
//     mounted, preserving what the user typed (except passwords).
//   - authError stays reserved for true session-bootstrap failures
//     (session mint impossible after retries, project mismatch, profile
//     resolution failure) — see AuthContext.

/** Codes the form reacts to beyond plain copy. */
export const DUPLICATE_EMAIL_CODE = 'auth/email-already-in-use';
export const CREDENTIAL_ERROR_CODES = [
  'auth/invalid-credential',
  'auth/wrong-password',
  'auth/user-not-found',
] as const;
export const WEAK_PASSWORD_CODE = 'auth/weak-password';
export const INVALID_EMAIL_CODE = 'auth/invalid-email';
export const NETWORK_ERROR_CODE = 'auth/network-request-failed';
export const RATE_LIMIT_CODES = ['auth/too-many-requests', 'auth/ratelimit-exceeded'] as const;

/**
 * Build an Error carrying the Firebase code. Deliberately NOT a subclass —
 * `instanceof` on transpiled subclasses is fragile, and callers only need the
 * code.
 */
export function authFormError(message: string, code?: string | null): Error {
  const err = new Error(message) as Error & { code?: string };
  err.name = 'AuthFormError';
  if (code) err.code = code;
  return err;
}

/** Read the Firebase code off a thrown value (works for native errors too). */
export function getAuthErrorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' && code.length > 0 ? code : null;
}

export function isDuplicateEmailError(err: unknown): boolean {
  return getAuthErrorCode(err) === DUPLICATE_EMAIL_CODE;
}

export function isCredentialError(err: unknown): boolean {
  const code = getAuthErrorCode(err);
  return !!code && (CREDENTIAL_ERROR_CODES as readonly string[]).includes(code);
}

export function isRateLimitError(err: unknown): boolean {
  const code = getAuthErrorCode(err);
  if (!!code && (RATE_LIMIT_CODES as readonly string[]).includes(code)) return true;
  const message = err instanceof Error ? err.message : '';
  return /too many attempts|please wait|rate limit/i.test(message);
}
