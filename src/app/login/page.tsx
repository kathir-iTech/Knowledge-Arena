'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, BrainCircuit, Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { LoginForm } from '@/components/auth/LoginForm';
import { getDemoAccount } from '@/lib/demo-accounts';

function LoginPageContent() {
  const searchParams = useSearchParams();
  const demoRole = (searchParams.get('demo') || '') as 'executive' | 'commander' | 'gladiator' | '';
  const demoAccount = demoRole ? getDemoAccount(demoRole) : undefined;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-secondary/30 p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-3">
          <Link href="/" aria-label="Back to home" className="mx-auto flex w-16 h-16 rounded-[18px] bg-primary/10 items-center justify-center border border-primary/20">
            <BrainCircuit className="w-8 h-8 text-primary" />
          </Link>
          <h1 className="text-3xl font-headline font-bold tracking-tight">Knowledge Arena</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue to the arena.</p>
        </div>

        {demoAccount && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-center animate-in">
            <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Demo {demoAccount.label} account pre-filled
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {demoAccount.email} · password <code className="rounded bg-muted px-1 font-semibold">{demoAccount.password}</code>
            </p>
          </div>
        )}

        <Suspense fallback={
          <div className="space-y-4">
            <Skeleton className="h-11 w-full rounded-[12px]" />
            <Skeleton className="h-11 w-full rounded-[12px]" />
            <Skeleton className="h-11 w-28 mx-auto rounded-[12px]" />
          </div>
        }>
          <LoginForm initialValues={{ email: demoAccount?.email, password: demoAccount?.password }} />
        </Suspense>

        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to the landing page
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}
