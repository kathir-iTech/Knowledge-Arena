import Link from 'next/link';
import { ArrowRight, Radio, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Neo-roman arena ranking preview — top gladiators by score
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
        <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-primary/15 blur-3xl animate-orb" />
        <div className="absolute top-24 -right-24 h-96 w-96 rounded-full bg-accent/15 blur-3xl animate-orb" style={{ animationDelay: '-4s' }} />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-warning/10 blur-3xl animate-glow-pulse" />
      </div>

      <div className="page-container relative grid items-center gap-12 py-20 md:py-28 lg:grid-cols-2 lg:gap-8">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-elevation-small">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Real-time quiz battleground for the modern arena
          </div>

          {/* Hero headline — Playfair Display, deliberate letter-spacing, carved weight */}
          <h1 className="mt-6 font-headline text-5xl font-bold leading-[1.05] tracking-[-0.02em] text-balance sm:text-6xl lg:text-7xl">
            Learn. Battle.{' '}
            <span className="gradient-text">Own the arena.</span>
          </h1>

          <p className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg">
            Quorena turns classrooms into live quiz arenas — with AI-forged
            questions, real-time battles, anti-cheat presence tracking, and executive-grade
            intelligence. Built for Gladiators, Commanders, and Executives.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {/* Primary CTA — crimson, highest-stakes click on the page */}
            <Button
              asChild
              size="lg"
              className="h-12 px-7 text-base font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Link href="/login">
                Enter the Arena
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 px-7 text-base focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Link href="#demo">
                <Zap className="mr-2 h-4 w-4 text-warning" />
                Try the live demo
              </Link>
            </Button>
          </div>

          <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t pt-8">
            {[
              { value: '3', label: 'Battle stations' },
              { value: 'Live', label: 'Arena presence' },
              { value: 'AI', label: 'Question forge' },
            ].map(stat => (
              <div key={stat.label}>
                <dt className="font-headline text-2xl font-bold text-foreground">{stat.value}</dt>
                <dd className="mt-1 text-xs text-muted-foreground">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Arena preview card — leaderboard mockup */}
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="absolute -inset-6 rounded-[32px] bg-gradient-to-br from-primary/20 via-accent/10 to-transparent blur-2xl animate-glow-pulse" aria-hidden="true" />
          <div className="relative rounded-3xl border bg-card/90 p-5 shadow-elevation-large backdrop-blur animate-float">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-headline text-lg font-bold tracking-tight">Midnight Clash</p>
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

            {/* Arena rankings — roman numerals, trophy-weight */}
            <div className="mt-5 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Arena Rankings</p>
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
