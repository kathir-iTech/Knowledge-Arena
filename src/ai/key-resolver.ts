/**
 * Central Gemini API key resolver — multi-key rotation with quota-aware cooldown.
 *
 * Design goals:
 * - Reads a comma-separated list from GEMINI_API_KEYS (plural). Falls back to
 *   legacy single-key vars for backward compatibility (one configured key = no behavior change).
 * - Exposes getGeminiApiKey(scope?) / getGeminiClient(scope?) with round-robin and 429 cooldown.
 * - Tracks which keys recently hit 429 in-memory (per instance) and skips them for
 *   retryDelay if provided, otherwise 60s default.
 * - If ALL keys are in cooldown, waits bounded (max 15s) for the shortest remaining cooldown,
 *   otherwise fails fast with a clear "all AI capacity exhausted" error — never hangs indefinitely.
 * - Accepts optional scope param for future per-client key assignment (resolver-internals change only).
 */

const DEFAULT_COOLDOWN_MS = 60_000;
const MAX_WAIT_MS = 15_000;

/** Env vars checked for a single legacy key (fallback order). */
const SINGLE_KEY_VARS = [
  'GEMINI_API_KEYS', // plural single-value case is handled first as list
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_GENAI_API_KEY',
] as const;

let cachedKeys: string[] | null = null;
let roundRobinIndex = 0;
/** apiKey -> cooldown expiry timestamp (ms since epoch) */
const cooldowns = new Map<string, number>();

function parseKeysFromEnv(): string[] {
  // Prefer plural comma-separated list. Trim, drop empties, dedupe.
  const rawPlural = process.env.GEMINI_API_KEYS?.trim();
  if (rawPlural) {
    const parts = rawPlural
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    if (parts.length > 0) {
      // Dedupe preserve order
      return [...new Set(parts)];
    }
  }
  // Fallback to single-key vars (first set wins; but also collect all set? spec says one key fallback)
  // For backward compat if only one is set, return that single key.
  // Also if multiple legacy vars are set (edge), prefer GOOGLE_GENERATIVE_AI_API_KEY first.
  const legacyOrder: string[] = [
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
    process.env.GEMINI_API_KEY || '',
    process.env.GOOGLE_API_KEY || '',
    process.env.GOOGLE_GENAI_API_KEY || '',
  ];
  const found = legacyOrder.map((k) => k.trim()).filter((k) => k.length > 0);
  if (found.length > 0) {
    // Dedupe
    return [...new Set(found)];
  }
  return [];
}

export function getConfiguredKeys(): string[] {
  if (cachedKeys === null) {
    cachedKeys = parseKeysFromEnv();
  }
  return [...cachedKeys];
}

/** For tests / env reload (called internally only). */
export function _resetKeyResolverForTesting(): void {
  cachedKeys = null;
  roundRobinIndex = 0;
  cooldowns.clear();
}

export function getKeyCount(): number {
  return getConfiguredKeys().length;
}

export function hasKeys(): boolean {
  return getKeyCount() > 0;
}

export function getKeyHealth(): Array<{ index: number; preview: string; inCooldown: boolean; cooldownRemainingMs: number }> {
  const now = Date.now();
  const keys = getConfiguredKeys();
  return keys.map((k, i) => {
    const expiry = cooldowns.get(k);
    const inCooldown = expiry !== undefined && expiry > now;
    return {
      index: i,
      preview: k.length > 8 ? `${k.slice(0, 4)}…${k.slice(-4)}` : '****',
      inCooldown,
      cooldownRemainingMs: inCooldown ? expiry! - now : 0,
    };
  });
}

export function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const status = (err as Record<string, unknown>)?.status;
  const statusStr = String(status ?? '');
  // Check structured fields if present
  if (statusStr === '429' || status === 429) return true;
  const lower = msg.toLowerCase();
  // Also check raw details if present
  const anyErr = err as Record<string, unknown>;
  const detailsStr = (() => {
    try {
      const raw = (anyErr?.details ?? anyErr?.rawResponse ?? anyErr?.response) as unknown;
      if (!raw) return '';
      return JSON.stringify(raw).toLowerCase();
    } catch {
      return '';
    }
  })();
  const combined = lower + ' ' + detailsStr;
  return (
    combined.includes('429') ||
    combined.includes('resource_exhausted') ||
    combined.includes('resource exhausted') ||
    combined.includes('quota') ||
    combined.includes('rate limit') ||
    combined.includes('rate_limit') ||
    combined.includes('too many requests')
  );
}

export function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('403') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('API key') ||
    msg.includes('not authorized') ||
    msg.includes('UNAUTHENTICATED') ||
    msg.includes('API_KEY_INVALID')
  );
}

/**
 * Parse Google's retryDelay from an error object.
 * Google returns details like [{ "@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"35s" }]
 * or error.details.retryDelay, or header-like. We best-effort extract seconds.
 */
export function parseRetryDelayMs(err: unknown): number | null {
  const anyErr = err as Record<string, unknown>;
  const candidates: unknown[] = [
    (anyErr as Record<string, unknown>)?.retryDelay,
    (anyErr as Record<string, unknown>)?.retry_delay,
    // nested details array
    (anyErr as Record<string, unknown>)?.details,
    (anyErr as Record<string, unknown>)?.rawResponse,
    (anyErr as Record<string, unknown>)?.response,
    (anyErr as Record<string, unknown>)?.cause,
  ];

  // Also try to parse from message like "retry after 32s" or "retryDelay": "35s"
  const msg = err instanceof Error ? err.message : String(err);
  const msgMatch = msg.match(/retry\D*?(\d+)\s*s/i);
  if (msgMatch) {
    const sec = parseInt(msgMatch[1], 10);
    if (!isNaN(sec) && sec > 0 && sec < 600) return sec * 1000;
  }

  for (const cand of candidates) {
    if (!cand) continue;
    // Direct string like "35s"
    if (typeof cand === 'string') {
      const m = cand.match(/(\d+)\s*s/);
      if (m) {
        const sec = parseInt(m[1], 10);
        if (!isNaN(sec)) return sec * 1000;
      }
      // numeric ms
      const n = parseInt(cand, 10);
      if (!isNaN(n) && n > 0) return n;
    }
    if (typeof cand === 'object') {
      try {
        const json = JSON.stringify(cand);
        const m = json.match(/"retryDelay"\s*:\s*"(\d+)(?:\.\d+)?s"/i);
        if (m) {
          const sec = parseInt(m[1], 10);
          if (!isNaN(sec)) return sec * 1000;
        }
        const m2 = json.match(/retryDelay[^0-9]*(\d+)\s*s/i);
        if (m2) {
          const sec = parseInt(m2[1], 10);
          if (!isNaN(sec)) return sec * 1000;
        }
        // array details search
        if (Array.isArray(cand)) {
          for (const item of cand) {
            if (item && typeof item === 'object') {
              const inner = (item as Record<string, unknown>).retryDelay;
              if (typeof inner === 'string') {
                const mm = inner.match(/(\d+)\s*s/);
                if (mm) {
                  const sec = parseInt(mm[1], 10);
                  if (!isNaN(sec)) return sec * 1000;
                }
              }
            }
          }
        } else {
          const obj = cand as Record<string, unknown>;
          if (typeof obj.retryDelay === 'string') {
            const mm = (obj.retryDelay as string).match(/(\d+)\s*s/);
            if (mm) {
              const sec = parseInt(mm[1], 10);
              if (!isNaN(sec)) return sec * 1000;
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }
  return null;
}

export function markKeyCooldown(apiKey: string, retryDelayMs?: number | null): void {
  const delay = retryDelayMs && retryDelayMs > 0 && retryDelayMs < 300_000 ? retryDelayMs : DEFAULT_COOLDOWN_MS;
  const expiry = Date.now() + delay;
  cooldowns.set(apiKey, expiry);
  console.warn(`[KeyResolver] Key ${previewKey(apiKey)} hit quota — cooling down for ${Math.round(delay / 1000)}s`);
}

function previewKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function isKeyInCooldown(key: string, now: number): boolean {
  const expiry = cooldowns.get(key);
  if (expiry === undefined) return false;
  if (expiry <= now) {
    cooldowns.delete(key);
    return false;
  }
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Resolve the next available Gemini API key, respecting round-robin and cooldown.
 * @param scope - optional context for future per-client key assignment (unused today, reserved).
 * @throws if no keys configured or all keys are in cooldown beyond bounded wait.
 */
export async function getGeminiApiKey(scope?: string): Promise<string> {
  // scope is reserved for future use — currently ignored but part of signature.
  void scope;
  const keys = getConfiguredKeys();
  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEY_MISSING: No Gemini API keys configured. Set GEMINI_API_KEYS or GOOGLE_GENERATIVE_AI_API_KEY.');
  }

  const now = Date.now();

  // Clean expired cooldowns
  for (const k of keys) {
    isKeyInCooldown(k, now); // cleans if expired
  }

  // Try round-robin to find a non-cooldown key.
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const idx = (roundRobinIndex + attempt) % keys.length;
    const candidate = keys[idx];
    if (!isKeyInCooldown(candidate, Date.now())) {
      roundRobinIndex = (idx + 1) % keys.length;
      return candidate;
    }
  }

  // All keys in cooldown — compute shortest remaining.
  let minRemaining = Infinity;
  for (const k of keys) {
    const expiry = cooldowns.get(k)!;
    const remaining = expiry - Date.now();
    if (remaining < minRemaining) minRemaining = remaining;
  }

  if (!isFinite(minRemaining) || minRemaining <= 0) {
    // Should not happen, but fallback to fastest fail
    throw new Error('ALL_GEMINI_KEYS_EXHAUSTED: All AI capacity exhausted, try again shortly.');
  }

  // Bounded wait: if shortest cooldown is within MAX_WAIT_MS, wait for it.
  if (minRemaining <= MAX_WAIT_MS) {
    console.warn(`[KeyResolver] All ${keys.length} keys in cooldown — waiting ${Math.round(minRemaining / 1000)}s for shortest cooldown (bounded ${MAX_WAIT_MS / 1000}s max).`);
    await sleep(Math.min(minRemaining, MAX_WAIT_MS));
    // After wait, re-evaluate — pick the key with smallest remaining now (likely just expired)
    const after = Date.now();
    let bestKey: string | null = null;
    let bestRemaining = Infinity;
    for (const k of keys) {
      const expiry = cooldowns.get(k);
      if (expiry === undefined || expiry <= after) {
        // expired — use immediately
        bestKey = k;
        break;
      }
      const rem = expiry - after;
      if (rem < bestRemaining) {
        bestRemaining = rem;
        bestKey = k;
      }
    }
    if (bestKey) {
      // Advance round robin to after this key
      const idx = keys.indexOf(bestKey);
      roundRobinIndex = (idx + 1) % keys.length;
      // If still in cooldown, we waited bounded time but still not expired — treat as exhausted
      if (isKeyInCooldown(bestKey, after) && bestRemaining > 1000) {
        // Still cooling — fail fast rather than hang longer
        const sec = Math.ceil(bestRemaining / 1000);
        throw new Error(`ALL_GEMINI_KEYS_EXHAUSTED: All AI capacity exhausted. Retry after ~${sec}s.`);
      }
      return bestKey;
    }
  }

  // Cooldown remaining exceeds bounded wait — fail fast.
  const sec = Math.ceil(minRemaining / 1000);
  throw new Error(`ALL_GEMINI_KEYS_EXHAUSTED: All AI capacity exhausted — all ${keys.length} keys are cooling down. Try again in ~${sec}s (shortest cooldown).`);
}

/** Alias for getGeminiApiKey — matches spec's suggested name. */
export async function getGeminiClient(scope?: string): Promise<string> {
  return getGeminiApiKey(scope);
}

/**
 * Execute an operation with automatic key rotation on quota errors.
 * Tries each configured key at most once. Non-quota errors are thrown immediately (no rotation).
 * @param operation - function that receives an apiKey and performs the Gemini call.
 * @param scope - optional context/scope for future per-client assignment.
 */
export async function withGeminiKeyRotation<T>(
  operation: (apiKey: string) => Promise<T>,
  scope?: string
): Promise<T> {
  const keys = getConfiguredKeys();
  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEY_MISSING: No Gemini API keys configured.');
  }

  const tried = new Set<string>();
  let lastQuotaError: unknown = null;

  // Try up to keys.length distinct keys
  for (let i = 0; i < keys.length; i++) {
    let apiKey: string;
    try {
      apiKey = await getGeminiApiKey(scope);
    } catch (e) {
      // If we already have a quota error and getGeminiApiKey says exhausted, surface combined error
      if (lastQuotaError) throw lastQuotaError;
      throw e;
    }

    if (tried.has(apiKey)) {
      // Avoid infinite loop if resolver returns same key due to single-key mode
      if (tried.size >= keys.length) break;
      // If single key, don't loop forever — break after one try
      if (keys.length === 1) {
        try {
          return await operation(apiKey);
        } catch (err) {
          if (isAuthError(err)) {
            markKeyCooldown(apiKey, 24 * 60 * 60 * 1000);
            throw new Error(`GEMINI_AUTH_FAILED: Invalid API key. Check GEMINI_API_KEYS. Raw: ${err instanceof Error ? err.message : String(err)}`);
          }
          if (isQuotaError(err)) {
            const delay = parseRetryDelayMs(err) ?? DEFAULT_COOLDOWN_MS;
            markKeyCooldown(apiKey, delay);
            const sec = Math.ceil(delay / 1000);
            throw new Error(`GEMINI_QUOTA_EXCEEDED: AI generation quota exhausted. Retry after ~${sec}s. Raw: ${err instanceof Error ? err.message : String(err)}`);
          }
          throw err;
        }
      }
      continue;
    }
    tried.add(apiKey);

    try {
      const result = await operation(apiKey);
      return result;
    } catch (err) {
      lastQuotaError = err;
      if (isAuthError(err)) {
        markKeyCooldown(apiKey, 24 * 60 * 60 * 1000);
        if (tried.size >= keys.length) {
          throw new Error(`GEMINI_AUTH_FAILED: Invalid API key ${previewKey(apiKey)}. Check GEMINI_API_KEYS. Last error: ${err instanceof Error ? err.message : String(err)}`);
        }
        console.warn(`[KeyResolver] Auth failure on ${previewKey(apiKey)} — rotating to next key (${tried.size}/${keys.length} tried).`);
        continue;
      }
      if (isQuotaError(err)) {
        const delay = parseRetryDelayMs(err) ?? DEFAULT_COOLDOWN_MS;
        markKeyCooldown(apiKey, delay);
        if (tried.size >= keys.length) {
          const sec = Math.ceil(delay / 1000);
          // All keys tried and all hit quota
          throw new Error(`ALL_GEMINI_KEYS_EXHAUSTED: All ${keys.length} Gemini keys exhausted. Retry after ~${sec}s. Last error: ${err instanceof Error ? err.message : String(err)}`);
        }
        // Try next key
        console.warn(`[KeyResolver] Quota on ${previewKey(apiKey)} — rotating to next key (${tried.size}/${keys.length} tried).`);
        continue;
      }
      // Non-quota, non-auth error — do not rotate
      throw err;
    }
  }

  if (lastQuotaError) throw lastQuotaError;
  throw new Error('ALL_GEMINI_KEYS_EXHAUSTED: All AI capacity exhausted.');
}

/** Convenience: synchronous check without throwing. */
export function tryGetGeminiApiKeySync(scope?: string): string | null {
  void scope;
  const keys = getConfiguredKeys();
  if (keys.length === 0) return null;
  const now = Date.now();
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const idx = (roundRobinIndex + attempt) % keys.length;
    const candidate = keys[idx];
    if (!isKeyInCooldown(candidate, now)) return candidate;
  }
  return null;
}
