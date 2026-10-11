// B1 — offline queue REPLAY with a fresh ID token at replay time.
//
// Why this lives in the page and not the service worker: the RPL service
// worker has no Firebase SDK, so it can never call getIdToken(). The previous
// SW-side replay POSTed without an Authorization header, got 401 forever and
// silently kept a permanently-failing queue. Now:
//   - the SW only QUEUES on network failure and notifies clients on sync;
//   - this module replays from the page with a freshly-fetched Bearer token,
//     keeps every record on failure, and marks the visible state
//     ('needs-signin' on 401, 'error' on other refusals) — nothing is ever
//     dropped silently.

import {
  getPendingDeclarations,
  markPendingDeclaration,
  removePendingDeclaration,
} from './offline-store';
import { isReferenceCode } from './reference-code';
import type { PendingDeclaration } from './types';

export const DECLARE_ENDPOINT = '/api/rpl/declare';

/** Queue backend — real IndexedDB store by default; injectable for tests. */
export interface QueueStore {
  list(): Promise<PendingDeclaration[]>;
  remove(localId: string): Promise<void>;
  mark(
    localId: string,
    patch: { syncState?: 'queued' | 'needs-signin' | 'error'; lastError?: string; bumpAttempt?: boolean },
  ): Promise<void>;
}

export const indexedDbStore: QueueStore = {
  list: getPendingDeclarations,
  remove: removePendingDeclaration,
  mark: markPendingDeclaration,
};

export interface SyncReport {
  total: number;
  synced: number;
  /** Records left queued because the session is missing/expired (visible). */
  needsSignIn: number;
  /** Records left queued after a server refusal / network drop (visible). */
  failed: number;
  errors: string[];
  /**
   * B2: human-readable reference codes the server assigned to replayed
   * declarations. The page surfaces these so an offline worker still gets
   * their code instead of a UID.
   */
  referenceCodes: string[];
}

export interface SyncDeps {
  /** False when nobody is signed in — every record is marked 'needs-signin'. */
  isAuthenticated: boolean;
  /** Fresh ID token provider (page: user.getIdToken(forceRefresh)). */
  getIdToken: (forceRefresh: boolean) => Promise<string | null>;
  fetchImpl?: typeof fetch;
  endpoint?: string;
  store?: QueueStore;
}

/** Local bookkeeping fields must never reach the API body. */
function toRequestBody(record: PendingDeclaration): Record<string, unknown> {
  const {
    localId: _localId,
    savedAt: _savedAt,
    syncState: _syncState,
    lastError: _lastError,
    attempts: _attempts,
    ...body
  } = record;
  void _localId;
  void _savedAt;
  void _syncState;
  void _lastError;
  void _attempts;
  return body as Record<string, unknown>;
}

async function markAll(
  store: QueueStore,
  records: PendingDeclaration[],
  state: 'needs-signin' | 'error',
  reason: string,
): Promise<void> {
  for (const r of records) {
    await store.mark(r.localId, { syncState: state, lastError: reason });
  }
}

/** B2: capture the server-assigned human reference code from a 2xx replay. */
async function recordReferenceCode(res: Response, report: SyncReport): Promise<void> {
  try {
    const body = (await res.json()) as { referenceCode?: unknown };
    if (isReferenceCode(body?.referenceCode)) report.referenceCodes.push(body.referenceCode);
  } catch {
    /* body absent or not JSON — nothing to record */
  }
}

/**
 * Replay every queued declaration. Returns a report the UI must surface.
 * Guarantees:
 *  - a Bearer token is fetched at replay time (per record) via getIdToken();
 *  - 401 (after one forced refresh) → record kept + 'needs-signin';
 *  - other non-2xx → record kept + 'error' with the reason;
 *  - network drop → record kept, replay stops (still offline);
 *  - 2xx → record deleted (only then).
 */
export async function syncPendingDeclarations(deps: SyncDeps): Promise<SyncReport> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const endpoint = deps.endpoint ?? DECLARE_ENDPOINT;
  const store = deps.store ?? indexedDbStore;
  const report: SyncReport = { total: 0, synced: 0, needsSignIn: 0, failed: 0, errors: [], referenceCodes: [] };

  let records: PendingDeclaration[];
  try {
    records = await store.list();
  } catch (err) {
    report.errors.push(`Could not read the offline queue (${err instanceof Error ? err.message : String(err)})`);
    return report;
  }
  report.total = records.length;
  if (records.length === 0) return report;

  if (!deps.isAuthenticated) {
    await markAll(store, records, 'needs-signin', 'Sign in to sync.');
    report.needsSignIn = records.length;
    report.errors.push('Not signed in — queued declarations kept until you sign in again.');
    return report;
  }

  for (const record of records) {
    let token: string | null = null;
    try {
      token = await deps.getIdToken(false);
    } catch {
      token = null;
    }
    if (!token) {
      await store.mark(record.localId, {
        syncState: 'needs-signin',
        lastError: 'Sign in to sync.',
      });
      report.needsSignIn += 1;
      report.errors.push('Could not get a session token — sign in to sync.');
      continue;
    }

    const attempt = async (bearer: string): Promise<Response> =>
      fetchImpl(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(toRequestBody(record)),
      });

    let res: Response;
    try {
      res = await attempt(token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await store.mark(record.localId, {
        syncState: 'queued',
        lastError: `Offline — will retry (${msg})`,
        bumpAttempt: true,
      });
      report.failed += 1;
      report.errors.push(`Offline — kept queued: ${msg}`);
      break; // network is gone; stop hammering the rest
    }

    if (res.ok) {
      try {
        await recordReferenceCode(res, report);
        await store.remove(record.localId);
        report.synced += 1;
      } catch (err) {
        report.failed += 1;
        report.errors.push(`Synced but could not clear the queue entry: ${err instanceof Error ? err.message : String(err)}`);
      }
      continue;
    }

    if (res.status === 401) {
      // Token may have expired while queued: exactly one forced refresh.
      let fresh: string | null = null;
      try {
        fresh = await deps.getIdToken(true);
      } catch {
        fresh = null;
      }
      if (fresh) {
        try {
          res = await attempt(fresh);
          if (res.ok) {
            await recordReferenceCode(res, report);
            await store.remove(record.localId);
            report.synced += 1;
            continue;
          }
        } catch {
          /* fall through to keep-queued below */
        }
      }
      if (res.status === 401) {
        await store.mark(record.localId, {
          syncState: 'needs-signin',
          lastError: 'Session expired — sign in to sync.',
          bumpAttempt: true,
        });
        report.needsSignIn += 1;
        report.errors.push('Session expired — queued until you sign in again.');
        continue; // remaining records belong to the same session; don't burn 401s
      }
    }

    // 429/4xx/5xx: keep the record, surface the reason, never drop.
    let reason = `Server refused the replay (HTTP ${res.status}).`;
    try {
      const body = (await res.json()) as { error?: string };
      if (typeof body?.error === 'string' && body.error) reason = body.error;
    } catch {
      /* body not JSON — status text is enough */
    }
    await store.mark(record.localId, {
      syncState: 'error',
      lastError: reason,
      bumpAttempt: true,
    });
    report.failed += 1;
    report.errors.push(reason);
    if (res.status === 429) break; // rate limited — stop, rest stay queued as-is
  }

  return report;
}
