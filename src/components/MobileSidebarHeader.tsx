'use client';

import { BrainCircuit } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';

export function MobileSidebarHeader() {
  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b bg-background/80 px-4 py-2.5 backdrop-blur-md md:hidden">
      <SidebarTrigger className="h-10 w-10 touch-target" aria-label="Open navigation menu" />
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
          <BrainCircuit className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
        </div>
        <span className="font-headline text-sm font-bold tracking-tight">Quorena</span>
      </div>
    </header>
  );
}