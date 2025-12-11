'use client';
    
import {
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  CollectionReference,
  DocumentReference,
  SetOptions,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import {FirestorePermissionError} from '@/firebase/errors';

export function setDocumentNonBlocking(docRef: DocumentReference, data: any, options?: SetOptions) {
  const operation = options && 'merge' in options ? 'update' : 'create';
  setDoc(docRef, data, options || {}).catch(error => {
    console.error(`Error in setDocumentNonBlocking for path ${docRef.path}:`, error);
    errorEmitter.emit(
      'permission-error',
      new FirestorePermissionError({
        path: docRef.path,
        operation,
        requestResourceData: data,
      })
    )
  })
}

export function addDocumentNonBlocking(colRef: CollectionReference, data: any) {
  const promise = addDoc(colRef, data)
    .catch(error => {
      console.error(`Error in addDocumentNonBlocking for path ${colRef.path}:`, error);
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: colRef.path,
          operation: 'create',
          requestResourceData: data,
        })
      )
    });
  return promise;
}


export function updateDocumentNonBlocking(docRef: DocumentReference, data: any) {
  updateDoc(docRef, data)
    .catch(error => {
      console.error(`Error in updateDocumentNonBlocking for path ${docRef.path}:`, error);
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: docRef.path,
          operation: 'update',
          requestResourceData: data,
        })
      )
    });
}


export function deleteDocumentNonBlocking(docRef: DocumentReference) {
  deleteDoc(docRef)
    .catch(error => {
      console.error(`Error in deleteDocumentNonBlocking for path ${docRef.path}:`, error);
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: docRef.path,
          operation: 'delete',
        })
      )
    });
}
