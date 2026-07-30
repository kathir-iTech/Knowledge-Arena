'use client';

import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';

export function OfflineDetector() {
  const [offline, setOffline] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const goOnline = () => { setOffline(false); setShow(true); setTimeout(() => setShow(false), 3000); };
    const goOffline = () => { setOffline(true); setShow(true); };

    setOffline(!navigator.onLine);
    if (!navigator.onLine) setShow(true);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-all duration-300',
        offline
          ? 'bg-destructive/10 text-destructive border-b border-destructive/20'
          : 'bg-success/10 text-success border-b border-success/20'
      )}
    >
      {offline ? (
        <><WifiOff className="w-4 h-4" /> You are offline. Some features may be unavailable.</>
      ) : (
        <><Wifi className="w-4 h-4" /> Back online.</>
      )}
    </div>
  );
}
