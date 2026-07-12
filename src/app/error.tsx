'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center animate-in gap-6" role="alert">
      <div className="flex items-center justify-center w-16 h-16 rounded-[18px] bg-destructive/10">
        <AlertTriangle className="w-8 h-8 text-destructive" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h1 className="text-page-title font-headline tracking-tight">Something went wrong</h1>
        <p className="text-base text-muted-foreground">
          An unexpected error occurred. Please try again.
        </p>
      </div>
      <Button onClick={() => reset()} variant="outline">Try again</Button>
    </div>
  );
}
