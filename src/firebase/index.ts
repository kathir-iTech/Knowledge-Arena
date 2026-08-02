'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, Firestore, connectFirestoreEmulator } from 'firebase/firestore'

let emulatorsConnected = false;

function connectEmulators(auth: Auth, firestore: Firestore) {
  // Local emulator support for development/QA only. Never enabled in production
  // unless NEXT_PUBLIC_FIREBASE_EMULATOR is explicitly set to "true".
  if (process.env.NEXT_PUBLIC_FIREBASE_EMULATOR !== 'true') return;
  if (emulatorsConnected) return;
  emulatorsConnected = true;
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
}

export function initializeFirebase() {
  if (getApps().length) {
    return getSdks(getApp());
  }
  const firebaseApp = initializeApp(firebaseConfig);
  return getSdks(firebaseApp);
}

function getSdks(firebaseApp: FirebaseApp) {
  const auth = getAuth(firebaseApp);
  const firestore = getFirestore(firebaseApp);
  connectEmulators(auth, firestore);
  return {
    firebaseApp,
    auth,
    firestore
  };
}

export { FirebaseClientProvider } from './client-provider';
export { useFirebase, useUser } from './provider';