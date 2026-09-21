import { getAdminAuth } from '@/lib/firebase-admin';
import type { DecodedIdToken } from 'firebase-admin/auth';

export const SESSION_COOKIE_NAME = '__session';
export const SESSION_COOKIE_MAX_AGE_MS = 60 * 60 * 1000;
// Next.js cookies.set() maxAge is SECONDS; Admin SDK createSessionCookie
// expiresIn is MILLISECONDS. The old code passed the ms value as maxAge
// (≈41-day cookie against a 1-hour Firebase expiry).
export const SESSION_COOKIE_MAX_AGE_S = 60 * 60;
export const SESSION_COOKIE_EXPIRES_IN_MS = 60 * 60 * 1000;

export async function createSessionCookie(idToken: string): Promise<string> {
  return getAdminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_COOKIE_EXPIRES_IN_MS,
  });
}

export async function verifySessionCookie(
  cookie: string,
  checkRevoked = true,
): Promise<DecodedIdToken> {
  return getAdminAuth().verifySessionCookie(cookie, checkRevoked);
}

export interface SessionCookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  maxAge?: number;
  path?: string;
}

export function cookieOptions(opts: SessionCookieOptions = {}): Record<string, string | number | boolean> {
  return {
    httpOnly: opts.httpOnly ?? true,
    secure: opts.secure ?? true,
    sameSite: opts.sameSite ?? 'Lax',
    maxAge: opts.maxAge ?? SESSION_COOKIE_MAX_AGE_S,
    path: opts.path ?? '/',
  };
}
