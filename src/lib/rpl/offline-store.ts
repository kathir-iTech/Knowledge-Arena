import type { PendingDeclaration, PendingSyncState, SelfDeclaration } from '@/lib/rpl/types';

const DB_NAME = 'rpl-offline';
const DB_VERSION = 1;
const STORE_NAME = 'rpl-pending-declarations';
const SYNC_TAG = 'rpl-sync';

function assertIndexedDB(): IDBFactory {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not available (SSR or unsupported browser).');
  }
  return indexedDB;
}

function openDatabase(): Promise<IDBDatabase> {
  const factory = assertIndexedDB();
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'localId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to open IndexedDB.'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error('IndexedDB transaction failed.'));
    tx.onabort = () =>
      reject(tx.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

export async function storePendingDeclaration(
  data: SelfDeclaration
): Promise<string> {
  assertIndexedDB();
  const localId = crypto.randomUUID();
  const record: PendingDeclaration = {
    ...data,
    localId,
    savedAt: Date.now(),
  };
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await requestToPromise(store.add(record));
    await transactionComplete(tx);
    return localId;
  } finally {
    db.close();
  }
}

export async function getPendingDeclarations(): Promise<PendingDeclaration[]> {
  assertIndexedDB();
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const result = await requestToPromise(store.getAll() as IDBRequest<PendingDeclaration[]>);
    return result ?? [];
  } finally {
    db.close();
  }
}

export async function removePendingDeclaration(id: string): Promise<void> {
  assertIndexedDB();
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await requestToPromise(store.delete(id));
    await transactionComplete(tx);
  } finally {
    db.close();
  }
}

export async function getPendingCount(): Promise<number> {
  assertIndexedDB();
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const count = await requestToPromise(store.count());
    return count ?? 0;
  } finally {
    db.close();
  }
}

/** B1: update the visible sync state of one queued record (never deletes it). */
export async function markPendingDeclaration(
  id: string,
  patch: { syncState?: PendingSyncState; lastError?: string; bumpAttempt?: boolean },
): Promise<void> {
  assertIndexedDB();
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const existing = (await requestToPromise(store.get(id))) as PendingDeclaration | undefined;
    if (!existing) return;
    const next: PendingDeclaration = { ...existing };
    if (patch.syncState) next.syncState = patch.syncState;
    if (typeof patch.lastError === 'string') next.lastError = patch.lastError;
    if (patch.bumpAttempt) next.attempts = (existing.attempts ?? 0) + 1;
    await requestToPromise(store.put(next));
    await transactionComplete(tx);
  } finally {
    db.close();
  }
}

/**
 * SIH-26242 Part 1.4 — sign-out releases the queue's user binding.
 *
 * Every queued record carries the `workerId` (uid) of the account that created
 * it. On sign-out we mark the WHOLE queue 'needs-signin' so no record can be
 * replayed by the next account that signs in on this device: the next session
 * must belong to the worker who queued the declaration (see the uid check in
 * offline-sync.ts).
 */
export async function releaseOfflineQueue(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const records = await getPendingDeclarations();
  if (records.length === 0) return;
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const record of records) {
      store.put({
        ...record,
        syncState: 'needs-signin',
        lastError: 'Signed out — sign in with the account that queued this to sync.',
      });
    }
    await transactionComplete(tx);
  } finally {
    db.close();
  }
}

export interface PendingSummary {
  total: number;
  needsSignIn: number;
  errors: number;
}

/** B1: counts for the declare page's visible offline-queue state. */
export async function getPendingSummary(): Promise<PendingSummary> {
  const records = await getPendingDeclarations();
  return {
    total: records.length,
    needsSignIn: records.filter((r) => r.syncState === 'needs-signin').length,
    errors: records.filter((r) => r.syncState === 'error').length,
  };
}

export async function queueDeclarationForSync(
  data: SelfDeclaration
): Promise<string> {
  const localId = await storePendingDeclaration(data);
  try {
    if (typeof navigator === 'undefined') return localId;
    if (!('serviceWorker' in navigator)) return localId;
    const container = navigator.serviceWorker;
    if (!container?.ready) return localId;
    const reg = await container.ready;
    if (!('sync' in reg)) return localId;
    const syncReg = reg as unknown as {
      sync?: { register: (tag: string) => Promise<void> };
    };
    if (syncReg.sync) {
      await syncReg.sync.register(SYNC_TAG);
    }
  } catch {
    // Never throws when Background Sync is unavailable. The service worker
    // sync event handles the queue when fired, and the wizard retries on
    // reconnect.
  }
  return localId;
}
