import { BrainCircuit } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-background">
      <div className="flex flex-col items-center gap-4">
        <BrainCircuit className="w-16 h-16 text-primary animate-pulse" />
        <h1 className="text-2xl font-headline text-primary tracking-tight">Knowledge Arena</h1>
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
