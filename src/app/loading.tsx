import { BrainCircuit } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-background">
      <div className="flex flex-col items-center gap-4">
        <BrainCircuit className="w-16 h-16 text-primary animate-pulse" />
        <h1 className="text-2xl font-headline text-primary">KNOWLEDGE ARENA</h1>
        <p className="text-muted-foreground animate-pulse">Loading...</p>
      </div>
    </div>
  );
}
