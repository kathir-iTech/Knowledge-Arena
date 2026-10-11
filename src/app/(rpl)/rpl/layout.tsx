"use client";

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { getRoleHome } from '@/lib/auth-redirect';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

// Prefix -> allowed roles. Anything NOT listed here is open to every valid
// role (candidate included) — the lists below are deny-lists for the
// higher-privilege surfaces.
const EXECUTIVE_ONLY_PREFIXES = [
  '/rpl/certify',
  '/rpl/consistency',
  '/rpl/forge',
];
const ADMIN_OR_EXECUTIVE_PREFIXES = ['/rpl/admin'];
const ASSESSOR_PREFIXES = ['/rpl/assess', '/rpl/assessor'];

function matchesPrefixes(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function roleAllowed(role: string, allowed: readonly string[]): boolean {
  return allowed.includes(role);
}

export default function RplLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const redirectToastFired = useRef<string | null>(null);

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
    // Wrong-role users go to their OWN home with a visible explanation —
    // never to /login (they are signed in).
    const blocked =
      (matchesPrefixes(current, EXECUTIVE_ONLY_PREFIXES) && user.role !== 'executive') ||
      (matchesPrefixes(current, ADMIN_OR_EXECUTIVE_PREFIXES) &&
        !roleAllowed(user.role, ['executive', 'admin'])) ||
      (matchesPrefixes(current, ASSESSOR_PREFIXES) &&
        !roleAllowed(user.role, ['commander', 'executive', 'assessor']));
    if (blocked) {
      const home = getRoleHome(user.role);
      if (redirectToastFired.current !== current) {
        redirectToastFired.current = current;
        toast({
          title: 'Access redirected',
          description: `You don't have access to that page — returning to your workspace.`,
        });
      }
      router.replace(home);
    }
  }, [user, isLoading, router, pathname, toast]);

  const handleSignOut = async () => {
    await logout();
    router.replace('/login');
  };

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
    (matchesPrefixes(current, EXECUTIVE_ONLY_PREFIXES) && user.role !== 'executive') ||
    (matchesPrefixes(current, ADMIN_OR_EXECUTIVE_PREFIXES) &&
      !roleAllowed(user.role, ['executive', 'admin'])) ||
    (matchesPrefixes(current, ASSESSOR_PREFIXES) &&
      !roleAllowed(user.role, ['commander', 'executive', 'assessor']))
  ) {
    return null;
  }

  return (
    <>
      <div className="fixed right-3 top-3 z-50">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSignOut}
          aria-label="Sign out"
          className="bg-background/90 backdrop-blur"
        >
          <LogOut className="mr-1.5 h-3.5 w-3.5" />
          Sign out
        </Button>
      </div>
      {children}
    </>
  );
}
