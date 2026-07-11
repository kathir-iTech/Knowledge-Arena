'use client';

import { BrainCircuit } from 'lucide-react';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Initializing...' }: LoadingScreenProps) {
  return (
    <div className="loading-screen">
      <div className="flex flex-col items-center gap-6">
        <BrainCircuit className="w-20 h-20 text-primary crystal-float liquid-glow" />
        <h1 className="text-3xl font-headline liquid-shimmer-text tracking-widest uppercase">Knowledge Arena</h1>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0s' }} />
          <div className="w-2 h-2 rounded-full bg-accent animate-pulse" style={{ animationDelay: '0.3s' }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.6s' }} />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">{message}</p>
      </div>
    </div>
  );
}
