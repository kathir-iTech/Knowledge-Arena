import { initializeApp, getApps, getApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { firebaseConfig } from '@/firebase/config';

function initAdmin() {
  if (getApps().length) return getApp();

  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      return initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
      });
    } catch (e) {
      throw new Error(`Firebase Admin SDK: Invalid FIREBASE_SERVICE_ACCOUNT_KEY. ${e}`);
    }
  }

  return initializeApp({ credential: applicationDefault(), projectId: firebaseConfig.projectId });
}

export function getAdminFirestore() {
  initAdmin();
  return getFirestore();
}

export async function fetchDocsWithToken(
  collectionPath: string,
  uid: string,
  options?: { orderBy?: string; direction?: 'asc' | 'desc'; limit?: number }
): Promise<Record<string, unknown>[]> {
  let query = getAdminFirestore().collection(collectionPath)
    .where('created_by', '==', uid);

  if (options?.orderBy) {
    query = query.orderBy(options.orderBy, options.direction || 'asc');
  }

  const snap = await query.limit(options?.limit || 1000).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
