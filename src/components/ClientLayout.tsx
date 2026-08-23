
"use client";

import React, { useEffect, useRef, Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LoadingScreen } from '@/components/LoadingScreen';
import { SessionTimeout } from '@/components/session-timeout';
import { OfflineDetector } from '@/components/offline-detector';
import { Button } from '@/components/ui/button';

function ClientLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, isLoading, authError, clearAuthError } = useAuth() as any;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
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

    if (!user.role || !['executive', 'commander', 'gladiator'].includes(user.role)) {
      if (currentPath !== '/') {
        router.replace('/');
      }
      redirecting.current = null;
      return;
    }

    if (currentPath.startsWith('/battle')) {
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
      const dashboardMap: Record<string, string> = {
        executive: '/executive/analytics',
        commander: '/commander/dashboard',
        gladiator: '/gladiator/dashboard',
      };
      const base = dashboardMap[user.role] || '/gladiator/dashboard';
      const qs = searchParams.toString();
      target = qs ? `${base}?${qs}` : base;
    } else if (currentPath === '/login') {
      const dashboardMap: Record<string, string> = {
        executive: '/executive/analytics',
        commander: '/commander/dashboard',
        gladiator: '/gladiator/dashboard',
      };
      target = dashboardMap[user.role] || '/gladiator/dashboard';
    } else {
      const isExecutivePage = currentPath.startsWith('/executive');
      const isCommanderPage = currentPath.startsWith('/commander') || currentPath.startsWith('/create-quiz');
      const isGladiatorPage = currentPath.startsWith('/gladiator');

      if (user.role === 'executive' && (isCommanderPage || isGladiatorPage)) target = '/executive/analytics';
      else if (user.role === 'commander' && (isExecutivePage || isGladiatorPage)) target = '/commander/dashboard';
      else if (user.role === 'gladiator' && (isExecutivePage || isCommanderPage)) target = '/gladiator/dashboard';
    }

    if (target) {
      if (redirecting.current !== target) {
        redirecting.current = target;
        router.replace(target);
      }
      return;
    }

    redirecting.current = null;
  }, [user, isLoading, pathname, searchParams, router]);

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
