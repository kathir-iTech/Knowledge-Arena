'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PageErrorProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function PageError({
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again.',
  onRetry,
  className,
}: PageErrorProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-14 px-4', className)}>
      <div className="w-16 h-16 rounded-[16px] bg-destructive/10 flex items-center justify-center mb-4 ring-1 ring-destructive/10">
        <AlertTriangle className="w-7 h-7 text-destructive" />
      </div>
      <h3 className="text-base font-semibold mb-1 text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm mb-5 leading-relaxed">{message}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="min-w-[140px]">
          <RefreshCw className="w-4 h-4 mr-2" />
          Try Again
        </Button>
      )}
    </div>
  );
}
