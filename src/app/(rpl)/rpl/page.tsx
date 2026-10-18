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
import { Input } from '@/components/ui/input';
import { CompassMark } from '@/components/rpl/CompassMark';
import { DEMO_REFERENCE_CODES } from '@/lib/rpl/demo-data';
import {
  ArrowRight,
  Award,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Layers,
  Mic,
  QrCode,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';

export default function RplLandingPage() {
  const { user, isLoading } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [searchCode, setSearchCode] = useState('');

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

  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = searchCode.trim() || DEMO_REFERENCE_CODES.suresh;
    router.push(`/rpl/verify/${encodeURIComponent(target)}`);
  };

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-8">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-12 p-4 sm:p-8" data-testid="rpl-landing-page">
      {/* ── Official Ministry Header Strip ── */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
            <CompassMark size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-headline font-bold text-base text-foreground tracking-tight">RPL Compass</span>
              <Badge variant="outline" className="border-primary/40 bg-primary/5 text-primary text-[10px] font-semibold py-0">
                NCVET RPL 4.0
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">Ministry of Skill Development and Entrepreneurship · Govt. of India</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[11px] font-mono text-muted-foreground border-border/80">
            SIH 2026 · PS: SIH26242
          </Badge>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs font-medium border-primary/30">
            <Link href="/login">
              Jury / Sign In ↗
            </Link>
          </Button>
        </div>
      </header>

      {/* ── Hero Presentation Section ── */}
      <section className="space-y-6 text-center sm:text-left">
        <div className="space-y-3 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            National Skills Qualifications Framework (NSQF) Engine
          </div>
          <h1 className="text-3xl sm:text-5xl font-headline font-extrabold tracking-tight text-foreground leading-[1.15]">
            Certifying India&apos;s Hands. Formalizing Skills for 400M+ Workers.
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
            Transforming informal trade experience into verified national credentials. Engineered with conversational vernacular voice guidance, real-time Cohen&apos;s &kappa; reliability calibration, and tamper-proof SHA-256 cryptographic seals.
          </p>
        </div>

        {/* ── Primary Action CTAs ── */}
        <div className="flex flex-wrap items-center gap-3">
          {checking ? (
            <Skeleton className="h-12 w-52 rounded-xl" />
          ) : !user ? (
            <Button asChild size="lg" className="h-12 px-6 gap-2 font-semibold shadow-elevation-small text-sm rounded-xl">
              <Link href="/login?next=/rpl/declare">
                Start Skill Assessment <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button asChild size="lg" className="h-12 px-6 gap-2 font-semibold shadow-elevation-small text-sm rounded-xl">
              <Link href="/rpl/declare">
                Open Worker Declaration <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}

          <Button asChild variant="outline" size="lg" className="h-12 px-6 gap-2 border-primary/40 hover:bg-primary/5 text-sm rounded-xl">
            <Link href={`/rpl/verify/${DEMO_REFERENCE_CODES.suresh}`}>
              <QrCode className="h-4 w-4 text-primary" />
              Scan / Verify Demo Credential
            </Link>
          </Button>

          <Button asChild variant="ghost" size="lg" className="h-12 px-4 gap-2 text-muted-foreground hover:text-foreground text-sm">
            <Link href="/rpl/admin/demo-guide">
              <Users className="h-4 w-4 text-primary" />
              Evaluator Demo Guide
            </Link>
          </Button>
        </div>

        {checkError && (
          <p role="alert" className="text-xs text-destructive">
            {checkError}
          </p>
        )}
      </section>

      {/* ── Interactive Instant Credential Verification Search Bar ── */}
      <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-card to-secondary/30 p-5 sm:p-7 shadow-elevation-medium space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-success" />
              National Public Credential Registry
            </h2>
            <p className="text-xs text-muted-foreground">
              Instant verification for employers, state skill councils, and evaluators. No login required.
            </p>
          </div>
          <Badge variant="outline" className="border-success/40 bg-success/10 text-success text-xs font-mono self-start sm:self-auto">
            SHA-256 Ledger
          </Badge>
        </div>

        <form onSubmit={handleVerifySubmit} className="flex flex-col sm:flex-row items-stretch gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              placeholder="Enter reference code (e.g. RPL-K7M2-9QWE)"
              className="pl-10 h-11 text-sm bg-background/80 border-border/80 font-mono"
            />
          </div>
          <Button type="submit" className="h-11 px-6 font-semibold gap-2 shrink-0">
            <CheckCircle2 className="h-4 w-4" />
            Verify Now
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Sample Candidates:</span>
          <button
            type="button"
            onClick={() => {
              setSearchCode(DEMO_REFERENCE_CODES.suresh);
              router.push(`/rpl/verify/${DEMO_REFERENCE_CODES.suresh}`);
            }}
            className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-mono hover:bg-primary/10 hover:text-primary transition-colors border border-border/60"
          >
            Suresh Kumar (Electrician · {DEMO_REFERENCE_CODES.suresh})
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchCode(DEMO_REFERENCE_CODES.meena);
              router.push(`/rpl/verify/${DEMO_REFERENCE_CODES.meena}`);
            }}
            className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-mono hover:bg-primary/10 hover:text-primary transition-colors border border-border/60"
          >
            Meena Devi (Plumber · {DEMO_REFERENCE_CODES.meena})
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchCode(DEMO_REFERENCE_CODES.ravi);
              router.push(`/rpl/verify/${DEMO_REFERENCE_CODES.ravi}`);
            }}
            className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-mono hover:bg-primary/10 hover:text-primary transition-colors border border-border/60"
          >
            Ravi Shankar (Data Entry · {DEMO_REFERENCE_CODES.ravi})
          </button>
        </div>
      </section>

      {/* ── 3 Distinct Stakeholder Workspaces (Role Cards) ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-headline font-bold text-foreground">
            Stakeholder Workspaces
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Purpose-built interfaces tailored to each participant in the National RPL workflow.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Persona 1: Worker / Candidate */}
          <Card className="border-border/80 flex flex-col justify-between hover:border-primary/50 transition-all hover:shadow-elevation-medium bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl">🧑‍🔧</span>
                <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                  Voice-Guided
                </Badge>
              </div>
              <CardTitle className="text-lg font-bold mt-2">Candidate Worker</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                4-step conversational self-declaration with Web Speech voice read-aloud in Hindi, Tamil & English, trade experience ladder, and photo evidence upload.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button asChild variant="outline" className="w-full justify-between h-10 text-xs font-semibold border-primary/30 hover:bg-primary/5">
                <Link href="/rpl/declare">
                  <span>Enter Intake Wizard</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Persona 2: Field Assessor */}
          <Card className="border-border/80 flex flex-col justify-between hover:border-primary/50 transition-all hover:shadow-elevation-medium bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl">📋</span>
                <Badge variant="outline" className="text-[10px] text-foreground border-border">
                  Rubric 1–4 Scale
                </Badge>
              </div>
              <CardTitle className="text-lg font-bold mt-2">Field Assessor</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Evaluate candidates against National Occupational Standards with AI-assisted criterion suggestions, photo inspection, and mandatory human sign-off.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button asChild variant="outline" className="w-full justify-between h-10 text-xs font-semibold border-border hover:bg-accent/10">
                <Link href="/rpl/assessor">
                  <span>Open Assessor Queue</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Persona 3: Ministry & Governance */}
          <Card className="border-border/80 flex flex-col justify-between hover:border-primary/50 transition-all hover:shadow-elevation-medium bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl">🏛️</span>
                <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                  Cohen&apos;s &kappa; Engine
                </Badge>
              </div>
              <CardTitle className="text-lg font-bold mt-2">Ministry & Governance</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Real-time inter-assessor reliability calibration, low-agreement alerts (&kappa; &lt; 0.4), regional center divergence surveillance, and NCVET audit exports.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button asChild variant="outline" className="w-full justify-between h-10 text-xs font-semibold border-primary/30 hover:bg-primary/5">
                <Link href="/rpl/admin">
                  <span>Open Governance Portal</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── 4-Stage Lifecycle Process Flow ── */}
      <section className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg sm:text-xl font-headline font-bold text-foreground flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            The 4-Stage NCVET Assessment Pipeline
          </h2>
          <p className="text-xs text-muted-foreground">
            How undocumented vocational experience is validated, calibrated, and formalized into government credentials.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 relative">
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">1</span>
              <Mic className="h-4 w-4 text-primary" />
            </div>
            <p className="text-sm font-semibold text-foreground">Self-Declaration</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Worker outlines their trade history and evidence with voice read-aloud support in vernacular languages.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">2</span>
              <ClipboardCheck className="h-4 w-4 text-primary" />
            </div>
            <p className="text-sm font-semibold text-foreground">Rubric Evaluation</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Assessor rates competency criteria on a 1–4 rubric with AI-suggested marks and transparent human sign-off.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">3</span>
              <Scale className="h-4 w-4 text-primary" />
            </div>
            <p className="text-sm font-semibold text-foreground">Reliability Calibration</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Cohen&apos;s &kappa; analyzes inter-rater divergence in real-time, instantly flagging rubber-stamping or bias.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="h-6 w-6 rounded-full bg-success/15 text-success text-xs font-bold flex items-center justify-center">4</span>
              <Award className="h-4 w-4 text-success" />
            </div>
            <p className="text-sm font-semibold text-foreground">Digital Certificate</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Official NSQF certificate issued with dynamic QR code, public verification URL, and SHA-256 seal.
            </p>
          </div>
        </div>
      </section>

      {/* ── Key Impact & System Metrics Strip ── */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border/60 bg-card p-4 text-center space-y-1">
          <p className="text-2xl sm:text-3xl font-extrabold text-primary font-headline">400M+</p>
          <p className="text-xs font-medium text-foreground">Informal Workers</p>
          <p className="text-[11px] text-muted-foreground">Target beneficiary scale across India</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4 text-center space-y-1">
          <p className="text-2xl sm:text-3xl font-extrabold text-foreground font-headline">&ge; 0.85</p>
          <p className="text-xs font-medium text-foreground">Target Cohen&apos;s &kappa;</p>
          <p className="text-[11px] text-muted-foreground">Inter-assessor agreement benchmark</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4 text-center space-y-1">
          <p className="text-2xl sm:text-3xl font-extrabold text-primary font-headline">100%</p>
          <p className="text-xs font-medium text-foreground">Human Sign-Off</p>
          <p className="text-[11px] text-muted-foreground">Zero black-box automated decisions</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4 text-center space-y-1">
          <p className="text-2xl sm:text-3xl font-extrabold text-success font-headline">SHA-256</p>
          <p className="text-xs font-medium text-foreground">Cryptographic Seal</p>
          <p className="text-[11px] text-muted-foreground">Tamper-evident verification ledger</p>
        </div>
      </section>

      {/* ── Hackathon Jury Evaluation Fast-Track ── */}
      <section className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-0.5 text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Smart India Hackathon 2026 Evaluation Hub</p>
          <p className="text-sm font-medium text-foreground">Looking to evaluate specific platform modules?</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs font-medium border-primary/30">
            <Link href="/login">
              ⚡ 1-Click Demo Login
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs font-medium border-primary/30">
            <Link href="/rpl/admin/demo-guide">
              📜 Presenter Script Guide
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs font-medium border-primary/30">
            <Link href={`/rpl/verify/${DEMO_REFERENCE_CODES.suresh}`}>
              🔍 Suresh Kumar Certificate
            </Link>
          </Button>
        </div>
      </section>

      {/* ── Official Footer ── */}
      <footer className="border-t border-border/40 pt-6 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        <p>
          Aligned with NCVET RPL Operational Guidelines, NSQF Level Descriptors 1–5, and PMKVY 4.0 Standards.
        </p>
        <p className="font-mono text-[11px]">
          PSG iTech · National Skill Development Corporation Partner Center
        </p>
      </footer>
    </main>
  );
}
