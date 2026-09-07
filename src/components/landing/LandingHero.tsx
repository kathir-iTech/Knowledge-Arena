import Link from 'next/link';
import { ArrowRight, Radio, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Live quiz leaderboard mockup — top scores
const LEADERBOARD = [
  { initials: 'R', name: 'Ruby', score: 1240, gradient: 'from-primary to-accent' },
  { initials: 'A', name: 'Atlas', score: 980, gradient: 'from-accent to-warning' },
  { initials: 'L', name: 'Lola', score: 360, gradient: 'from-success to-primary' },
];

const RANK_LABELS = ['I', 'II', 'III'];

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
            AI-powered quizzes from any PDF
          </div>

          <h1 className="mt-6 font-headline text-5xl font-bold leading-[1.05] tracking-[-0.02em] text-balance sm:text-6xl lg:text-7xl">
            Turn any lesson into a{' '}
            <span className="gradient-text">live quiz.</span>
          </h1>

          <p className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg">
            Upload a PDF and Quorena turns it into a quiz in minutes. Students
            join with a room code and compete in real time on any device.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-12 px-7 text-base font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Link href="/login">
                Sign in
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 px-7 text-base focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Link href="#product">
                <Zap className="mr-2 h-4 w-4 text-warning" />
                See how it works
              </Link>
            </Button>
          </div>

          <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t pt-8">
            {[
              { value: 'Code', label: 'Join with a room code' },
              { value: 'Live', label: 'Real-time leaderboard' },
              { value: 'AI', label: 'AI-made questions' },
            ].map(stat => (
              <div key={stat.label}>
                <dt className="font-headline text-2xl font-bold text-foreground">{stat.value}</dt>
                <dd className="mt-1 text-xs text-muted-foreground">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Quiz preview card — leaderboard mockup */}
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="absolute -inset-6 rounded-[32px] bg-gradient-to-br from-primary/20 via-accent/10 to-transparent blur-2xl animate-glow-pulse" aria-hidden="true" style={{ willChange: 'transform, opacity' }} />
          <div className="relative rounded-3xl border bg-card/90 p-5 shadow-elevation-large backdrop-blur animate-float" style={{ willChange: 'transform' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-headline text-lg font-bold tracking-tight">Midterm Review Quiz</p>
                <p className="text-xs text-muted-foreground">Room CCAB8A · Computer Science</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                LIVE
              </span>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Question 3 of 5</span>
                <span className="inline-flex items-center gap-1 font-semibold text-primary">
                  <Radio className="h-3 w-3 animate-pulse" /> 0:21
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-3/5 rounded-full bg-gradient-to-r from-primary to-accent" />
              </div>
            </div>

            {/* Leaderboard mockup — score ranking */}
            <div className="mt-5 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Live Leaderboard</p>
              {LEADERBOARD.map((row, i) => (
                <div
                  key={row.name}
                  className="flex items-center gap-3 rounded-xl border bg-background/60 p-2.5 animate-in"
                  style={{ animationDelay: `${i * 120}ms` }}
                >
                  <span className="w-6 text-center font-headline text-xs font-bold text-muted-foreground">{RANK_LABELS[i]}</span>
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br ${row.gradient} text-xs font-bold text-white shadow-elevation-small`}>
                    {row.initials}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium">{row.name}</span>
                  <span className="font-headline text-sm font-bold tabular-nums text-primary">{row.score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
