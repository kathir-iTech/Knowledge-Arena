'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * StatusTracker — generic vertical step timeline.
 *
 * Reused by the RPL declaration-result page ("What happens next") and
 * (by a later agent) the worker status page. Keep props generic: the
 * component knows nothing about RPL stages; callers map their domain
 * state to `steps` with per-step `state`.
 */
export type TrackerStepState = 'done' | 'active' | 'pending';

export interface TrackerStep {
  /** Step label shown to the right of the circle. */
  label: string;
  state: TrackerStepState;
}

export interface StatusTrackerProps {
  steps: TrackerStep[];
  className?: string;
}

export function StatusTracker({ steps, className }: StatusTrackerProps) {
  return (
    <ol className={cn('space-y-0', className)} aria-label="Progress">
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        return (
          <li key={`${idx}-${step.label}`} className="flex gap-3">
            {/* Numbered circle + connecting line */}
            <div className="flex flex-col items-center" aria-hidden="true">
              <div
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  step.state === 'done' && 'bg-success text-success-foreground',
                  step.state === 'active' &&
                    'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background',
                  step.state === 'pending' && 'bg-muted text-muted-foreground',
                )}
              >
                {step.state === 'done' ? <Check className="h-4 w-4" /> : idx + 1}
              </div>
              {!isLast && (
                <div
                  className={cn(
                    'w-px flex-1 py-0.5',
                    step.state === 'done' ? 'bg-success/40' : 'bg-border',
                  )}
                />
              )}
            </div>
            {/* Label */}
            <div className={cn('pb-6', isLast && 'pb-0')}>
              <p
                className={cn(
                  'text-sm font-medium leading-7',
                  step.state === 'active' && 'text-primary',
                  step.state === 'done' && 'text-foreground',
                  step.state === 'pending' && 'text-muted-foreground',
                )}
                aria-current={step.state === 'active' ? 'step' : undefined}
              >
                {step.label}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
