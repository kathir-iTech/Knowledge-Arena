
"use client";

import { useAuth } from '@/hooks/useAuth';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { BrainCircuit } from 'lucide-react';
import { Suspense } from 'react';
import { LoadingScreen } from '@/components/LoadingScreen';

const LoginForm = dynamic(() => import('@/components/auth/LoginForm').then(m => m.LoginForm), { ssr: false });

function PageContent() {
  const { user, isLoading } = useAuth();
  const searchParams = useSearchParams();
  
  if (isLoading) {
    return <LoadingScreen message="Preparing the arena..." />;
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-background animate-in px-4 safe-top safe-bottom overflow-x-hidden">
      <div className="w-full max-w-sm sm:max-w-md space-y-8 sm:space-y-10 min-w-0">
        <div className="text-center space-y-3 sm:space-y-4">
          <div className="flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-[18px] bg-primary/10 mx-auto">
            <BrainCircuit className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
          </div>
          <div className="space-y-1">
            <h1 className="text-[1.75rem] leading-tight sm:text-display font-headline text-foreground tracking-tight break-words">Knowledge Arena</h1>
            <p className="text-sm sm:text-base text-muted-foreground">The ultimate quiz battleground.</p>
          </div>
        </div>
        <Suspense fallback={<div className="space-y-4"><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-28 mx-auto" /></div>}><LoginForm /></Suspense>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense>
      <PageContent />
    </Suspense>
  )
}
