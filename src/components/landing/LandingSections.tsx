import { Reveal } from '@/components/landing/Reveal';
import { ArrowRight, BrainCircuit, Database, Globe, Radar, ShieldCheck, Swords, Users } from 'lucide-react';
import Link from 'next/link';

const LAYERS = [
  {
    icon: Globe,
    title: 'Next.js portals',
    text: 'Three role-based battle stations (Gladiator, Commander, Executive) with route-level guards and middleware.',
  },
  {
    icon: Database,
    title: 'Firebase Firestore',
    text: 'Single source of truth for arenas, presence heartbeats, and audit logs — updated in real time.',
  },
  {
    icon: BrainCircuit,
    title: 'AI Forge (Genkit)',
    text: 'Document ingestion and question generation flows powered by Gemini, with fallback scoring engines.',
  },
  {
    icon: ShieldCheck,
    title: 'Governance layer',
    text: 'Firestore security rules, rate limiting, audit logging, and role-scoped API routes.',
  },
];

const ROLE_ROWS = [
  { icon: Users, label: 'Gladiators', desc: 'battle + learn' },
  { icon: Swords, label: 'Commanders', desc: 'forge + command' },
  { icon: Radar, label: 'Executives', desc: 'govern + observe' },
];

export function LandingArchitecture() {
  return (
    <section id="architecture" className="page-container py-16 md:py-20">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">Architecture</p>
        <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          Serverless, real-time, audited
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
          A deliberately simple stack that stays live in the browser and fully traceable
          on the server.
        </p>
      </Reveal>

      <Reveal className="mt-10 overflow-x-auto">
        <div className="mx-auto flex min-w-[640px] flex-col items-stretch gap-3 lg:flex-row lg:items-center lg:justify-center">
          <div className="rounded-2xl border bg-card p-4 shadow-elevation-small">
            <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Battle Stations</p>
            <div className="mt-3 space-y-2">
              {ROLE_ROWS.map(row => (
                <div key={row.label} className="flex items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2">
                  <row.icon className="h-4 w-4 text-primary" />
                  <div className="text-left">
                    <p className="text-xs font-semibold">{row.label}</p>
                    <p className="text-[10px] text-muted-foreground">{row.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <ArrowRight className="mx-auto h-5 w-5 shrink-0 text-muted-foreground lg:mx-0 lg:rotate-0" />
          <div className="flex flex-col gap-3 sm:flex-row">
            {LAYERS.map(layer => (
              <div key={layer.title} className="flex-1 rounded-2xl border bg-card p-4 shadow-elevation-small">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <layer.icon className="h-4 w-4" />
                </div>
                <p className="mt-3 text-xs font-semibold">{layer.title}</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{layer.text}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// Team — all gradients mapped to CSS design tokens (no raw palette colors)
const TEAM = [
  { initials: 'AK', name: 'Aria Kade', role: 'Founder & Product Lead', gradient: 'from-primary to-accent' },
  { initials: 'RB', name: 'Ravi Bhatt', role: 'Engineering Lead', gradient: 'from-primary to-warning' },
  { initials: 'MC', name: 'Mira Chen', role: 'AI / ML Engineer', gradient: 'from-accent to-primary' },
  { initials: 'TD', name: 'Tom Delgado', role: 'Design Lead', gradient: 'from-success to-accent' },
  { initials: 'SO', name: 'Sana Omar', role: 'Educator Advisor', gradient: 'from-warning to-accent' },
];

export function LandingTeam() {
  return (
    <section id="team" className="border-y bg-secondary/40">
      <div className="page-container py-16 md:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Team</p>
          <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Built by people who love the arena
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Engineers, educators, and designers shipping a battle-tested learning platform.
          </p>
        </Reveal>
        <div className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {TEAM.map((member, i) => (
            <Reveal key={member.name} delay={i * 80}>
              <div className="card-hover h-full rounded-2xl border bg-card p-5 text-center shadow-elevation-small">
                <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br ${member.gradient} font-headline text-base font-bold text-white shadow-elevation-medium`}>
                  {member.initials}
                </div>
                <p className="mt-3 text-sm font-semibold">{member.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{member.role}</p>
              </div>
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
              The bell rings in 5 minutes. Are your Gladiators ready?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-primary-foreground/85 sm:text-base">
              Launch a live battle, watch the rankings shift, and see learning happen
              in real time. Commanders forge the arena — Gladiators fight for the top.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="#demo"
                className="inline-flex h-12 items-center rounded-[12px] bg-primary-foreground px-6 text-base font-semibold text-primary shadow-elevation-medium transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2"
              >
                Enter the live demo
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
          © 2026 Quorena · Built for HackVerse
        </p>
      </div>
    </footer>
  );
}
