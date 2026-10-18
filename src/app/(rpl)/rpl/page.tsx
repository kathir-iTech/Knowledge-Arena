'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { rplErrorMessage } from '@/lib/rpl/api-errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CompassMark } from '@/components/rpl/CompassMark';
import { DEMO_REFERENCE_CODES } from '@/lib/rpl/demo-data';
import {
  ArrowRight,
  ChevronRight,
  ClipboardCheck,
  Layers,
  Mic,
  QrCode,
  Scale,
  ShieldCheck,
  Users,
  WifiOff,
} from 'lucide-react';

const STEPS = ['Declare', 'Assess', 'Profile', 'Certificate'] as const;

function ProcessDiagram() {
  // Hand-rolled SVG: 4 boxes + arrows. Uses Tailwind CSS-var tokens via fill-/stroke-.
  const boxW = 140;
  const boxH = 56;
  const gap = 32;
  const y = 24;
  const totalW = STEPS.length * boxW + (STEPS.length - 1) * gap;
  return (
    <svg
      viewBox={`0 0 ${totalW} ${boxH + 48}`}
      className="h-auto w-full max-w-2xl mx-auto"
      role="img"
      aria-label="RPL process: Declare, then Assess, then Profile, then Certificate"
    >
      <defs>
        <marker
          id="rpl-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
        </marker>
      </defs>
      {STEPS.map((label, i) => {
        const x = i * (boxW + gap);
        return (
          <g key={label}>
            <rect
              x={x}
              y={y}
              width={boxW}
              height={boxH}
              rx={12}
              className="fill-card stroke-border"
              strokeWidth={1.5}
            />
            <text
              x={x + boxW / 2}
              y={y + 24}
              textAnchor="middle"
              className="fill-foreground font-semibold"
              fontSize={13}
            >
              {`${i + 1}. ${label}`}
            </text>
            <text
              x={x + boxW / 2}
              y={y + 42}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize={11}
            >
              {i === 0
                ? 'Tell us your skills'
                : i === 1
                  ? 'Expert reviews you'
                  : i === 2
                    ? 'Skills mapped'
                    : 'Get certified'}
            </text>
            {i < STEPS.length - 1 && (
              <line
                x1={x + boxW + 4}
                y1={y + boxH / 2}
                x2={x + boxW + gap - 4}
                y2={y + boxH / 2}
                className="stroke-muted-foreground"
                strokeWidth={2}
                markerEnd="url(#rpl-arrow)"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function RplLandingPage() {
  // Authoritative page-level guard (global (rpl) layout guard exists but this
  // stays authoritative). Unauthenticated users see the landing + login CTA and
  // are never redirect-looped; signed-in workers with a declaration go to status.
  const { user, isLoading } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  // Part 3: the "does this worker already have a status?" probe used to be
  // swallowed silently. Keep the visitor on the landing page (that part is
  // still correct) but TELL them when the probe failed or their session ended.
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    const rawUid = user?.id;
    if (!rawUid || !rawUid.trim()) return;
    const workerId: string = rawUid.trim();
    let cancelled = false;
    async function check() {
      setChecking(true);
      setCheckError(null);
      try {
        const token = await auth.currentUser?.getIdToken().catch(() => null);
        if (!token || cancelled) {
          if (!token && !cancelled) setCheckError(rplErrorMessage(401, null, 'Please sign in again.'));
          return;
        }
        const res = await fetch(`/api/rpl/status/${encodeURIComponent(workerId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        // B3: only redirect when a REAL status comes back. A 200
        // { status: 'none' } (own record, no declaration) must keep the worker
        // on the landing page so they can start their assessment.
        const body = (await res.json().catch(() => null)) as {
          stage?: unknown;
          error?: string;
        } | null;
        if (cancelled) return;
        if (res.status === 401) {
          setCheckError(rplErrorMessage(res.status, body?.error, 'Please sign in again.'));
          return;
        }
        if (!res.ok) {
          // Part 3: a failed probe must be VISIBLE (it used to be swallowed).
          setCheckError(
            rplErrorMessage(res.status, body?.error, 'We could not check your status. Please try again.'),
          );
          return;
        }
        if (body && typeof body.stage === 'string') {
          router.replace('/rpl/status');
        }
      } catch {
        if (!cancelled) setCheckError('We could not check your status. Please try again.');
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [user, isLoading, auth, router]);

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-40 w-full" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 p-4 sm:p-6" data-testid="rpl-landing-page">
      {/* ── Ministry & Hackathon Header Pill ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-primary/40 bg-primary/5 text-primary text-xs font-semibold">
            MSDE · Government of India
          </Badge>
          <Badge variant="secondary" className="text-xs">
            NCVET RPL 4.0 Standard
          </Badge>
        </div>
        <Badge variant="outline" className="text-[11px] font-mono text-muted-foreground border-border/60">
          Smart India Hackathon 2026 · PS: SIH26242
        </Badge>
      </div>

      {/* ── Hero Presentation ── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 shadow-elevation-small mx-auto sm:mx-0">
            <CompassMark size={48} className="text-primary" aria-label="RPL Compass Logo" />
          </div>
          <div className="text-center sm:text-left">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground font-headline">
              RPL Compass
            </h1>
            <p className="text-base sm:text-lg text-primary font-medium mt-0.5">
              National AI-Assisted Recognition of Prior Learning & Reliability Engine
            </p>
          </div>
        </div>
        <p className="text-sm sm:text-base text-muted-foreground max-w-3xl leading-relaxed">
          Empowering India&apos;s 400M+ unorganized artisans, technicians, and craftspeople with formal National Skills Qualifications Framework (NSQF) certification. Engineered with conversational vernacular voice guidance, real-time Cohen&apos;s &kappa; inter-assessor reliability calibration, and tamper-proof SHA-256 cryptographic credential verification.
        </p>

        {/* ── Main CTA Actions ── */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {checking ? (
            <Skeleton className="h-11 w-48" />
          ) : !user ? (
            <Button asChild size="lg" className="min-h-[44px] gap-2 font-semibold shadow-elevation-small">
              <Link href="/login?next=/rpl/declare">
                Sign In to Start Assessment <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button asChild size="lg" className="min-h-[44px] gap-2 font-semibold shadow-elevation-small">
              <Link href="/rpl/declare">
                Start Worker Declaration <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          )}

          <Button asChild variant="outline" size="lg" className="min-h-[44px] gap-2 border-primary/40 hover:bg-primary/5">
            <Link href={`/rpl/verify/${DEMO_REFERENCE_CODES.suresh}`}>
              <QrCode className="h-4 w-4 text-primary" />
              Verify Demo Credential (SHA-256)
            </Link>
          </Button>

          <Button asChild variant="ghost" size="lg" className="min-h-[44px] gap-2 text-muted-foreground hover:text-foreground">
            <Link href="/rpl/admin/demo-guide">
              <Users className="h-4 w-4 text-primary" />
              Evaluator Walkthrough Guide
            </Link>
          </Button>
        </div>

        {!checking && checkError ? (
          <p role="alert" className="text-sm text-destructive">
            {checkError}
          </p>
        ) : null}
      </div>

      {/* ── Live Technical Pillars (4 Metrics) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/60 bg-card/60 shadow-elevation-small hover:shadow-elevation-medium transition-all">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Scale className="h-5 w-5" />
              </div>
              <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
                &kappa; &ge; 0.85 Target
              </Badge>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Multi-Rater Reliability</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Live Cohen&apos;s weighted &kappa; mathematical calibration flags assessor disagreement to prevent rubber-stamping.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 shadow-elevation-small hover:shadow-elevation-medium transition-all">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="h-9 w-9 rounded-xl bg-success/10 flex items-center justify-center text-success">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <Badge variant="outline" className="text-[10px] font-mono border-success/30 text-success">
                SHA-256 Checksum
              </Badge>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Anti-Tamper Integrity</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Cryptographic digital ledger seal validated client-side in real-time matching the official NCVET registry.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 shadow-elevation-small hover:shadow-elevation-medium transition-all">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="h-9 w-9 rounded-xl bg-accent/20 flex items-center justify-center text-accent-foreground">
                <Mic className="h-5 w-5" />
              </div>
              <Badge variant="outline" className="text-[10px] font-mono border-accent/40 text-foreground">
                3 Languages
              </Badge>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Vernacular Voice TTS</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Web Speech API audio read-aloud in Hindi (हिन्दी), Tamil (தமிழ்), and Indian English for semi-literate artisans.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 shadow-elevation-small hover:shadow-elevation-medium transition-all">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
                <WifiOff className="h-5 w-5 text-primary" />
              </div>
              <Badge variant="outline" className="text-[10px] font-mono">
                PWA IndexedDB
              </Badge>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Offline Field Resilience</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Full client offline caching & background sync queue for remote rural assessment camps with zero dropouts.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Interactive Evaluator & Stakeholder Demo Portals ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Live Demonstration & Stakeholder Portals
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Direct access to all 4 role workflows engineered for the SIH 2026 jury evaluation.
            </p>
          </div>
          <Badge variant="secondary" className="hidden sm:inline-flex text-xs">
            Interactive Testbed
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Portal 1: Candidate Declaration */}
          <Card className="card-hover border-border/80 flex flex-col justify-between">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[11px] text-primary border-primary/30">
                  Worker / Candidate
                </Badge>
                <Mic className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-base mt-2">Self-Declaration & Evidence Capture</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Experience the 4-step wizard with vernacular voice read-aloud, experiential trade mapping, and multi-format evidence upload.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button asChild variant="outline" size="sm" className="w-full justify-between min-h-[38px]">
                <Link href="/rpl/declare">
                  <span>Open Declaration Wizard</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Portal 2: Public Verification */}
          <Card className="card-hover border-border/80 flex flex-col justify-between">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[11px] text-success border-success/30">
                  Public & Employer Registry
                </Badge>
                <QrCode className="h-4 w-4 text-success" />
              </div>
              <CardTitle className="text-base mt-2">QR & SHA-256 Credential Authenticator</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Validate exemplar candidate Suresh Kumar&apos;s credential with real-time in-browser SHA-256 seal calculation and audit trail export.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button asChild variant="outline" size="sm" className="w-full justify-between min-h-[38px]">
                <Link href={`/rpl/verify/${DEMO_REFERENCE_CODES.suresh}`}>
                  <span>Verify Credential RPL-K7M2-9QWE</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Portal 3: Assessor Studio */}
          <Card className="card-hover border-border/80 flex flex-col justify-between">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[11px] text-foreground border-border">
                  Field Assessor
                </Badge>
                <ClipboardCheck className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-base mt-2">Criterion Rubric Scoring Studio</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Evaluate candidates against NSQF National Occupational Standards with AI suggested scoring, justification logs, and strict human sign-off.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button asChild variant="outline" size="sm" className="w-full justify-between min-h-[38px]">
                <Link href="/rpl/assessor">
                  <span>Open Assessor Scoring Queue</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Portal 4: Admin & Governance */}
          <Card className="card-hover border-border/80 flex flex-col justify-between">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[11px] text-primary border-primary/30">
                  Ministry Executive / Admin
                </Badge>
                <Scale className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-base mt-2">Governance & Reliability Analytics</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Live Cohen&apos;s &kappa; agreement gauges, Regional Training Center calibration surveillance, divergence diagnostics, and official NCVET audit reports.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button asChild variant="outline" size="sm" className="w-full justify-between min-h-[38px]">
                <Link href="/rpl/admin">
                  <span>Open Governance Dashboard</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── 4-Stage RPL Qualification Architecture ── */}
      <Card className="border-border/80">
        <CardHeader className="border-b border-border/40 pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" /> The 4-Stage RPL Lifecycle
          </CardTitle>
          <CardDescription>
            How prior informal work experience is assessed, calibrated, and converted into an official NCVET qualification.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <ProcessDiagram />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-center sm:text-left pt-2 border-t border-border/40">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-primary">1. Self-Declaration</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Worker states years of trade practice, uploads photo evidence, and listens via voice read-aloud.
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-primary">2. Rubric Assessment</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Certified assessor evaluates trade criteria on a 1-4 scale with transparent AI-assisted guidance.
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-primary">3. Statistical Calibration</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Multi-rater engine computes Cohen&apos;s &kappa; to detect institutional bias or criterion divergence.
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-primary">4. Digital Certification</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Tamper-proof credential generated with dynamic QR and SHA-256 cryptographic seal.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Statutory Compliance Footnote ── */}
      <footer className="border-t border-border/40 pt-4 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        <p>
          Compliant with NCVET RPL Operational Guidelines, NSQF Level Descriptors 1–5, and PMKVY 4.0 Standards.
        </p>
        <p className="font-mono text-[11px]">
          Deployment: sih-26242-rpl · SHA-256 Ledger Verified
        </p>
      </footer>
    </main>
  );
}
