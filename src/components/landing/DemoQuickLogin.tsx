'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogIn, ShieldCheck, Swords, Trophy } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { DEMO_ACCOUNTS, DEMO_ROLE_HOME, type DemoAccount } from '@/lib/demo-accounts';
import { cn } from '@/lib/utils';

const ROLE_ICONS: Record<DemoAccount['role'], React.ElementType> = {
  executive: ShieldCheck,
  commander: Swords,
  gladiator: Trophy,
};

export function DemoQuickLogin() {
  const { login } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [pendingRole, setPendingRole] = useState<DemoAccount['role'] | null>(null);

  const handleDemoLogin = async (account: DemoAccount) => {
    setPendingRole(account.role);
    try {
      await login({ email: account.email, password: account.password });
      router.push(DEMO_ROLE_HOME[account.role]);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Demo account unavailable',
        description: 'The demo account was not found. Sign in manually — credentials are shown below.',
      });
      router.push(`/login?demo=${account.role}`);
    } finally {
      setPendingRole(null);
    }
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {DEMO_ACCOUNTS.map(account => {
        const Icon = ROLE_ICONS[account.role];
        const loading = pendingRole === account.role;
        return (
          <button
            key={account.role}
            type="button"
            onClick={() => handleDemoLogin(account)}
            disabled={pendingRole !== null}
            className={cn(
              'card-hover group flex flex-col items-start gap-3 rounded-2xl border bg-card p-5 text-left shadow-elevation-small',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <LogIn className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold">{account.label}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{account.description}</p>
            </div>
            <code className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {account.email}
            </code>
          </button>
        );
      })}
    </div>
  );
}
