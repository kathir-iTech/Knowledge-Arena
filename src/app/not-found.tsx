import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FileSearch, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center animate-in gap-6 safe-top safe-bottom">
      <div className="flex items-center justify-center w-16 h-16 rounded-[18px] bg-muted ring-1 ring-border/30">
        <FileSearch className="w-8 h-8 text-muted-foreground" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h1 className="text-page-title font-headline tracking-tight">Page not found</h1>
        <p className="text-base text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>
      <div className="flex gap-3">
        <Button asChild className="min-w-[140px]">
          <Link href="/"><Home className="w-4 h-4 mr-2" />Go home</Link>
        </Button>
      </div>
    </div>
  );
}
