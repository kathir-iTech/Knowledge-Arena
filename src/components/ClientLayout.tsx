
"use client";

import React, { useEffect, useRef, Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LoadingScreen } from '@/components/LoadingScreen';
import { SessionTimeout } from '@/components/session-timeout';
import { OfflineDetector } from '@/components/offline-detector';
import { Button } from '@/components/ui/button';
import { ROLE_HOME, isValidRole } from '@/lib/auth-redirect';
import { isAllowedNextPath } from '@/lib/next-path';
import { useToast } from '@/hooks/use-toast';

const SPECIAL_PAGES = ['/kicked', '/cheating-detected'];

function ClientLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, isLoading, authError, clearAuthError, logout, isSigningOut } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const redirecting = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) return;

    const currentPath = pathname;
    if (SPECIAL_PAGES.includes(currentPath)) {
      redirecting.current = null;
      return;
    }

    if (currentPath.startsWith('/battle')) {
      redirecting.current = null;
      return;
    }

    if (!user) {
      // Part 1.4: an explicit sign-out owns the navigation (logout() goes to
      // /login with NO ?next=). Never let this guard append `?next=` during a
      // sign-out — that is what returned the NEXT account to somebody else's
      // result page (403 Forbidden).
      if (isSigningOut) {
        redirecting.current = null;
        return;
      }
      // Phase 1 login chain: /rpl is cookie-gated server-side (middleware →
      // /login). Let the RPL layout own that redirect so server and client
      // agree; everything else unauthenticated goes to the landing page.
      // Phase A5: carry `next` so login returns the user to /rpl.
      if (currentPath === '/rpl' || currentPath.startsWith('/rpl/')) {
        const qs = searchParams.toString();
        router.replace('/login?next=' + encodeURIComponent(currentPath + (qs ? `?${qs}` : '')));
      } else if (currentPath !== '/' && currentPath !== '/login') {
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
      // Part 1.3: only a safe, same-origin, ownership-neutral `?next=` wins
      // over ROLE_HOME — result/ref URLs and anything outside the RPL
      // allowlist fall back to the role home (see src/lib/next-path.ts).
      const safeNext = isAllowedNextPath(searchParams.get('next'));
      if (safeNext === '/rpl') {
        target = ROLE_HOME[user.role] || '/rpl';
      } else {
        target = safeNext || ROLE_HOME[user.role] || ROLE_HOME.gladiator;
      }
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
  }, [user, isLoading, pathname, searchParams, router, logout, toast, isSigningOut]);

  const onLoginPage = pathname === '/login';

  // Part 1.1: the full-screen takeover is reserved for TRUE session-bootstrap
  // failures (session mint impossible, project mismatch, profile resolution
  // failure) and is never rendered on /login — there it becomes an inline
  // banner above the page, so the form stays mounted and keeps what the user
  // typed.
  if (authError && !onLoginPage) {
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

  // Part 5 (axe): a positive tabIndex (was tabIndex={1}) reorders the tab
  // sequence and is an accessibility anti-pattern (axe rule "tabindex"). The
  // skip link is already the first focusable element in the DOM, so natural
  // tab order reaches it first — no explicit tabindex needed.
  const skipNav = <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-background focus:text-foreground focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary">Skip to main content</a>;

  const shared = (
    <>
      <OfflineDetector />
      {user && <SessionTimeout />}
      {skipNav}
      <main id="main-content" key={pathname} className="animate-in-fast">{children}</main>
    </>
  );

  // Part 1.1 — session-bootstrap failure noticed while ON /login: render it
  // inside the page layout with an explicit Retry, never as a blank screen.
  const sessionBanner = authError && onLoginPage ? (
    <div role="alert" className="border-b border-destructive/40 bg-destructive/10 px-4 py-3">
      <div className="mx-auto flex w-full max-w-xl flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-semibold text-destructive">We could not open your session</p>
          <p className="break-words text-xs text-muted-foreground">{authError}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={() => window.location.reload()}>Retry</Button>
          <Button size="sm" variant="ghost" onClick={() => clearAuthError?.()}>Dismiss</Button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {sessionBanner}
      {shared}
    </>
  );
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <ClientLayoutInner>{children}</ClientLayoutInner>
    </Suspense>
  );
}
