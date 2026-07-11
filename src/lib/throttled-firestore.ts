import { doc, setDoc, updateDoc, deleteDoc, type Firestore, type DocumentReference } from 'firebase/firestore';
import { canWrite } from '@/lib/client-rate-limiter';
import { initializeFirebase } from '@/firebase';

function getDb() {
  return initializeFirebase().firestore;
}

async function withThrottle<T>(path: string, payload: unknown, fn: () => Promise<T>): Promise<T> {
  const { allowed, retryAfter } = canWrite(path, payload);
  if (!allowed) {
    if (retryAfter > 0) {
      await new Promise(r => setTimeout(r, retryAfter * 1000 + 100));
      const retryCheck = canWrite(path, payload);
      if (!retryCheck.allowed) {
        throw new Error('Write throttled. Too many writes to this path. Please slow down.');
      }
    } else {
      throw new Error('Duplicate write detected. Please wait before retrying.');
    }
  }
  return fn();
}

export function throttledSetDoc(path: string, data: Record<string, unknown>) {
  const db = getDb();
  return withThrottle(path, data, () => setDoc(doc(db, path), data));
}

export function throttledUpdateDoc(path: string, data: Record<string, unknown>) {
  const db = getDb();
  return withThrottle(path, data, () => updateDoc(doc(db, path), data));
}

export function throttledDeleteDoc(path: string) {
  const db = getDb();
  return withThrottle(path, {}, () => deleteDoc(doc(db, path)));
}
