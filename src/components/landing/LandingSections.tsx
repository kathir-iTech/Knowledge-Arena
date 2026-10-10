import { Reveal } from '@/components/landing/Reveal';
import { Compass, ClipboardCheck, Shield } from 'lucide-react';
import Link from 'next/link';

const ROLES = [
  {
    icon: Compass,
    role: 'Candidate',
    href: '/rpl/declare',
    what: 'Describe your work experience in plain language, upload evidence (photos, certificates), and track your NSQF certification status in real time.',
    pages: '/rpl/declare · /rpl/status',
  },
  {
    icon: ClipboardCheck,
    role: 'Assessor',
    href: '/rpl/assessor',
    what: 'Match a worker to an NSQF pack, score each performance criterion on a 1–4 rubric, and see your inter-assessor agreement (κ) against the panel.',
    pages: '/rpl/assessor · /rpl/assess · /rpl/consistency',
  },
  {
    icon: Shield,
    role: 'Admin',
    href: '/rpl/admin',
    what: 'Monitor κ across all packs, receive alerts when agreement drops below 0.4, view the leaderboard, and oversee certification sign-offs.',
    pages: '/rpl/admin',
  },
];

export function LandingRoles() {
  return (
    <section id="roles" className="border-t bg-card/50">
      <div className="page-container py-16 md:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Who it is for</p>
          <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Three roles, one auditable workflow
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Every action is attributed to a role and recorded. No anonymous scores, no untraceable decisions.
          </p>
        </Reveal>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map((r, i) => (
            <Reveal key={r.role} delay={i * 100}>
              <Link
                href={r.href}
                className="card-hover group block h-full rounded-2xl border bg-card p-6 shadow-elevation-small focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <r.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-headline text-base font-semibold">{r.role}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.what}</p>
                <p className="mt-3 text-[11px] font-mono text-muted-foreground/70">{r.pages}</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

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
              Ready to run your first assessment?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-primary-foreground/85 sm:text-base">
              Open the RPL workspace to declare a worker, match an NSQF pack,
              and score per-criterion — or sign in to your role dashboard.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/rpl"
                className="inline-flex h-12 items-center rounded-[12px] bg-primary-foreground px-6 text-base font-semibold text-primary shadow-elevation-medium transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2"
              >
                <Compass className="mr-2 h-4 w-4" />
                Open RPL workspace
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 items-center rounded-[12px] border border-primary-foreground/40 px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2"
              >
                Sign in
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
            <Compass className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <p className="font-headline text-sm font-bold">RPL Compass</p>
            <p className="text-[11px] text-muted-foreground">AI that standardises how assessors judge, not who passes.</p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          © 2026 RPL Compass
        </p>
      </div>
    </footer>
  );
}
