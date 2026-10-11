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