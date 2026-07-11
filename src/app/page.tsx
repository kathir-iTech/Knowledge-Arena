
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
  const roomCode = searchParams.get('roomCode');
  
  if (isLoading) {
    return <LoadingScreen message="Preparing the arena..." />;
  }

  if (user) return null;

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
           <BrainCircuit className="w-16 h-16 text-primary mx-auto" aria-hidden="true" />
          <h1 className="text-4xl font-headline text-primary">Knowledge Arena</h1>
          <p className="text-muted-foreground">The ultimate quiz battleground. Sign in to enter.</p>
        </div>
        <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-24 mx-auto" /></div>}><LoginForm /></Suspense>
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
