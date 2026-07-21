
"use client";

import React, { useEffect, useRef, Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LoadingScreen } from '@/components/LoadingScreen';

function ClientLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
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
      if (currentPath !== '/') {
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

  if (isLoading) {
    return <LoadingScreen message="Authenticating..." />;
  }

  const skipNav = <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-background focus:text-foreground focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary" tabIndex={1}>Skip to main content</a>;

  if (specialPages.includes(pathname)) {
    return <>{skipNav}<main id="main-content">{children}</main></>;
  }

  if (!user && pathname === '/') {
    return <>{skipNav}<main id="main-content">{children}</main></>;
  }

  if (user && pathname.startsWith('/battle')) {
    return <>{skipNav}<main id="main-content">{children}</main></>;
  }

  if (user) {
    return <>{skipNav}<main id="main-content">{children}</main></>;
  }

  return <>{skipNav}<main id="main-content">{children}</main></>;
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <ClientLayoutInner>{children}</ClientLayoutInner>
    </Suspense>
  );
}
