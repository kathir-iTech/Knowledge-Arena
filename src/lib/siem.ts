/**
 * R2-39 / Feature 39: SIEM CEF formatter + fire-and-forget dispatcher.
 *
 * Pure `toCEF` + async `dispatch` that never throws (failures warn locally).
 * Callers must never `await` in the request path.
 */

export interface SiemEvent {
  type: string;
  actor?: string | null;
  detail?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: number | null;
}

export function toCEF(e: SiemEvent): string {
  const safe = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 2000);
  const type = safe(String(e.type ?? 'unknown'));
  const actor = safe(String(e.actor ?? 'anonymous'));
  const detail = safe(String(e.detail ?? ''));
  return `CEF:0|Quorena|Platform|1.0|${type}|${actor}|${detail}`;
}

/** Fire-and-forget: posts CEF to SIEM_WEBHOOK_URL when set; no-op otherwise. Never throws. */
export function dispatchSIEM(e: SiemEvent): void {
  try {
    const url = typeof process.env.SIEM_WEBHOOK_URL === 'string' ? process.env.SIEM_WEBHOOK_URL.trim() : '';
    if (!url) return;
    const payload = JSON.stringify({ cef: toCEF(e), event: e });
    // Fire-and-forget by design — never block the request path.
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    }).catch((err) => {
      console.warn('[SIEM] webhook delivery failed (non-blocking):', err instanceof Error ? err.message : String(err));
    });
  } catch (err) {
    console.warn('[SIEM] dispatch failed (non-blocking):', err instanceof Error ? err.message : String(err));
  }
}
