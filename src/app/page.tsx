"use client";

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { Suspense, useEffect } from 'react';
import { BrainCircuit } from 'lucide-react';
import { LoadingScreen } from '@/components/LoadingScreen';

const LoginForm = dynamic(() => import('@/components/auth/LoginForm').then(m => m.LoginForm), { ssr: false });

function PageContent() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (user) {
      if (user.role === 'executive') router.replace('/executive/analytics');
      else if (user.role === 'commander') router.replace('/commander/dashboard');
      else router.replace('/gladiator/dashboard');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return <LoadingScreen message="Preparing the arena..." />;
  }

  if (user) return null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-secondary/30 p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-[18px] bg-primary/10 flex items-center justify-center border border-primary/20">
            <BrainCircuit className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-headline font-bold tracking-tight">Knowledge Arena</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue to the arena.</p>
        </div>
        <Suspense fallback={
          <div className="space-y-4">
            <Skeleton className="h-11 w-full rounded-[12px]" />
            <Skeleton className="h-11 w-full rounded-[12px]" />
            <Skeleton className="h-11 w-28 mx-auto rounded-[12px]" />
          </div>
        }>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense>
      <PageContent />
    </Suspense>
  );
}
