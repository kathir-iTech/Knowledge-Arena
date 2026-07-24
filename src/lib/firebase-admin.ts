import { initializeApp, getApps, getApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { firebaseConfig } from '@/firebase/config';

function initAdmin() {
  if (getApps().length) return getApp();

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
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
      return initializeApp({ credential: cert(parsed as any) });
    } catch (e) {
      throw new Error(`Firebase Admin SDK: Initialization with service account failed. ${(e as Error).message}`);
    }
  }

  try {
    return initializeApp({ credential: applicationDefault(), projectId: firebaseConfig.projectId });
  } catch (e: any) {
    const msg = e?.message || '';
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

export function getAdminDb() {
  initAdmin();
  return getFirestore();
}

export function getAdminAuth() {
  initAdmin();
  return getAuth();
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
