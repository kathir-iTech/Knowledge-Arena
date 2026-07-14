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
      const hint = e instanceof SyntaxError
        ? `Invalid JSON at position ${(e as unknown as { position?: number }).position ?? 'unknown'}. Expected the full service account JSON object (not the Node.js snippet).`
        : `Parse failed: ${e}`;
      throw new Error(`Firebase Admin SDK: ${hint}`);
    }

    if (!parsed.type || !parsed.project_id || !parsed.private_key || !parsed.client_email) {
      throw new Error(
        'Firebase Admin SDK: FIREBASE_SERVICE_ACCOUNT_KEY is missing required fields (type, project_id, private_key, client_email). Ensure the full service account JSON is provided, not a partial snippet.'
      );
    }

    try {
      return initializeApp({ credential: cert(parsed) });
    } catch (e) {
      throw new Error(`Firebase Admin SDK: Initialization failed. ${e}`);
    }
  }

  return initializeApp({ credential: applicationDefault(), projectId: firebaseConfig.projectId });
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
