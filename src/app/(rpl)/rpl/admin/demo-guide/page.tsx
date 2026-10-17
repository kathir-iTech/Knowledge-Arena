'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  RefreshCw,
  RotateCcw,
  Scale,
  Terminal,
  XCircle,
} from 'lucide-react';
import { DEMO_REFERENCE_CODES } from '@/lib/rpl/demo-data';

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
  /** One sentence the presenter says out loud. */
  say: string;
  detail: string;
  href?: string;
  expect: string;
  /** Key into the live readiness map below. */
  check: 'demo' | 'consistency' | 'suresh' | 'queue' | 'certify' | 'offline';
}

/**
 * The demo story, in order. Steps 3 and 5 deep-link to Suresh Kumar's real
 * worker id, resolved live from his canonical reference code
 * (RPL-K7M2-9QWE) — never a hard-coded uid. Readiness for every step is
 * computed from live API data (see useReadiness), not from static text.
 */
const WALKTHROUGH: WalkStep[] = [
  {
    title: '1 · Load the demo data',
    say: 'Everything you are about to see is synthetic — I will load the full demo dataset first.',
    detail: 'Use the “Load demo data” button above. It writes the whole synthetic set and recomputes κ.',
    expect: 'Success line: “Loaded N docs” with kappa ELE/Q1301=0.385, CON/Q0304=0.765, SSC/Q2212=0.455.',
    check: 'demo',
  },
  {
    title: '2 · Consistency report — the alert fires',
    say: 'Two assessors scored the same Electrician criteria and disagree — the tool catches it instead of rubber-stamping.',
    detail: 'Open the consistency report for the Electrician pack.',
    href: '/rpl/consistency/ELE%2FQ1301',
    expect: 'κ 0.3846 (Fair, CI −0.03–0.80) with the low-agreement (κ < 0.4) alert present.',
    check: 'consistency',
  },
  {
    title: '3 · Suresh Kumar — profile, ladder and evidence',
    say: 'This is Suresh Kumar, an electrician with 8 years of experience — profile, qualification ladder and evidence timeline.',
    detail: 'Open the candidate profile, the matched-pack ladder and the evidence timeline.',
    expect: 'Suresh Kumar (Electrician, ELE/Q1301), unit ladder with scores, ≥1 evidence item.',
    check: 'suresh',
  },
  {
    title: '4 · Assessor view — AI suggestion is a suggestion only',
    say: 'The assessor sees an AI-proposed score, but must apply it explicitly — the flag is set only on apply.',
    detail: 'Switch to an assessor account and open the scoring queue, then one assessment.',
    href: '/rpl/assessor',
    expect: 'Workers awaiting scoring; the AI suggestion renders as a suggestion with an explicit apply action.',
    check: 'queue',
  },
  {
    title: '5 · Certification review and sign-off',
    say: 'Nothing is auto-issued — certification waits for a human sign-off.',
    detail: 'Open the certify view for Suresh Kumar.',
    expect: 'A draft recommendation (derived “recommend_reassessment” for Suresh) with explicit sign-off buttons — never auto-issued.',
    check: 'certify',
  },
  {
    title: '6 · Offline note',
    say: 'On a patchy site connection the declaration is saved on the device and synced later — never lost.',
    detail: 'Open the declaration wizard and note the offline banner and queued-submit copy.',
    href: '/rpl/declare',
    expect: '“You are offline … saved and submitted when you reconnect” notice ships on the page.',
    check: 'offline',
  },
];

/** Suresh Kumar's canonical demo reference code (resolves to his worker id). */
const SURESH_REF = DEMO_REFERENCE_CODES.suresh;

type StepState = 'checking' | 'ready' | 'not-ready';

interface StepReadiness {
  state: StepState;
  detail: string;
  /** Resolved deep link for steps whose target needs a live id (Suresh). */
  href?: string;
}

const CHECKING: StepReadiness = { state: 'checking', detail: 'Checking live data…' };

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
  const [readiness, setReadiness] = useState<Record<WalkStep['check'], StepReadiness>>({
    demo: CHECKING,
    consistency: CHECKING,
    suresh: CHECKING,
    queue: CHECKING,
    certify: CHECKING,
    offline: CHECKING,
  });
  const [checking, setChecking] = useState(false);
  // Guards overlapping refresh runs (auto-run on mount vs manual Re-check):
  // only the latest run may publish its results.
  const refreshSeq = useRef(0);

  /**
   * Live readiness for every walkthrough step, computed from real API data
   * (never static text): overview worker count, the recomputed ELE/Q1301
   * consistency doc (+ the fired κ<0.4 alert event), Suresh resolved by his
   * canonical reference code, the assessor queue, his pending sign-off, and
   * the declare route serving.
   */
  const refreshReadiness = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    if (!token) return;
    const seq = (refreshSeq.current += 1);
    setChecking(true);
    const headers = { Authorization: `Bearer ${token}` };
    const next: Record<WalkStep['check'], StepReadiness> = {
      demo: { state: 'not-ready', detail: 'No workers found — load the demo data.' },
      consistency: { state: 'not-ready', detail: 'No ELE/Q1301 consistency doc yet.' },
      suresh: { state: 'not-ready', detail: `No worker with reference ${SURESH_REF} yet.` },
      queue: { state: 'not-ready', detail: 'Assessor queue is empty.' },
      certify: { state: 'not-ready', detail: 'No pending sign-off for Suresh yet.' },
      offline: { state: 'not-ready', detail: 'Declare route did not serve.' },
    };
    try {
      const overRes = await fetch('/api/rpl/admin/overview', { headers });
      const overBody = (await overRes.json().catch(() => null)) as {
        totalWorkers?: number;
      } | null;
      if (overRes.ok && overBody && typeof overBody.totalWorkers === 'number' && overBody.totalWorkers > 0) {
        next.demo = { state: 'ready', detail: `${overBody.totalWorkers} workers present.` };
      }
      // The fired alert is observed through GET /api/rpl/alerts (which runs
      // the monitor rule directly), not the overview's 10-item activity
      // slice — the slice can drop the event under load.
      let alertFired = false;
      try {
        const alRes = await fetch('/api/rpl/alerts', { headers });
        const alBody = (await alRes.json().catch(() => null)) as {
          alerts?: Array<{ packId?: string }>;
        } | null;
        alertFired =
          alRes.ok &&
          !!alBody &&
          Array.isArray(alBody.alerts) &&
          alBody.alerts.some((a) => a?.packId === 'ELE/Q1301');
      } catch {
        alertFired = false;
      }

      const conRes = await fetch(`/api/rpl/consistency/${encodeURIComponent('ELE/Q1301')}`, { headers });
      const conBody = (await conRes.json().catch(() => null)) as {
        overallKappa?: number | null;
      } | null;
      if (conRes.ok && conBody && typeof conBody.overallKappa === 'number') {
        const k = conBody.overallKappa;
        next.consistency = {
          state: 'ready',
          detail: `κ=${k.toFixed(4)}${k < 0.4 ? (alertFired ? ', low-agreement alert fires' : ', below the 0.4 alert line') : ''}.`,
        };
      }

      const stRes = await fetch(`/api/rpl/status/${encodeURIComponent(SURESH_REF)}`, { headers });
      const stBody = (await stRes.json().catch(() => null)) as { workerId?: string; stage?: string } | null;
      if (stRes.ok && stBody && typeof stBody.workerId === 'string') {
        const profRes = await fetch(`/api/rpl/profile/${encodeURIComponent(stBody.workerId)}`, { headers });
        const profBody = (await profRes.json().catch(() => null)) as {
          profile?: { trade?: string } | null;
          recommendation?: { status?: string } | null;
          evidence?: unknown[];
        } | null;
        const evidenceCount = profRes.ok && profBody && Array.isArray(profBody.evidence) ? profBody.evidence.length : 0;
        if (profRes.ok && profBody && profBody.profile) {
          next.suresh = {
            state: evidenceCount > 0 ? 'ready' : 'not-ready',
            detail:
              evidenceCount > 0
                ? `Suresh Kumar profile serves with ${evidenceCount} evidence item(s).`
                : 'Profile serves but has no evidence yet.',
            href: `/rpl/profile/${encodeURIComponent(stBody.workerId)}`,
          };
          const recStatus = profBody.recommendation?.status;
          // The certify page renders every derived recommendation as a DRAFT
          // ("Draft: pending human sign-off" for anything but an issued
          // recommend_certification) with explicit sign-off buttons — nothing
          // is ever auto-issued. Ready = a draft recommendation exists.
          next.certify =
            typeof recStatus === 'string' && recStatus.length > 0
              ? {
                  state: 'ready',
                  detail: `Draft “${recStatus}” awaits human sign-off — nothing auto-issued.`,
                  href: `/rpl/certify/${encodeURIComponent(stBody.workerId)}`,
                }
              : {
                  state: 'not-ready',
                  detail: 'No draft recommendation for Suresh yet.',
                };
        } else {
          next.suresh = { state: 'not-ready', detail: 'Suresh worker found but profile has no assessment yet.' };
        }
      }

      const qRes = await fetch('/api/rpl/assess', { headers });
      const qBody = (await qRes.json().catch(() => null)) as { assessments?: unknown[] } | null;
      if (qRes.ok && qBody && Array.isArray(qBody.assessments) && qBody.assessments.length > 0) {
        next.queue = { state: 'ready', detail: `${qBody.assessments.length} assessment(s) in the queue.` };
      }

      const decRes = await fetch('/rpl/declare', { method: 'GET', credentials: 'same-origin' });
      if (decRes.ok) {
        next.offline = { state: 'ready', detail: 'Declare route serves (offline notice ships on that page).' };
      }
    } catch {
      // Keep per-step not-ready details; the page never crashes on a check failure.
    } finally {
      if (seq === refreshSeq.current) {
        setReadiness(next);
      }
      if (seq === refreshSeq.current) {
        setChecking(false);
      }
    }
  }, [auth]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) return;
    if (user.role !== 'executive' && user.role !== 'admin') return;
    void refreshReadiness();
  }, [user, isLoading, refreshReadiness]);

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
      void refreshReadiness();
    } catch {
      toast({ variant: 'destructive', title: 'Network error', description: 'Could not reach the demo endpoint.' });
    } finally {
      setBusy(null);
    }
  }, [auth, toast, refreshReadiness]);

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
      void refreshReadiness();
    } catch {
      toast({ variant: 'destructive', title: 'Network error', description: 'Could not reach the demo endpoint.' });
    } finally {
      setBusy(null);
    }
  }, [auth, toast, refreshReadiness]);

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
              className="inline-flex items-center gap-2 rounded-[12px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 min-h-[40px]"
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
                  className="inline-flex items-center gap-2 rounded-[12px] border border-destructive/50 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60 min-h-[40px]"
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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Terminal className="h-4 w-4 text-primary" /> The walkthrough
              </CardTitle>
              <CardDescription>
                The numbers below are what the app recomputes from the seeded ratings — never typed in.
              </CardDescription>
            </div>
            <button
              type="button"
              data-testid="demo-guide-recheck"
              onClick={() => void refreshReadiness()}
              disabled={checking}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-border/60 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent/30 disabled:opacity-60 min-h-[40px]"
            >
              <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} />
              Re-check readiness
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {WALKTHROUGH.map((s, i) => {
            const r = readiness[s.check];
            const href = r.href ?? s.href;
            return (
              <div key={s.title}>
                {i > 0 && <Separator className="my-4" />}
                <div data-testid={`demo-guide-step-${i + 1}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium">{s.title}</p>
                    <span
                      data-testid={`demo-guide-step-${i + 1}-ready`}
                      className={`inline-flex max-w-full shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        r.state === 'ready'
                          ? 'bg-success/15 text-[hsl(136_68%_22%)] dark:text-success'
                          : r.state === 'checking'
                            ? 'bg-muted text-foreground'
                            : 'bg-warning/15 text-warning-foreground dark:text-warning'
                      }`}
                    >
                      {r.state === 'ready' ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : r.state === 'checking' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      {r.state === 'ready' ? 'Ready' : r.state === 'checking' ? 'Checking…' : 'Not ready'} — {r.detail}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Say:</span> {s.say}
                    </p>
                    {href && (
                      <Link
                        href={href}
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
            );
          })}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        All data loaded here is synthetic demo data. The consistency figures are computed by the
        app&apos;s Cohen&apos;s κ maths; see <span className="font-mono">docs/PPT-CORRECTIONS.md</span>{' '}
        before quoting any number in a slide. Between rehearsals, use “Reset demo” in the Demo
        controls above — it deletes only demo-flagged documents.
      </p>
    </main>
  );
}
