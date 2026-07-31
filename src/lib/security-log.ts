import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/lib/constants';

export type SecurityEventType =
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'invalid_token'
  | 'unauthorized_access'
  | 'session_replaced'
  | 'duplicate_session'
  | 'suspicious_reconnect'
  | 'battle_join_denied'
  | 'rate_limited'
  | 'security_violation';

export interface SecurityEventEntry {
  event: SecurityEventType;
  actor: string;
  actorRole?: string;
  target?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}

const failureThrottle = new Map<string, number>();
const THROTTLE_WINDOW_MS = 60_000;

export async function recordSecurityEvent(entry: SecurityEventEntry): Promise<void> {
  try {
    await getAdminDb().collection(COLLECTIONS.SECURITY_LOGS).add({
      event: entry.event,
      actor: entry.actor || 'anonymous',
      actorRole: entry.actorRole ?? null,
      target: entry.target ?? null,
      detail: entry.detail ?? null,
      metadata: entry.metadata ?? null,
      timestamp: Date.now(),
      createdAt: Timestamp.now(),
    });
  } catch (err) {
    console.error('[SecurityLog] write failed:', err);
  }
}

export function logAuthFailure(key: string, detail: string): void {
  const now = Date.now();
  const last = failureThrottle.get(key);
  if (last && now - last < THROTTLE_WINDOW_MS) return;
  failureThrottle.set(key, now);
  if (failureThrottle.size > 5000) {
    for (const [k, t] of failureThrottle) {
      if (now - t > THROTTLE_WINDOW_MS) failureThrottle.delete(k);
    }
  }
  void recordSecurityEvent({ event: 'invalid_token', actor: 'anonymous', detail });
}

const violationThrottle = new Map<string, number>();
const VIOLATION_WINDOW_MS = 60_000;

export function logSecurityViolation(
  actor: string,
  kind: string,
  detail: string,
  metadata?: Record<string, unknown>
): void {
  const now = Date.now();
  const key = `${actor}:${kind}`;
  const last = violationThrottle.get(key);
  if (last && now - last < VIOLATION_WINDOW_MS) return;
  violationThrottle.set(key, now);
  if (violationThrottle.size > 5000) {
    for (const [k, t] of violationThrottle) {
      if (now - t > VIOLATION_WINDOW_MS) violationThrottle.delete(k);
    }
  }
  void recordSecurityEvent({
    event: 'security_violation',
    actor: actor || 'anonymous',
    detail: `${kind}: ${detail}`,
    metadata,
  });
}
