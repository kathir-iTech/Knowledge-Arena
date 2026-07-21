'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

export function useOnlineStatus() {
  const [status, setStatus] = useState<ConnectionStatus>(() =>
    typeof navigator !== 'undefined' && navigator.onLine ? 'connected' : 'offline'
  );
  const onlineRef = useRef(typeof navigator === 'undefined' || navigator.onLine);

  const handleOnline = useCallback(() => {
    onlineRef.current = true;
    setStatus('connected');
  }, []);

  const handleOffline = useCallback(() => {
    onlineRef.current = false;
    setStatus('offline');
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  const isOnline = onlineRef.current;

  return { status, isOnline, setStatus };
}
