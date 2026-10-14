/**
 * Shared RPL API failure -> user-facing message mapping (SIH-26242 Part 3).
 *
 * Every RPL API route returns a JSON body of `{ error: string }` with:
 *   - 401 when the caller is unauthenticated (session/ID token missing or expired)
 *   - 403 when the caller is authenticated but not allowed (role / not-my-record)
 *
 * Pages used to surface whatever string the server sent (i.e. the raw word
 * "Unauthorized"), which is not a state a user can act on. This helper gives
 * every page the SAME explicit 401 and 403 states, and falls back to the
 * server's message (or the caller's own fallback) for anything else.
 *
 * Framework-free on purpose so it is trivially unit-testable and usable from
 * any client page.
 */

/** Text shown for every 401 across the RPL surfaces. */
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';

/** Text shown for every 403 across the RPL surfaces. */
export const FORBIDDEN_MESSAGE = 'You do not have access to this.';

/**
 * Turn a failed RPL API response into the message to render.
 *
 * @param status   HTTP status of the failed response (0/NaN => network failure).
 * @param bodyError the `error` field the server returned, if any.
 * @param fallback caller-specific message used when the server sent no message.
 */
export function rplErrorMessage(status: number, bodyError: unknown, fallback: string): string {
  if (status === 401) return SESSION_EXPIRED_MESSAGE;
  if (status === 403) return FORBIDDEN_MESSAGE;
  if (typeof bodyError === 'string' && bodyError.trim().length > 0) return bodyError;
  return fallback;
}

/** True when a failed response means "your session is gone" (401). */
export function isSessionExpired(status: number): boolean {
  return status === 401;
}
