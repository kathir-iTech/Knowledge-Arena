// Client-side clock-skew correction (Phase 68).
//
// Battle timers in LiveQuiz compare the browser's Date.now() against
// server-written timestamps (quiz.question_start_at / participant.question_start_at).
// If the client clock is skewed — even by a couple of minutes — the countdown
// wrongly reaches zero early and blocks the submit path client-side, or the
// inverse keeps a question "running" long after the server closed it.
//
// This module samples the server clock via GET /api/clock and derives an
// offset = serverTime - clientTime. `skewNow()` returns the current time
// expressed on the server's clock, so deadline maths stays in one timescale.
// The server already enforces its own tolerance (SUBMIT_CLOCK_SKEW_TOLERANCE_MS);
// this fixes the client-side lockout, not the authority.

const OFFSET_TTL_MS = 60 * 1000;

let offset: number | null = null;
let fetchedAt = 0;
let inFlight: Promise<number> | null = null;

async function refreshOffset(): Promise<number> {
  try {
    const res = await fetch('/api/clock', { cache: 'no-store' });
    if (!res.ok) throw new Error(`clock endpoint returned ${res.status}`);
    const data = await res.json();
    const sent = Date.now();
    const received = Date.now();
    if (typeof data.serverTime !== 'number' || !Number.isFinite(data.serverTime)) {
      throw new Error('clock endpoint returned an invalid serverTime');
    }
    // The mid-point of the round trip is the best estimate of when the
    // server actually read its clock.
    offset = data.serverTime - (sent + received) / 2;
    fetchedAt = Date.now();
  } catch (err) {
    console.warn('[client-clock] offset refresh failed:', err);
    offset = null;
  }
  return offset ?? 0;
}

/** Resolves to the current server-offset in ms (0 before the first sample). */
export function getServerOffset(): Promise<number> {
  if (offset !== null && Date.now() - fetchedAt < OFFSET_TTL_MS) {
    return Promise.resolve(offset);
  }
  if (!inFlight) {
    inFlight = refreshOffset().finally(() => { inFlight = null; });
  }
  return inFlight;
}

/** Current time expressed on the server's clock (falls back to client time). */
export function skewNow(): number {
  return Date.now() + (offset ?? 0);
}

/** Most recently sampled offset in ms (0 if never sampled). */
export function currentOffset(): number {
  return offset ?? 0;
}