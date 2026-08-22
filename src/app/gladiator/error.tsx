'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GladiatorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Gladiator ErrorBoundary]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center gap-6 safe-top safe-bottom" role="alert">
      <div className="flex items-center justify-center w-16 h-16 rounded-[18px] bg-destructive/10 ring-1 ring-destructive/10">
        <AlertTriangle className="w-8 h-8 text-destructive" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h1 className="text-page-title font-headline tracking-tight">Something went wrong in the arena</h1>
        <p className="text-base text-muted-foreground">
          The gladiator arena hit an unexpected error. Your progress is safe — please reload to continue.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/50 font-mono mt-1">Error ID: {error.digest}</p>
        )}
      </div>
      <div className="flex gap-3">
        <Button onClick={() => reset()} className="min-w-[140px]">
          <RefreshCw className="w-4 h-4 mr-2" />
          Reload Arena
        </Button>
        <Button variant="outline" onClick={() => (window.location.href = '/gladiator/dashboard')}>
          Dashboard
        </Button>
      </div>
    </div>
  );
}
