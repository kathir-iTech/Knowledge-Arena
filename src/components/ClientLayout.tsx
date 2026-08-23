
"use client";

import React, { useEffect, useRef, Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LoadingScreen } from '@/components/LoadingScreen';
import { SessionTimeout } from '@/components/session-timeout';
import { OfflineDetector } from '@/components/offline-detector';
import { Button } from '@/components/ui/button';
import { ROLE_HOME, isValidRole } from '@/lib/auth-redirect';
import { useToast } from '@/hooks/use-toast';

function ClientLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, isLoading, authError, clearAuthError, logout } = useAuth() as any;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const redirecting = useRef<string | null>(null);

  const specialPages = ['/kicked', '/cheating-detected'];

  useEffect(() => {
    if (isLoading) return;

    const currentPath = pathname;
    if (specialPages.includes(currentPath)) {
      redirecting.current = null;
      return;
    }

    if (currentPath.startsWith('/battle')) {
      redirecting.current = null;
      return;
    }

    if (!user) {
      if (currentPath !== '/' && currentPath !== '/login') {
        router.replace('/');
      }
      redirecting.current = null;
      return;
    }

    // Unknown / missing role — single place handling per Phase 103 spec:
    // sign out + show error "Account not recognized — contact your Executive"
    if (!user.role || !isValidRole(user.role)) {
      console.error('[Auth] Unknown role for user', user?.id, user?.role);
      void logout().then(() => {
        toast({ variant: 'destructive', title: 'Account Error', description: 'Account not recognized — contact your Executive' });
      }).catch(() => {});
      if (currentPath !== '/login') {
        router.replace('/login');
      }
      redirecting.current = null;
      return;
    }

    if (user.mustChangePassword && currentPath !== '/force-password-change') {
      router.replace('/force-password-change');
      redirecting.current = null;
      return;
    }

    let target: string | null = null;

    if (currentPath === '/') {
      const base = ROLE_HOME[user.role] || ROLE_HOME.gladiator;
      const qs = searchParams.toString();
      target = qs ? `${base}?${qs}` : base;
    } else if (currentPath === '/login') {
      target = ROLE_HOME[user.role] || ROLE_HOME.gladiator;
    } else {
      const isExecutivePage = currentPath.startsWith('/executive');
      const isCommanderPage = currentPath.startsWith('/commander') || currentPath.startsWith('/create-quiz');
      const isGladiatorPage = currentPath.startsWith('/gladiator');

      if (user.role === 'executive' && (isCommanderPage || isGladiatorPage)) target = ROLE_HOME.executive;
      else if (user.role === 'commander' && (isExecutivePage || isGladiatorPage)) target = ROLE_HOME.commander;
      else if (user.role === 'gladiator' && (isExecutivePage || isCommanderPage)) target = ROLE_HOME.gladiator;
    }

    if (target) {
      if (redirecting.current !== target) {
        redirecting.current = target;
        router.replace(target);
      }
      return;
    }

    redirecting.current = null;
  }, [user, isLoading, pathname, searchParams, router, logout, toast]);

  if (authError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-4 text-center" role="alert">
        <p className="text-lg font-medium">Sign-in failed — please try again</p>
        <p className="text-sm text-muted-foreground">{authError}</p>
        <div className="flex gap-3">
          <Button onClick={() => window.location.reload()}>Reload</Button>
          <Button variant="outline" onClick={() => { clearAuthError?.(); window.location.href = '/login'; }}>Back to Login</Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <LoadingScreen message="Authenticating..." />;
  }

  const skipNav = <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-background focus:text-foreground focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary" tabIndex={1}>Skip to main content</a>;

  const shared = (
    <>
      <OfflineDetector />
      {user && <SessionTimeout />}
      {skipNav}
      <main id="main-content" key={pathname} className="animate-in-fast">{children}</main>
    </>
  );

  if (specialPages.includes(pathname)) return shared;
  if (!user && (pathname === '/' || pathname === '/login')) return shared;
  if (user && pathname.startsWith('/battle')) return shared;
  if (user) return shared;

  return shared;
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <ClientLayoutInner>{children}</ClientLayoutInner>
    </Suspense>
  );
}
