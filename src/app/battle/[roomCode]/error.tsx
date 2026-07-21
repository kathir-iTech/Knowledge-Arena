'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ShieldX, RefreshCw, Home } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function BattleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    void error;
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 text-center p-4 animate-in safe-top safe-bottom" role="alert">
      <div className="flex items-center justify-center w-16 h-16 rounded-[18px] bg-destructive/10">
        <ShieldX className="w-8 h-8 text-destructive" aria-hidden="true" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h1 className="text-page-title font-headline tracking-tight text-destructive">Battle Error</h1>
        <p className="text-base text-muted-foreground">An unexpected error occurred in the arena. Your progress is safe.</p>
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => reset()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
        <Button onClick={() => router.push('/')}>
          <Home className="mr-2 h-4 w-4" /> Return to Dashboard
        </Button>
      </div>
    </div>
  );
}
