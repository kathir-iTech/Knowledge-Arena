// Safe ?next= destination handling for the login flow.
//
// Only same-origin, plain in-app paths are honoured. Absolute URLs
// (https://evil.com), scheme-relative "//host" values, protocol references
// (javascript:), and backslash tricks ("/\evil.com") are all rejected — the
// caller falls back to the role home instead.

export function sanitizeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  const value = next.trim();
  if (!value) return null;
  if (!value.startsWith('/')) return null; // absolute URL, javascript:, mailto: …
  if (value.startsWith('//')) return null; // scheme-relative
  if (value.includes('\\')) return null; // backslash URL confusions
  if (value.includes('..')) return null; // never allow parent traversal
  if (/[\u0000-\u001f\u007f]/.test(value)) return null; // control chars
  return value;
}

/**
 * Ownership-neutral ?next= allowlist (SIH-26242 Part 1.3).
 *
 * A `?next=` that survives the sanitizer is STILL only honoured when it points
 * at one of these prefixes — everything else (legacy Quorena portals, API
 * routes, admin internals that are not listed, any absolute path outside the
 * RPL app) falls back to the role home.
 *
 * A result page is NEVER a valid destination: `/rpl/declare/result?ref=…`
 * belongs to whichever worker created that reference code, so returning the
 * next signed-in user to it is exactly the 403 seen in the HAR capture.
 */
export const SAFE_NEXT_PREFIXES = [
  '/rpl',
  '/rpl/declare',
  '/rpl/status',
  '/rpl/profile',
  '/rpl/assessor',
  '/rpl/assess',
  '/rpl/consistency',
  '/rpl/admin',
] as const;

/** Split `path?query` into a normalized pathname (no trailing slash) + query. */
function splitPath(value: string): { pathname: string; query: string } {
  const q = value.indexOf('?');
  const rawPath = q === -1 ? value : value.slice(0, q);
  const query = q === -1 ? '' : value.slice(q + 1);
  const pathname = rawPath.replace(/\/+$/, '') || '/';
  return { pathname, query };
}

/** True when `value` points at someone else's declaration result page. */
export function isResultOrRefPath(value: string): boolean {
  const { pathname, query } = splitPath(value);
  if (pathname === '/rpl/declare/result') return true;
  return /(^|&)ref=/.test(query);
}

/**
 * Sanitize AND allowlist a `?next=` value. Returns the value only when it is
 * same-origin, inside the RPL allowlist and never a result/ref URL; otherwise
 * null (caller falls back to the role home).
 */
export function isAllowedNextPath(next: string | null | undefined): string | null {
  const value = sanitizeNextPath(next);
  if (!value) return null;
  if (isResultOrRefPath(value)) return null;
  const { pathname } = splitPath(value);
  const allowed = SAFE_NEXT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return allowed ? value : null;
}