"use client";

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { getRoleHome } from '@/lib/auth-redirect';
import { isRplAdmin, isRplAssessor, canUseDeclare } from '@/lib/rpl/roles';
import { CompassMarkSmall } from '@/components/rpl/CompassMark';
import { Button } from '@/components/ui/button';

// Prefix -> allowed roles. Anything NOT listed here is open to every valid
// role (candidate included) — the lists below are deny-lists for the
// higher-privilege surfaces.
// Canonical RPL equivalence (src/lib/rpl/roles.ts): admin == executive,
// assessor == commander, candidate == gladiator. Guards accept BOTH vocabs.
const ADMIN_ONLY_PREFIXES = [
  '/rpl/certify',
  '/rpl/forge',
];
// Part C3: consistency reports are viewable by executive OR admin (the demo
// admin account has no executive twin); certify/forge are admin-only (both vocabs).
const ADMIN_OR_EXECUTIVE_PREFIXES = ['/rpl/admin', '/rpl/consistency'];
const ASSESSOR_PREFIXES = ['/rpl/assess', '/rpl/assessor'];
// Part 1.5: the self-declaration wizard is for the worker declaring their own
// skills. Assessors and admins never open it — they are sent to their OWN
// workspace with a toast instead of sitting on somebody else's form.
// Legacy Quorena roles are treated as candidates for RPL purposes (A1), so
// they keep access.
const SELF_DECLARATION_PREFIXES = ['/rpl/declare'];

function matchesPrefixes(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

/** Shared wrong-role decision for the effect (redirect) and the render (null). */
function isBlockedForRole(pathname: string, role: string): boolean {
  return (
    (matchesPrefixes(pathname, ADMIN_ONLY_PREFIXES) && !isRplAdmin(role)) ||
    (matchesPrefixes(pathname, ADMIN_OR_EXECUTIVE_PREFIXES) && !isRplAdmin(role)) ||
    (matchesPrefixes(pathname, ASSESSOR_PREFIXES) && !isRplAssessor(role)) ||
    (matchesPrefixes(pathname, SELF_DECLARATION_PREFIXES) && !canUseDeclare(role))
  );
}

export default function RplLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout, isSigningOut } = useAuth();
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
    const current =
      pathname ??
      (typeof window !== 'undefined' ? window.location.pathname : '/rpl');

    if (!user) {
      // Part 1.4: an explicit sign-out owns the navigation. logout() goes to
      // /login with NO next param — appending `?next=` here is what sent the
      // NEXT account to this user's result page (403 Forbidden).
      if (isSigningOut) return;

      // Allow public RPL surfaces: /rpl (portal landing) and /rpl/verify/* (public QR verification)
      const isPublicRpl = current === '/rpl' || current.startsWith('/rpl/verify');
      if (isPublicRpl) return;

      // Protected internal routes bounce to login with return path
      router.replace('/login?next=' + encodeURIComponent(pathname ?? '/rpl'));
      return;
    }
    // Wrong-role users go to their OWN home with a visible explanation —
    // never to /login (they are signed in) and never left on skeletons.
    if (isBlockedForRole(current, user.role)) {
      const home = getRoleHome(user.role);
      if (redirectToastFired.current !== current) {
        redirectToastFired.current = current;
        toast({
          title: 'Access redirected',
          description: `You don't have access to that page — returning to your workspace.`,
          // Redirect explanations must outlive slow navigations/compiles so the
          // user (and e2e) actually sees why they landed elsewhere.
          duration: 10000,
        });
      }
      router.replace(home);
    }
  }, [user, isLoading, router, pathname, toast, isSigningOut]);

  const handleSignOut = async () => {
    // Part 1.4: ONE code path — logout() clears the cookie, Firebase, stored
    // paths and the offline-queue binding, then navigates to /login itself
    // (no ?next=). Do NOT add a second redirect here: racing router.replace
    // calls were what produced /login?next=<somebody else's result page>.
    await logout();
  };

  if (isLoading) {
    // Part 1.5: a single spinner, never a screenful of skeletons — a
    // wrong-role visitor must not be left staring at loading placeholders.
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  if (!user) return null;

  const current =
    pathname ??
    (typeof window !== 'undefined' ? window.location.pathname : '/rpl');
  // Part 1.5: render NOTHING while the redirect above is in flight (no
  // skeletons) so a wrong-role visitor sees a clean one-tick hand-off.
  if (isBlockedForRole(current, user.role)) {
    return null;
  }

  return (
    <>
      <div className="fixed right-3 top-3 z-50 flex items-center gap-2">
        {/* Part 3: CompassMark brand in the persistent app header */}
        <div
          aria-hidden="true"
          className="hidden items-center rounded-full bg-background/80 p-2 shadow-elevation-small backdrop-blur sm:flex"
        >
          <CompassMarkSmall className="text-primary" />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSignOut}
          aria-label="Sign out"
          className="bg-background/90 backdrop-blur min-h-[40px]"
        >
          <LogOut className="mr-1.5 h-3.5 w-3.5" />
          Sign out
        </Button>
      </div>
      {/* FIX-W2: clear the fixed top-right Sign out pill so page content
          never slides underneath it (notably centred max-w columns) */}
      <div className="pt-8 sm:pt-10">{children}</div>
    </>
  );
}
