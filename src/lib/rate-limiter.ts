import { NextResponse } from 'next/server';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  message?: string;
}

interface RateLimitEntry {
  timestamps: number[];
}

class SlidingWindowLimiter {
  private store = new Map<string, RateLimitEntry>();

  check(
    key: string,
    config: RateLimitConfig
  ): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    let entry = this.store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(key, entry);
    }

    entry.timestamps = entry.timestamps.filter(t => now - t < config.windowMs);

    if (entry.timestamps.length >= config.maxRequests) {
      const oldest = entry.timestamps[0];
      return {
        allowed: false,
        remaining: 0,
        resetAt: oldest + config.windowMs,
      };
    }

    entry.timestamps.push(now);
    if (this.store.size > 10000) {
      this.cleanup(now);
    }
    return {
      allowed: true,
      remaining: config.maxRequests - entry.timestamps.length,
      resetAt: now + config.windowMs,
    };
  }

  clear(key: string) {
    this.store.delete(key);
  }

  private cleanup(now: number) {
    for (const [key, entry] of this.store.entries()) {
      entry.timestamps = entry.timestamps.filter(t => now - t < 120000);
      if (entry.timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }
}

export const rateLimiter = new SlidingWindowLimiter();

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
    if (parts.length > 0) return parts[parts.length - 1];
  }
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  return '127.0.0.1';
}

export function buildRateLimitHeaders(result: { remaining: number; resetAt: number }) {
  return {
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
}

export function enforceRateLimit(key: string, config: RateLimitConfig): NextResponse | null {
  const result = rateLimiter.check(key, config);
  if (result.allowed) return null;
  return NextResponse.json(
    {
      error: config.message ?? 'Rate limit exceeded.',
      retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
    },
    { status: 429, headers: buildRateLimitHeaders(result) }
  );
}
