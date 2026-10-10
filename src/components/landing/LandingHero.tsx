import Link from 'next/link';
import { ArrowRight, Check, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Per-criterion scoring mockup — one competency unit of ELE/Q1301
const CRITERIA_MOCK = [
  { criterion: 'Select and use hand tools', score: 4, ai: false },
  { criterion: 'Connect single-phase circuits', score: 4, ai: true },
  { criterion: 'Test insulation resistance', score: 3, ai: false },
  { criterion: 'Diagnose motor faults', score: 3, ai: true },
];

const RUBRIC_LABELS: Record<number, string> = {
  1: 'Not demonstrated',
  2: 'Partially demonstrated',
  3: 'With prompting',
  4: 'Independent',
};

export function LandingHero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-primary/15 blur-3xl animate-orb will-change-transform" style={{ willChange: 'transform' }} />
        <div className="absolute top-24 -right-24 h-96 w-96 rounded-full bg-accent/15 blur-3xl animate-orb will-change-transform" style={{ animationDelay: '-4s', willChange: 'transform' }} />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-warning/10 blur-3xl animate-glow-pulse will-change-transform" style={{ willChange: 'transform, opacity' }} />
      </div>

      <div className="page-container relative grid items-center gap-12 py-20 md:py-28 lg:grid-cols-2 lg:gap-8">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-elevation-small">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            AI-assisted RPL assessment · NSQF / NCVET
          </div>

          <h1 className="mt-6 font-headline text-5xl font-bold leading-[1.05] tracking-[-0.02em] text-balance sm:text-6xl lg:text-[3.75rem]">
            Standardise how assessors{' '}
            <span className="gradient-text">judge — not who passes.</span>
          </h1>

          <p className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg">
            RPL Compass turns decades of informal trade experience into nationally
            recognised certification: AI-matched self-declarations, per-criterion
            rubric scoring, and inter-assessor agreement measured live — not assumed.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-12 px-7 text-base font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Link href="/rpl">
                Start an assessment
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 px-7 text-base focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Link href="#workflow">
                <Zap className="mr-2 h-4 w-4 text-warning" />
                See how it works
              </Link>
            </Button>
          </div>

          <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t pt-8">
            {[
              { value: '\u03BA', label: 'Live inter-assessor agreement' },
              { value: '1\u20134', label: 'Per-criterion rubric' },
              { value: 'Offline', label: 'Queues work, syncs later' },
            ].map(stat => (
              <div key={stat.label}>
                <dt className="font-headline text-2xl font-bold text-foreground">{stat.value}</dt>
                <dd className="mt-1 text-xs text-muted-foreground">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Assessment preview card — per-criterion scoring + consistency */}
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="absolute -inset-6 rounded-[32px] bg-gradient-to-br from-primary/20 via-accent/10 to-transparent blur-2xl animate-glow-pulse" aria-hidden="true" style={{ willChange: 'transform, opacity' }} />
          <div className="relative rounded-3xl border bg-card/90 p-5 shadow-elevation-large backdrop-blur animate-float" style={{ willChange: 'transform' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-headline text-lg font-bold tracking-tight">ELE/Q1301 · Electrician</p>
                <p className="text-xs text-muted-foreground">NSQF Level 4 · Unit N1301 · Assessor scoring</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
                <ShieldCheck className="h-3.5 w-3.5" />
                PENDING SIGN-OFF
              </span>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Performance criteria</span>
                <span className="font-headline text-sm font-bold tabular-nums text-primary">
                  \u03BA 0.72 <span className="text-xs font-semibold text-success">Substantial</span>
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-primary to-accent" />
              </div>
            </div>

            {/* Per-criterion rubric mockup */}
            <div className="mt-5 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Per-criterion rubric · assessor decides
              </p>
              {CRITERIA_MOCK.map((row, i) => (
                <div
                  key={row.criterion}
                  className="flex items-center gap-3 rounded-xl border bg-background/60 p-2.5 animate-in"
                  style={{ animationDelay: `${i * 120}ms` }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent font-headline text-xs font-bold text-white shadow-elevation-small">
                    {row.score}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium">{row.criterion}</span>
                  {row.ai ? (
                    <span
                      className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
                      title="AI-proposed mark — the assessor must accept, modify or reject it"
                    >
                      AI-proposed
                    </span>
                  ) : (
                    <Check className="h-4 w-4 shrink-0 text-success" aria-label={`Assessor scored: ${RUBRIC_LABELS[row.score]}`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
