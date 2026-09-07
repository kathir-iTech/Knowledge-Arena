import { Reveal } from '@/components/landing/Reveal';
import { BrainCircuit } from 'lucide-react';
import Link from 'next/link';

export function LandingCTA() {
  return (
    <section className="page-container py-16 md:py-20">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-accent p-8 text-center shadow-elevation-large sm:p-12">
          <div
            className="pointer-events-none absolute inset-0 animate-gradient opacity-40"
            aria-hidden="true"
            style={{ background: 'linear-gradient(120deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))', backgroundSize: '200% 200%' }}
          />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl font-headline text-3xl font-bold tracking-tight text-primary-foreground text-balance sm:text-4xl">
              The bell rings in 5 minutes. Are your Gladiators ready?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-primary-foreground/85 sm:text-base">
              Teachers create the quiz. Students join with a room code. Everyone
              sees the leaderboard move in real time.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="#product"
                className="inline-flex h-12 items-center rounded-[12px] bg-primary-foreground px-6 text-base font-semibold text-primary shadow-elevation-medium transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2"
              >
                See how it works
              </a>
              <Link
                href="/login"
                className="inline-flex h-12 items-center rounded-[12px] border border-primary-foreground/40 px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2"
              >
                Sign in to the arena
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t bg-card">
      <div className="page-container flex flex-col items-center justify-between gap-4 py-8 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
            <BrainCircuit className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <p className="font-headline text-sm font-bold">Quorena</p>
            <p className="text-[11px] text-muted-foreground">Learn. Battle. Own the arena.</p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          © 2026 Quorena
        </p>
      </div>
    </footer>
  );
}
