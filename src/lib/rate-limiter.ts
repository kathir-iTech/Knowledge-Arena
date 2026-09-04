import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  message?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

// Firestore-backed fixed-window counters (Phase 115A).
//
// The previous implementation kept a per-instance in-memory Map of timestamps,
// which reset whenever a cold function instance spun up (or scaled down),
// weakening the limits exactly under load. This implementation persists one
// document per rate-limit key (`rate_limits/{key}`) and updates it with an
// atomic `runTransaction`, so every instance shares a single, distributed
// counter regardless of how many cold starts happen.
//
// Each doc stores: { windowStart, count, expiresAt }. The window is aligned to
// fixed wall-clock boundaries (floor(now / windowMs)), and `expiresAt` is set
// to the end of the current window so a Firestore TTL policy (field: `expiresAt`)
// can auto-prune stale counters and keep the collection from growing unbounded.
//
// For a trimmed-down list of reasons why the in-memory sliding-window semantics
// are NOT reproduced here:
//   - Sliding windows require storing an array of timestamps per key, which is
//     awkward and unbounded in a single Firestore doc; the standard distributed
//     primitive is a fixed-window (or token-bucket) count, which the spec asks for.
//   - Clients observe the resetAt/remaining headers; fixed-window still exposes
//     a meaningful `resetAt` (end of the current window).
//
// FAIL-OPEN: if Firestore is unreachable, we log a warning and allow the request
// (under-enforcing is preferable to blocking all traffic, which would be worse
// than the previous single-instance behavior). Production callers that need
// stricter protection can layer their own guards.
class FirestoreRateLimiter {
  async check(
    key: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = Math.floor(now / config.windowMs) * config.windowMs;
    const windowEnd = windowStart + config.windowMs;
    const db = getAdminDb();
    const ref = db.collection(COLLECTIONS.RATE_LIMITS).doc(key);

    try {
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : null;
        const stale = !data || typeof data.windowStart !== 'number' || now >= data.windowStart + config.windowMs;

        if (stale) {
          // Fresh window: either the doc is new, or a previous window expired.
          tx.set(ref, {
            windowStart,
            count: 1,
            expiresAt: windowEnd,
          });
          return {
            allowed: true,
            remaining: config.maxRequests - 1,
            resetAt: windowEnd,
          };
        }

        const count = typeof data.count === 'number' ? data.count : 0;
        if (count >= config.maxRequests) {
          return {
            allowed: false,
            remaining: 0,
            resetAt: data.windowStart + config.windowMs,
          };
        }

        tx.update(ref, {
          count: count + 1,
          expiresAt: windowEnd,
        });
        return {
          allowed: true,
          remaining: config.maxRequests - (count + 1),
          resetAt: windowEnd,
        };
      });

      return result;
    } catch (err) {
      console.warn(`[RateLimiter] Firestore unavailable; failing open for key "${key}":`, err);
      // Fail-open: allow the request, but report no meaningful limit to the client.
      return { allowed: true, remaining: Infinity, resetAt: 0 };
    }
  }

  async clear(key: string): Promise<void> {
    try {
      await getAdminDb().collection(COLLECTIONS.RATE_LIMITS).doc(key).delete();
    } catch (err) {
      console.warn(`[RateLimiter] clear failed for key "${key}":`, err);
    }
  }
}

export const rateLimiter = new FirestoreRateLimiter();

export const Limits = {
  LOGIN_PER_IP: { maxRequests: 5, windowMs: 60000, message: 'Too many login attempts. Please wait 1 minute.' },
  LOGIN_PER_EMAIL: { maxRequests: 5, windowMs: 60000, message: 'Too many login attempts for this account. Please wait 1 minute.' },
  SIGNUP_PER_IP: { maxRequests: 5, windowMs: 60000, message: 'Too many signup attempts. Please wait 1 minute.' },
  AI_API_PER_USER: { maxRequests: 10, windowMs: 60000, message: 'AI request limit reached (10/min). Please wait.' },
  BATTLE_ACTION_PER_USER: { maxRequests: 30, windowMs: 60000, message: 'Too many battle actions. Please slow down.' },
  SECURITY_LOG_PER_USER: { maxRequests: 10, windowMs: 60000, message: 'Too many security events. Please wait.' },
  AUDIT_WRITE_PER_USER: { maxRequests: 10, windowMs: 60000, message: 'Too many audit writes. Please slow down.' },
  MESSAGE_POST_PER_USER: { maxRequests: 20, windowMs: 60000, message: 'Too many messages. Please slow down.' },
  WRITE_PER_USER: { maxRequests: 15, windowMs: 60000, message: 'Too many operations. Please slow down.' },
  ADMIN_WRITE_PER_IP: { maxRequests: 10, windowMs: 60000, message: 'Too many account operations. Please wait.' },
  EXECUTIVE_EXPORT_PER_USER: { maxRequests: 5, windowMs: 60000, message: 'Export limit reached (5/min). Please wait.' },
  READ_PER_USER: { maxRequests: 30, windowMs: 60000, message: 'Too many requests. Please slow down.' },
  SEARCH_PER_USER: { maxRequests: 20, windowMs: 60000, message: 'Search rate limit reached (20/min). Please wait.' },
  AI_COPILOT_PER_USER: { maxRequests: 10, windowMs: 60000, message: 'Copilot rate limit exceeded (10/min). Please try again shortly.' },
  AI_MINDMAP_PER_USER: { maxRequests: 5, windowMs: 60000, message: 'Mind map rate limit exceeded (5/min). Please wait.' },
  AI_EXPLANATION_PER_USER: { maxRequests: 30, windowMs: 60000, message: 'Explanation rate limit exceeded (30/min). Please wait.' },
} as const;

export function getClientIp(req: Request): string {
  const vercel = req.headers.get('x-vercel-forwarded-for');
  if (vercel) return vercel.split(',')[0].trim();
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[0]; // leftmost trusted IP
  }
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  return '127.0.0.1';
}

export function buildRateLimitHeaders(result: { remaining: number; resetAt: number }) {
  const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return {
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
    'Retry-After': String(retryAfterSec),
  };
}

export async function enforceRateLimit(key: string, config: RateLimitConfig): Promise<NextResponse | null> {
  const result = await rateLimiter.check(key, config);
  if (result.allowed) return null;
  const headers = buildRateLimitHeaders(result);
  return NextResponse.json(
    {
      error: config.message ?? 'Rate limit exceeded.',
      retryAfter: parseInt(headers['Retry-After'], 10),
    },
    { status: 429, headers }
  );
}
