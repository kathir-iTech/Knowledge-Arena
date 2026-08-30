'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { useSharedIntersectionObserverWithDelay } from '@/hooks/useSharedIntersectionObserver';

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section' | 'article';
}

export function Reveal({ children, className, delay = 0, as: Tag = 'div' }: RevealProps) {
  const [ref, visible] = useSharedIntersectionObserverWithDelay(delay);

  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement>}
      className={cn('reveal', visible && 'reveal-visible', className)}
    >
      {children}
    </Tag>
  );
}