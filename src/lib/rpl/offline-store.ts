import type { PendingDeclaration, SelfDeclaration } from '@/lib/rpl/types';

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
