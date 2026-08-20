'use client';

import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-14 px-4', className)}>
      <div className="relative mb-5">
        <div className="absolute -inset-3 rounded-[24px] bg-gradient-to-br from-primary/15 via-transparent to-accent/15 blur-xl animate-glow-pulse" aria-hidden="true" />
        <div className="relative w-16 h-16 rounded-[16px] bg-primary/8 ring-1 ring-accent/20 flex items-center justify-center overflow-hidden">
          <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-primary/15 animate-float" aria-hidden="true" />
          <div className="absolute -bottom-4 -left-4 w-9 h-9 rounded-full bg-accent/15 animate-float" style={{ animationDelay: '-3s' }} aria-hidden="true" />
          <Icon className="w-7 h-7 text-muted-foreground relative" />
        </div>
      </div>
      <h3 className="text-base font-headline font-semibold mb-1 text-foreground">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground text-center max-w-sm mb-5 leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
