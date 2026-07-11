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
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), 60000);
  }

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
    return {
      allowed: true,
      remaining: config.maxRequests - entry.timestamps.length,
      resetAt: now + config.windowMs,
    };
  }

  clear(key: string) {
    this.store.delete(key);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      entry.timestamps = entry.timestamps.filter(t => now - t < 120000);
      if (entry.timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }

  destroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }
}

export const rateLimiter = new SlidingWindowLimiter();

export const Limits = {
  LOGIN_PER_IP: { maxRequests: 5, windowMs: 60000, message: 'Too many login attempts. Please wait 1 minute.' },
  LOGIN_PER_EMAIL: { maxRequests: 5, windowMs: 60000, message: 'Too many login attempts for this account. Please wait 1 minute.' },
  SIGNUP_PER_IP: { maxRequests: 5, windowMs: 60000, message: 'Too many signup attempts. Please wait 1 minute.' },
  AI_API_PER_USER: { maxRequests: 10, windowMs: 60000, message: 'AI request limit reached (10/min). Please wait.' },
} as const;

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf;
  return '127.0.0.1';
}

export function buildRateLimitHeaders(result: { remaining: number; resetAt: number }) {
  return {
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
}
