import { SUBMIT_CLOCK_SKEW_TOLERANCE_MS } from '@/lib/constants';

// HMAC submission signing (audit Phase 1 / API defense).
//
// Every /api/battle/submit payload is bound to the participant's per-battle
// session secret (`session_token` on the participant doc, minted client-side
// at join and mirrored into sessionStorage). The signature uses Web Crypto so
// the SAME code path runs in the browser (to sign) and on the server (Node 20+
// global crypto.subtle, to verify).
//
// Security model — be explicit about what this layer does and does not do:
//   * It is a payload-INTEGRITY + replay-detection layer, not a
//     zero-knowledge/anti-self-cheat primitive. A gladiator who controls their
//     own session token can always produce a valid signature for THEIR OWN
//     session — that is expected and unavoidable in a stateless web client.
//   * What it genuinely stops: cross-account replay of captured packets
//     (a captured {quizId,questionId,selected_option,nonce,sig} can be replayed
//     by a different user, or modified, and will fail verification because the
//     key is session/participant-bound and the signature is bound to the exact
//     payload); tampered payloads are rejected AND logged as a security
//     violation before any write occurs.
//   * The hard anti-cheat boundary stays server-side: live-only acceptance,
//     server-verified current-question binding, one-shot idempotency, mandatory
//     freshness window, and Admin-SDK-only writes (client rules deny direct
//     submission writes).

export interface SubmissionPayload {
  quizId: string;
  questionId: string;
  selectedOption: number;
  /** Per-submit random value — binds the signature to one exact payload. */
  nonce: string;
  /** Client wall-clock epoch ms at signing time (bounded by freshness check). */
  clientTime: number;
}

/** Deterministic, order-stable encoding used as the HMAC message. */
export function canonicalSubmissionPayload(p: SubmissionPayload): string {
  return [
    p.quizId,
    p.questionId,
    p.selectedOption,
    p.nonce,
    Math.floor(p.clientTime),
  ].join('|');
}

/**
 * HMAC key material bound to (session, participant, arena). Both sides derive
 * it identically: client from sessionStorage, server from the participant doc.
 */
export function submissionKey(sessionToken: string, userId: string, quizId: string): string {
  return `quorena:submit:${quizId}:${userId}:${sessionToken}`;
}

/** HMAC-SHA256 of `message` under `key`, lowercase hex. Web Crypto everywhere. */
export async function hmacHex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const keyBuf = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', keyBuf, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Bounds the replay window: a captured payload older than the tolerance is dead. */
export function isSubmissionTimestampFresh(
  clientTime: number,
  toleranceMs: number = SUBMIT_CLOCK_SKEW_TOLERANCE_MS
): boolean {
  if (!Number.isFinite(clientTime)) return false;
  return Math.abs(Date.now() - clientTime) <= toleranceMs;
}

/** Client-side nonce generator with a crypto.randomUUID fallback. */
export function generateSubmissionNonce(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}