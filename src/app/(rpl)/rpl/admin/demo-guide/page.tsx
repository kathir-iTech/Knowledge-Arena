'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { getRoleHome } from '@/lib/auth-redirect';
import { CompassMark } from '@/components/rpl/CompassMark';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  Loader2,
  RotateCcw,
  Scale,
  Terminal,
} from 'lucide-react';

// Part 8: presenter demo guide. A single page a judge-facing presenter opens to
// load the synthetic dataset, see the expected numbers, walk the story, and
// reset between rehearsals. It writes NOTHING itself: it drives the existing
// admin-only /api/rpl/admin/demo endpoint (POST = load, DELETE = remove only
// docs flagged isDemoData).

/** Readiness checklist shown at the top of the page. */
const READY_STEPS = [
  'You are signed in as the RPL admin account (this page is admin/executive only).',
  'The app is pointed at the emulators or a preview project — never production.',
  'Demo data is loaded (use “Load demo data” below; it is idempotent).',
  'Two assessor accounts exist so inter-assessor κ has a real pair to compare.',
  'A second browser/profile is ready to show the worker (candidate) view.',
] as const;

interface WalkStep {
  title: string;
  detail: string;
  href?: string;
  expect: string;
}

/** The demo story, in order. Numbers are what the app recomputes from the seed. */
const WALKTHROUGH: WalkStep[] = [
  {
    title: '1 · Load the demo data',
    detail: 'Use the button below. It writes the whole synthetic set and recomputes κ.',
    expect: 'Success line: “Loaded N docs” with kappa ELE/Q1301=0.385, CON/Q0304=0.765, SSC/Q2212=0.455.',
  },
  {
    title: '2 · Admin overview — the alert fires',
    detail: 'Open the admin dashboard and look at the inter-assessor agreement gauge and alerts.',
    href: '/rpl/admin',
    expect: 'ELE/Q1301 shows κ ≈ 0.38 (Fair) and the low-agreement (κ < 0.4) alert is present.',
  },
  {
    title: '3 · Consistency report — Suresh Kumar, Electrician',
    detail: 'Open the consistency report for the Electrician pack.',
    href: '/rpl/consistency/ELE%2FQ1301',
    expect: 'Suresh Kumar, conflicting assessor scores, κ 0.3846 (Fair, CI −0.03–0.80) — the tool caught it.',
  },
  {
    title: '4 · Assessor queue',
    detail: 'Switch to an assessor account and open the scoring queue.',
    href: '/rpl/assessor',
    expect: 'Workers awaiting scoring, plus this assessor’s pair κ against the panel where they overlap.',
  },
  {
    title: '5 · AI Forge (admin)',
    detail: 'Open the forge and generate a rubric/pack from a plain-language brief.',
    href: '/rpl/forge',
    expect: 'A generated draft, or a clear “AI unavailable” retry message if the key quota is exhausted.',
  },
  {
    title: '6 · Certification — human sign-off',
    detail: 'Open the certify view and show that the recommendation is never auto-issued.',
    expect: 'Status stays PENDING ADMIN SIGN-OFF until the admin explicitly confirms.',
  },
  {
    title: '7 · Reset between rehearsals',
    detail: 'Use “Reset demo” below to delete only the demo-flagged documents.',
    expect: '“Removed N demo documents.” Real records are never touched.',
  },
];

export default function RplAdminDemoGuidePage() {
  const { user, isLoading } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const [busy, setBusy] = useState<'load' | 'reset' | null>(null);
  const [result, setResult] = useState<
    | { kind: 'load'; totalWrites: number; packs: Array<{ packId: string; kappa: number | null }> }
    | { kind: 'reset'; removed: number }
    | null
  >(null);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login?next=' + encodeURIComponent('/rpl/admin/demo-guide'));
      return;
    }
    if (user.role !== 'executive' && user.role !== 'admin') {
      router.replace(getRoleHome(user.role));
    }
  }, [user, isLoading, router]);

  const isAdmin = user?.role === 'admin';

  const handleLoad = useCallback(async () => {
    setBusy('load');
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        toast({ variant: 'destructive', title: 'Not signed in', description: 'Sign in again to load demo data.' });
        return;
      }
      const res = await fetch('/api/rpl/admin/demo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; totalWrites?: number; packs?: Array<{ packId: string; kappa: number | null }> }
        | null;
      if (!res.ok) {
        toast({
          variant: 'destructive',
          title: 'Demo load failed',
          description: data?.error ?? `Request failed (${res.status}).`,
        });
        return;
      }
      const packs = data?.packs ?? [];
      setResult({ kind: 'load', totalWrites: data?.totalWrites ?? 0, packs });
      toast({
        title: 'Demo data loaded',
        description: `${data?.totalWrites ?? 0} documents written.`,
      });
    } catch {
      toast({ variant: 'destructive', title: 'Network error', description: 'Could not reach the demo endpoint.' });
    } finally {
      setBusy(null);
    }
  }, [auth, toast]);

  const handleReset = useCallback(async () => {
    setBusy('reset');
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        toast({ variant: 'destructive', title: 'Not signed in', description: 'Sign in again to reset demo data.' });
        return;
      }
      const res = await fetch('/api/rpl/admin/demo', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => null)) as { error?: string; removed?: number } | null;
      if (!res.ok) {
        toast({
          variant: 'destructive',
          title: 'Demo reset failed',
          description: data?.error ?? `Request failed (${res.status}).`,
        });
        return;
      }
      setResult({ kind: 'reset', removed: data?.removed ?? 0 });
      toast({ title: 'Demo data reset', description: `${data?.removed ?? 0} demo documents removed.` });
    } catch {
      toast({ variant: 'destructive', title: 'Network error', description: 'Could not reach the demo endpoint.' });
    } finally {
      setBusy(null);
    }
  }, [auth, toast]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  if (!user || (user.role !== 'executive' && user.role !== 'admin')) {
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6" data-testid="demo-guide-page">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <CompassMark size={36} className="mt-0.5 shrink-0 text-primary" />
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">Presenter demo guide</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Everything a presenter needs to run the RPL Compass walkthrough: load the
              synthetic dataset, read the expected numbers, and reset between rehearsals.
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0">Synthetic demo data</Badge>
      </header>

      {/* ── Controls ─────────────────────────────────────────────── */}
      {isAdmin ? (
        <Card className="border-primary/30" data-testid="demo-guide-controls">
          <CardHeader className="border-b border-border/30 pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-primary" /> Demo controls
            </CardTitle>
            <CardDescription>
              Load is idempotent (safe to re-run). Reset removes only documents flagged{' '}
              <span className="font-mono">isDemoData</span> — real records are never touched.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 pt-4">
            <button
              type="button"
              data-testid="demo-guide-load"
              onClick={handleLoad}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-[12px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {busy === 'load' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              Load demo data
            </button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  data-testid="demo-guide-reset"
                  disabled={busy !== null}
                  className="inline-flex items-center gap-2 rounded-[12px] border border-destructive/50 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
                >
                  {busy === 'reset' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Reset demo
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset demo data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes every document tagged{' '}
                    <span className="font-mono">isDemoData</span> across workers, assessments,
                    items, evidence, consistency and certifications. Real records are not
                    touched. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleReset}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Reset demo
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {result?.kind === 'load' && (
              <span className="inline-flex items-center gap-1.5 text-sm text-success" data-testid="demo-guide-load-result">
                <CheckCircle2 className="h-4 w-4" />
                Loaded {result.totalWrites} docs
                {result.packs.filter((p) => p.kappa !== null).length > 0 && (
                  <span className="text-muted-foreground">
                    · kappa{' '}
                    {result.packs
                      .filter((p) => p.kappa !== null)
                      .map((p) => `${p.packId}=${p.kappa!.toFixed(3)}`)
                      .join(', ')}
                  </span>
                )}
              </span>
            )}
            {result?.kind === 'reset' && (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="demo-guide-reset-result">
                <RotateCcw className="h-4 w-4" /> Removed {result.removed} demo documents.
              </span>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-warning/40">
          <CardContent className="flex items-start gap-3 pt-4 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>
              Loading and resetting demo data is available to the <strong>admin</strong> account
              only. Sign in as the RPL admin to use the controls; this guide itself is readable
              by executives.
            </span>
          </CardContent>
        </Card>
      )}

      {/* ── Ready checklist ──────────────────────────────────────── */}
      <Card data-testid="demo-guide-ready">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-success" /> Before you start
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {READY_STEPS.map((step, i) => (
              <li key={step} className="flex items-start gap-2 text-sm" data-testid={`demo-guide-ready-${i + 1}`}>
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* ── Walkthrough ──────────────────────────────────────────── */}
      <Card data-testid="demo-guide-walkthrough">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Terminal className="h-4 w-4 text-primary" /> The walkthrough
          </CardTitle>
          <CardDescription>
            The numbers below are what the app recomputes from the seeded ratings — never typed in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {WALKTHROUGH.map((s, i) => (
            <div key={s.title}>
              {i > 0 && <Separator className="my-4" />}
              <div data-testid={`demo-guide-step-${i + 1}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{s.title}</p>
                  {s.href && (
                    <Link
                      href={s.href}
                      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      Open <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{s.detail}</p>
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Scale className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  <span><span className="font-medium text-foreground">Expect:</span> {s.expect}</span>
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        All data loaded here is synthetic demo data. The consistency figures are computed by the
        app&apos;s Cohen&apos;s κ maths; see <span className="font-mono">docs/PPT-CORRECTIONS.md</span>{' '}
        before quoting any number in a slide.
      </p>
    </main>
  );
}
