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
      <div className="w-16 h-16 rounded-[16px] bg-muted flex items-center justify-center mb-4 ring-1 ring-border/30">
        <Icon className="w-7 h-7 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold mb-1 text-foreground">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground text-center max-w-sm mb-5 leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
