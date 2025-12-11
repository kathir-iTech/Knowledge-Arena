'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore'
import useCollection from './firestore/use-collection';

export function initializeFirebase() {
  if (!getApps().length) {
    let firebaseApp;
    try {
      firebaseApp = initializeApp();
    } catch (e) {
      if (process.env.NODE_ENV === "production") {
        console.warn('Automatic initialization failed. Falling back to firebase config object.', e);
      }
      firebaseApp = initializeApp(firebaseConfig);
    }
    return getSdks(firebaseApp);
  }
  return getSdks(getApp());
}

export function getSdks(firebaseApp: FirebaseApp) {
  const firestore = getFirestore(firebaseApp);
  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore: firestore,
  };
}

export { useCollection };
export * from './provider';
export * from './client-provider';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './errors';
export * from './error-emitter';
