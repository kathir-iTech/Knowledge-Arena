'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, Firestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getDatabase, Database, connectDatabaseEmulator } from 'firebase/database'

const EMULATOR_PROJECT_ID = 'demo-quorena';

let emulatorsConnected = false;

// In emulator mode the client app MUST mint ID tokens whose `aud` matches the
// Admin verifier's binding (demo-quorena). The real firebaseConfig (config.ts)
// pins the PROD projectId, so a prod-initialized client mints `aud = studio-...`
// tokens that `verifyIdToken` rejects. Override projectId here in emulator mode.
function getClientConfig() {
  const isEmulator = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === 'true';
  return isEmulator
    ? { projectId: EMULATOR_PROJECT_ID, apiKey: 'demo-key' }
    : firebaseConfig;
}

function connectEmulators(auth: Auth, firestore: Firestore, rtdb: Database) {
  // Local emulator support for development/QA only. Never enabled in production
  // unless NEXT_PUBLIC_FIREBASE_EMULATOR is explicitly set to "true".
  if (process.env.NEXT_PUBLIC_FIREBASE_EMULATOR !== 'true') return;
  if (emulatorsConnected) return;
  emulatorsConnected = true;
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  connectDatabaseEmulator(rtdb, '127.0.0.1', 9000);
}

export function initializeFirebase() {
  if (getApps().length) {
    return getSdks(getApp());
  }
  const firebaseApp = initializeApp(getClientConfig());
  return getSdks(firebaseApp);
}

function getSdks(firebaseApp: FirebaseApp) {
  const auth = getAuth(firebaseApp);
  const firestore = getFirestore(firebaseApp);
  const rtdb = getDatabase(firebaseApp);
  connectEmulators(auth, firestore, rtdb);
  return {
    firebaseApp,
    auth,
    firestore,
    rtdb
  };
}

export { FirebaseClientProvider } from './client-provider';
export { useFirebase, useUser } from './provider';