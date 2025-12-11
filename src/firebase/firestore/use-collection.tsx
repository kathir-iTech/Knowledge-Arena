'use client';
import { useEffect, useState, useRef } from 'react';
import type { FirestoreError, Query } from 'firebase/firestore';
import { onSnapshot } from 'firebase/firestore';

export default function useCollection(queryOrRef: Query | null) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);

  const queryRef = useRef(queryOrRef);

  useEffect(() => {
    // Prevent re-running the effect if the query object itself changes but is logically the same.
    // A better approach is to memoize the query in the calling component.
    if (queryRef.current === queryOrRef) {
      // return;
    }
    queryRef.current = queryOrRef;

    if (!queryOrRef) {
      setData([]);
      setLoading(false);
      return;
    }
    
    setLoading(true);

    const unsubscribe = onSnapshot(
        queryOrRef,
        (snap) => {
            const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setData(docs);
            setError(null);
            setLoading(false);
        },
        (err) => {
            console.error('useCollection listener error:', err);
            setError(err);
            setData([]);
            setLoading(false);
        }
    );

    return () => unsubscribe();
  }, [queryOrRef]);

  return { data, loading, error };
}
