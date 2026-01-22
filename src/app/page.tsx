
"use client";

import { useAuth } from '@/hooks/useAuth';
import { redirect, useSearchParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { BrainCircuit } from 'lucide-react';
import { LoginForm } from '@/components/auth/LoginForm';
import { Suspense } from 'react';

function PageContent() {
  const { user, isLoading } = useAuth();
  const searchParams = useSearchParams();
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background p-4">
        <div className="flex flex-col items-center gap-4">
          <BrainCircuit className="w-16 h-16 text-primary mx-auto animate-pulse" />
          <h1 className="text-2xl font-headline text-primary">KNOWLEDGE ARENA</h1>
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
    );
  }

  if (user) {
    const roomCode = searchParams.get('roomCode');
    let destination = user.role === 'Teacher' ? '/teacher/dashboard' : '/student/dashboard';
    
    if (user.role === 'Student' && roomCode) {
      destination = `${destination}?roomCode=${roomCode}`;
    }
    
    redirect(destination);
    return null; // Render nothing while redirecting
  }

  // If no user and not loading, always show the LoginForm.
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
           <BrainCircuit className="w-16 h-16 text-primary mx-auto" />
          <h1 className="text-4xl font-headline text-primary">Knowledge Arena</h1>
          <p className="text-muted-foreground">The ultimate quiz battleground. Sign in to enter.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}

export default function Home() {
  // Wrap the component that uses useSearchParams in a Suspense boundary.
  return (
    <Suspense>
      <PageContent />
    </Suspense>
  )
}
