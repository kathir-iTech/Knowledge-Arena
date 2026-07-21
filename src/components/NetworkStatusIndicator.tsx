'use client';

import React from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConnectionStatus } from '@/hooks/useOnlineStatus';

interface NetworkStatusIndicatorProps {
  status: ConnectionStatus;
  className?: string;
}

export function NetworkStatusIndicator({ status, className }: NetworkStatusIndicatorProps) {
  if (status === 'connected') return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-[12px] text-sm font-medium shadow-elevation-medium transition-all duration-200",
        status === 'offline'
          ? "bg-destructive text-destructive-foreground"
          : "bg-warning text-warning-foreground",
        className
      )}
      role="alert"
      aria-live="assertive"
    >
      {status === 'offline' ? (
        <><WifiOff className="h-4 w-4" /> You are offline</>
      ) : (
        <><Loader2 className="h-4 w-4 animate-spin" /> Reconnecting…</>
      )}
    </div>
  );
}
