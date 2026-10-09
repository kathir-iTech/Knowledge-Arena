"use client";

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getRoleHome } from '@/lib/auth-redirect';
import { Skeleton } from '@/components/ui/skeleton';

const EXECUTIVE_ONLY_PREFIXES = [
  '/rpl/admin',
  '/rpl/certify',
  '/rpl/consistency',
  '/rpl/forge',
];

const COMMANDER_OR_EXECUTIVE_PREFIXES = ['/rpl/assess', '/rpl/assessor'];

function matchesPrefixes(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export default function RplLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.location.pathname.startsWith('/rpl')) return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/rpl-sw.js', { scope: '/rpl/' })
      .catch((err) => {
        console.warn('RPL service worker registration failed:', err);
      });
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      // Phase A5: preserve the RPL destination so login returns here.
      router.replace('/login?next=' + encodeURIComponent(pathname ?? '/rpl'));
      return;
    }
    const current =
      pathname ??
      (typeof window !== 'undefined' ? window.location.pathname : '/rpl');
    if (matchesPrefixes(current, EXECUTIVE_ONLY_PREFIXES)) {
      if (user.role !== 'executive') {
        router.replace(getRoleHome(user.role));
        return;
      }
    } else if (matchesPrefixes(current, COMMANDER_OR_EXECUTIVE_PREFIXES)) {
      if (user.role !== 'commander' && user.role !== 'executive') {
        router.replace(getRoleHome(user.role));
        return;
      }
    }
  }, [user, isLoading, router, pathname]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (!user) return null;

  const current =
    pathname ??
    (typeof window !== 'undefined' ? window.location.pathname : '/rpl');
  if (
    matchesPrefixes(current, EXECUTIVE_ONLY_PREFIXES) &&
    user.role !== 'executive'
  ) {
    return null;
  }
  if (
    matchesPrefixes(current, COMMANDER_OR_EXECUTIVE_PREFIXES) &&
    user.role !== 'commander' &&
    user.role !== 'executive'
  ) {
    return null;
  }

  return <>{children}</>;
}
