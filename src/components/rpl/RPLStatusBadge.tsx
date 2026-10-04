'use client';

import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { RPLStage } from '@/lib/rpl/types';

export interface RPLStatusBadgeProps {
  stage: RPLStage;
  className?: string;
}

/**
 * RPLStatusBadge — small stage chip.
 * declared -> amber, assessment_scheduled -> blue, assessed -> violet,
 * profile_ready -> green, certified -> green + check.
 */
export function RPLStatusBadge({ stage, className }: RPLStatusBadgeProps) {
  switch (stage) {
    case 'declared':
      return (
        <Badge variant="warning" className={cn(className)}>
          Declared
        </Badge>
      );
    case 'assessment_scheduled':
      return (
        <Badge
          variant="outline"
          className={cn('border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400', className)}
        >
          Assessment scheduled
        </Badge>
      );
    case 'assessed':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-400',
            className,
          )}
        >
          Assessed
        </Badge>
      );
    case 'profile_ready':
      return (
        <Badge variant="success" className={cn(className)}>
          Profile ready
        </Badge>
      );
    case 'certified':
      return (
        <Badge variant="success" className={cn(className)}>
          <Check className="mr-1 h-3 w-3" aria-hidden="true" />
          Certified
        </Badge>
      );
    default:
      return null;
  }
}

export default RPLStatusBadge;
