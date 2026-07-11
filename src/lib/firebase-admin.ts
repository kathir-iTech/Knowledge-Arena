import { initializeApp, getApps, getApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { firebaseConfig } from '@/firebase/config';

function initAdmin() {
  if (getApps().length) return getApp();
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      return initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
      });
    }
    return initializeApp({ credential: applicationDefault(), projectId: firebaseConfig.projectId });
  } catch {
    return initializeApp({ projectId: firebaseConfig.projectId });
  }
}

export function getAdminFirestore() {
  initAdmin();
  return getFirestore();
}

async function tryAdminFetch<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

function decodeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(fields)) {
    const v = val as { stringValue?: string; integerValue?: string; doubleValue?: number; booleanValue?: boolean; mapValue?: { fields: Record<string, unknown> } };
    if (v.stringValue !== undefined) result[key] = v.stringValue;
    else if (v.integerValue !== undefined) result[key] = parseInt(v.integerValue, 10);
    else if (v.doubleValue !== undefined) result[key] = v.doubleValue;
    else if (v.booleanValue !== undefined) result[key] = v.booleanValue;
    else if (v.mapValue?.fields) result[key] = decodeFields(v.mapValue.fields);
    else result[key] = null;
  }
  return result;
}

function apiUrl(path: string, params?: Record<string, string>): string {
  const base = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/${path}`;
  const qp = new URLSearchParams(params || {});
  qp.set('key', firebaseConfig.apiKey);
  return `${base}?${qp.toString()}`;
}

async function restGet(path: string): Promise<{ id: string; fields: Record<string, unknown> } | null> {
  const res = await fetch(apiUrl(path));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore API error ${res.status}`);
  const doc = await res.json();
  return { id: doc.name.split('/').pop(), fields: decodeFields(doc.fields || {}) };
}

async function restList(
  path: string,
  options?: { orderBy?: string; direction?: 'asc' | 'desc'; limit?: number }
): Promise<{ id: string; fields: Record<string, unknown> }[]> {
  const params: Record<string, string> = {};
  if (options?.orderBy) params['orderBy'] = `${options.orderBy} ${options.direction || 'asc'}`;
  if (options?.limit) params['pageSize'] = String(options.limit);
  const res = await fetch(apiUrl(path, params));
  if (!res.ok) throw new Error(`Firestore API error ${res.status}`);
  const data = await res.json();
  return (data.documents || []).map((doc: { name: string; fields: Record<string, unknown> }) => ({
    id: doc.name.split('/').pop(),
    fields: decodeFields(doc.fields || {})
  }));
}

export async function fetchDocsWithToken(
  collectionPath: string,
  _idToken?: string,
  options?: { orderBy?: string; direction?: 'asc' | 'desc'; limit?: number }
): Promise<Record<string, unknown>[]> {
  const adminResult = await tryAdminFetch(async () => {
    const snap = await getAdminFirestore().collection(collectionPath)
      .orderBy(options?.orderBy || '__name__', options?.direction || 'asc')
      .limit(options?.limit || 1000)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  });
  if (adminResult) return adminResult;

  const docs = await restList(collectionPath, options);
  return docs.map(d => ({ id: d.id, ...d.fields }));
}

export async function fetchDocWithToken(
  collectionPath: string,
  docId: string,
  _idToken?: string
): Promise<Record<string, unknown> | null> {
  const adminResult = await tryAdminFetch(async () => {
    const snap = await getAdminFirestore().collection(collectionPath).doc(docId).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() };
  });
  if (adminResult !== null) return adminResult;

  const doc = await restGet(`${collectionPath}/${docId}`);
  if (!doc) return null;
  return { id: doc.id, ...doc.fields };
}
