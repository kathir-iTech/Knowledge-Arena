"use client";

import { useAuth } from '@/hooks/useAuth';
import { redirect } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { BotMessageSquare } from 'lucide-react';
import { LoginForm } from '@/components/auth/LoginForm';

export default function Home() {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <BotMessageSquare className="w-16 h-16 text-primary mx-auto animate-pulse" />
          <h1 className="text-2xl font-headline text-primary">CYBER GLADIATORS</h1>
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
    );
  }

  if (user) {
    if (user.role === 'Teacher') {
      redirect('/teacher/dashboard');
    } else {
      redirect('/student/dashboard');
    }
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
           <BotMessageSquare className="w-16 h-16 text-primary mx-auto" />
          <h1 className="text-4xl font-headline text-primary">Cyber Gladiators</h1>
          <p className="text-muted-foreground">Enter the arena of knowledge. Sign in or create your account.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
