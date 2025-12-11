'use client';
import { useEffect, useState } from 'react';
import type { FirestoreError } from 'firebase/firestore';

/**
 * useCollectionSafe(queryOrRef)
 * - Accepts a Firestore collection reference or query.
 * - Returns { data, loading, error }.
 * - If Firestore denies permission to list the collection, it logs a warning and returns data = [] (no throw).
 */
export default function useCollectionSafe(queryOrRef: any) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);

  useEffect(() => {
    if (!queryOrRef) {
      setData([]);
      setLoading(false);
      return;
    }

    let unsubscribe: (() => void) | null = null;

    const attach = async () => {
      try {
        // Try to attach a realtime listener and handle errors in its callback
        if (typeof queryOrRef.onSnapshot === 'function') {
          unsubscribe = queryOrRef.onSnapshot(
            (snap: any) => {
              const docs = snap.docs ? snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) : [];
              setData(docs);
              setLoading(false);
            },
            (err: any) => {
              // Swallow Firestore permission errors and return empty data — do not crash app
              console.warn('useCollectionSafe listener error:', err);
              const code = (err && err.code) || '';
              const msg = (err && err.message) || '';
              const isPermission = String(code).toLowerCase().includes('permission') || String(msg).toLowerCase().includes('permission');
              if (isPermission) {
                setData([]);
                setError(null);
              } else {
                setError(err);
              }
              setLoading(false);
            }
          );
        } else {
          // If queryOrRef is not a Query with onSnapshot, try to call it as a function (fallback)
          setData([]);
          setLoading(false);
        }
      } catch (err: any) {
        console.warn('useCollectionSafe attach error', err);
        const msg = String(err?.message || err || '');
        const isPermission = msg.toLowerCase().includes('permission');
        if (isPermission) {
          setData([]);
          setError(null);
          setLoading(false);
        } else {
          setError(err);
          setLoading(false);
        }
      }
    };

    attach();

    return () => {
      try {
        if (unsubscribe && typeof unsubscribe === 'function') unsubscribe();
      } catch (e) {
        // ignore cleanup errors
      }
    };
  }, [queryOrRef]);

  return { data, loading, error };
}
