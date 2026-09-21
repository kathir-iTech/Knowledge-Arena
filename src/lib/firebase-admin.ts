import { initializeApp, getApps, getApp, cert, applicationDefault, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getDatabase, type Database } from 'firebase-admin/database';
import { firebaseConfig } from '@/firebase/config';
import { existsSync, readFileSync } from 'fs';

function initDatabaseUrl(): string {
  return process.env.FIREBASE_DATABASE_URL || firebaseConfig.databaseURL;
}

function loadServiceAccountKey(): string | null {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (fromEnv) return fromEnv;
  const fromPath = process.env.SERVICE_ACCOUNT_PATH;
  if (fromPath && existsSync(fromPath)) return readFileSync(fromPath, 'utf-8');
  const localPath = 'service-account.json';
  if (existsSync(localPath)) return readFileSync(localPath, 'utf-8');
  return null;
}

const EMULATOR_PROJECT_ID = 'demo-quorena';

function isEmulatorMode(): boolean {
  return Boolean(
    process.env.FIRESTORE_EMULATOR_HOST ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    process.env.FIREBASE_DATABASE_EMULATOR_HOST
  );
}

function initAdmin() {
  if (getApps().length) return getApp();

  if (isEmulatorMode()) {
    return initializeApp({ projectId: EMULATOR_PROJECT_ID });
  }

  const raw = loadServiceAccountKey();
  if (raw) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      const err = e as Error;
      throw new Error(
        'Firebase Admin SDK: FIREBASE_SERVICE_ACCOUNT_KEY contains invalid JSON. ' +
        'Ensure the value is a valid JSON object (not wrapped in extra quotes, not truncated). ' +
        `Parse error: ${err.message}`
      );
    }

    if (
      typeof parsed.type !== 'string' ||
      typeof parsed.project_id !== 'string' ||
      typeof parsed.private_key !== 'string' ||
      typeof parsed.client_email !== 'string'
    ) {
      throw new Error(
        'Firebase Admin SDK: FIREBASE_SERVICE_ACCOUNT_KEY is missing required fields (type, project_id, private_key, client_email). ' +
        'Ensure the full service account JSON is provided as a single-line (or multi-line) JSON object.'
      );
    }

    if (parsed.project_id !== firebaseConfig.projectId) {
      throw new Error(
        `Firebase Admin SDK: Service account project "${parsed.project_id}" does not match client project "${firebaseConfig.projectId}". ` +
        'Ensure FIREBASE_SERVICE_ACCOUNT_KEY belongs to the same Firebase project as the client config.'
      );
    }

    (parsed as Record<string, string>).private_key = (parsed as Record<string, string>).private_key.replace(/\\n/g, '\n');

    try {
      return initializeApp({ credential: cert(parsed as unknown as ServiceAccount), databaseURL: initDatabaseUrl() });
    } catch (e) {
      throw new Error(`Firebase Admin SDK: Initialization with service account failed. ${(e as Error).message}`);
    }
  }

  try {
    return initializeApp({ credential: applicationDefault(), projectId: firebaseConfig.projectId, databaseURL: initDatabaseUrl() });
  } catch (e) {
    const err = e as { message?: string };
    const msg = err?.message || '';
    if (msg.includes('Could not load the default credentials') || msg.includes('Application Default Credentials')) {
      throw new Error(
        'Firebase Admin SDK: FIREBASE_SERVICE_ACCOUNT_KEY is not set and ADC is unavailable. ' +
        'To use admin APIs in production, set FIREBASE_SERVICE_ACCOUNT_KEY in Vercel project settings. ' +
        'Target project: ' + firebaseConfig.projectId + '. ' +
        'To use locally, set FIREBASE_SERVICE_ACCOUNT_KEY in .env or configure gcloud ADC.'
      );
    }
    throw new Error(`Firebase Admin SDK: Initialization failed - ${msg}`);
  }
}

const globalForFirebase = globalThis as unknown as {
  __firebaseDb?: Firestore;
  __firebaseAuth?: ReturnType<typeof getAuth>;
  __firebaseRtdb?: Database;
};
let _db = globalForFirebase.__firebaseDb;
let _auth = globalForFirebase.__firebaseAuth;
let _rtdb = globalForFirebase.__firebaseRtdb;

export function getAdminDb() {
  if (_db) return _db;
  initAdmin();
  _db = getFirestore();
  globalForFirebase.__firebaseDb = _db;
  return _db;
}

export function getAdminAuth() {
  if (_auth) return _auth;
  initAdmin();
  _auth = getAuth();
  globalForFirebase.__firebaseAuth = _auth;
  return _auth;
}

export function getAdminRtdb() {
  if (_rtdb) return _rtdb;
  initAdmin();
  _rtdb = getDatabase();
  globalForFirebase.__firebaseRtdb = _rtdb;
  return _rtdb;
}

export async function fetchDocsWithToken(
  collectionPath: string,
  uid: string,
  options?: { orderBy?: string; direction?: 'asc' | 'desc'; limit?: number }
): Promise<Record<string, unknown>[]> {
  let query = getAdminDb().collection(collectionPath)
    .where('created_by', '==', uid);

  if (options?.orderBy) {
    query = query.orderBy(options.orderBy, options.direction || 'asc');
  }

  const snap = await query.limit(options?.limit || 1000).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
