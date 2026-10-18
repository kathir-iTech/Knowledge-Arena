'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Compass, QrCode, Sparkles, UserCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { LoginForm } from '@/components/auth/LoginForm';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, getDemoAccount } from '@/lib/demo-accounts';

function LoginPageContent() {
  const searchParams = useSearchParams();
  const initialRole = searchParams.get('demo') || '';
  const [selectedRole, setSelectedRole] = useState<string>(initialRole || 'executive');

  const demoAccount = selectedRole ? getDemoAccount(selectedRole) : undefined;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-secondary/30 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <Link href="/rpl" aria-label="Back to RPL Portal" className="mx-auto flex w-16 h-16 rounded-[18px] bg-primary/10 items-center justify-center border border-primary/20">
            <Compass className="w-8 h-8 text-primary" />
          </Link>
          <div className="flex items-center justify-center gap-2">
            <Badge variant="outline" className="border-primary/40 bg-primary/5 text-primary text-[10px] font-semibold">
              SIH 2026 · PS: SIH26242
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              MSDE / NCVET Compliant
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-headline font-bold tracking-tight">RPL Compass Workspace</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Sign in to access your designated assessment or governance portal.</p>
        </div>

        {/* ── Evaluator & Jury Quick Access ── */}
        <div className="rounded-xl border border-primary/30 bg-card p-4 shadow-elevation-small space-y-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Sparkles className="h-4 w-4" />
              Jury & Evaluator 1-Click Access
            </p>
            <span className="text-[10px] text-muted-foreground font-mono">Password: {DEMO_PASSWORD}</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {DEMO_ACCOUNTS.map((acc) => {
              const active = selectedRole === acc.role;
              return (
                <button
                  key={acc.role}
                  type="button"
                  onClick={() => setSelectedRole(acc.role)}
                  className={`flex flex-col items-center justify-center rounded-lg p-2 text-center transition-all border text-xs min-h-[56px] ${
                    active
                      ? 'border-primary bg-primary/10 text-primary font-semibold shadow-xs'
                      : 'border-border/60 hover:border-primary/40 hover:bg-muted/40 text-muted-foreground'
                  }`}
                >
                  <span className="text-sm">{acc.avatar}</span>
                  <span className="mt-1 line-clamp-1 text-[11px] font-medium leading-none">{acc.label}</span>
                </button>
              );
            })}
          </div>

          {demoAccount && (
            <div className="rounded-md bg-secondary/60 p-2 text-[11px] text-muted-foreground flex items-center justify-between">
              <span className="truncate">
                Loaded: <strong className="text-foreground">{demoAccount.email}</strong>
              </span>
              <span className="text-success font-medium shrink-0 flex items-center gap-1">
                <UserCheck className="h-3 w-3" /> Ready
              </span>
            </div>
          )}
        </div>

        <Suspense fallback={
          <div className="space-y-4">
            <Skeleton className="h-11 w-full rounded-[12px]" />
            <Skeleton className="h-11 w-full rounded-[12px]" />
            <Skeleton className="h-11 w-28 mx-auto rounded-[12px]" />
          </div>
        }>
          <LoginForm
            key={demoAccount?.email ?? 'empty'}
            initialValues={{ email: demoAccount?.email, password: demoAccount?.password }}
          />
        </Suspense>

        {/* ── Direct Links for Zero-Login Evaluation ── */}
        <div className="space-y-2 text-center text-xs text-muted-foreground">
          <p>
            No login required to test verification:{' '}
            <Link
              href="/rpl/verify/RPL-K7M2-9QWE"
              className="text-primary font-medium hover:underline inline-flex items-center gap-1"
            >
              <QrCode className="h-3.5 w-3.5" />
              Public QR & SHA-256 Seal ↗
            </Link>
          </p>
          <div>
            <Link href="/rpl" className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to RPL Portal Hub
            </Link>
          </div>
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
