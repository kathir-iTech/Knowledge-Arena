import { Reveal } from '@/components/landing/Reveal';
import {
  Activity,
  BarChart3,
  BrainCircuit,
  FileUp,
  Flame,
  Layers,
  LineChart,
  MessageSquare,
  MonitorPlay,
  Radar,
  ShieldAlert,
  Swords,
  Timer,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';

// Product overview — arena / battle language throughout
const OVERVIEW_PILLARS = [
  {
    icon: Swords,
    title: 'Gladiators — Battle & Learn',
    text: 'Enter live arenas with a room code, answer on a timer, and watch your rank move in real time as you fight for the top.',
  },
  {
    icon: Flame,
    title: 'Commanders — Forge & Command',
    text: 'Forge AI-powered questions from PDFs, launch synchronized battles, control the arena clock, and own the room.',
  },
  {
    icon: Radar,
    title: 'Executives — Govern & Observe',
    text: 'Monitor every active arena from a live command center with winner predictions, answer heatmaps, and activity streams.',
  },
];

const AI_FORGE_QUESTIONS = [
  { text: 'Which data structure uses FIFO ordering?', category: 'Computer Science', difficulty: 'easy' },
  { text: 'Explain the CAP theorem in distributed systems.', category: 'Computer Science', difficulty: 'hard' },
  { text: 'What is the time complexity of binary search?', category: 'Computer Science', difficulty: 'medium' },
];

const ANALYTICS_BARS = [
  { label: 'Mon', value: 42 },
  { label: 'Tue', value: 68 },
  { label: 'Wed', value: 55 },
  { label: 'Thu', value: 81 },
  { label: 'Fri', value: 94 },
  { label: 'Sat', value: 60 },
  { label: 'Sun', value: 47 },
];

function ShowcaseRow({
  id,
  eyebrow,
  title,
  text,
  children,
  reverse,
}: {
  id: string;
  eyebrow: string;
  title: string;
  text: string;
  children: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <section id={id} className="page-container py-14 md:py-16 overflow-hidden">
      <Reveal className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
        <div className="max-w-xl">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">{eyebrow}</p>
          <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight text-balance">{title}</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">{text}</p>
        </div>
        {children}
      </Reveal>
    </section>
  );
}

export function LandingShowcases() {
  return (
    <>
      <section id="product" className="border-y bg-secondary/40">
        <div className="page-container py-16 md:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">The Arena</p>
            <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              One arena. Three battle stations.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Quorena unifies the classroom experience across dedicated stations —
              each tuned to its role, all sharing one real-time arena.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {OVERVIEW_PILLARS.map((pillar, i) => (
              <Reveal key={pillar.title} delay={i * 100}>
                <div className="card-hover h-full rounded-2xl border bg-card p-6 shadow-elevation-small">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <pillar.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-headline text-lg font-semibold">{pillar.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pillar.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <ShowcaseRow
        id="ai-forge"
        eyebrow="AI Forge"
        title="From lecture PDF to battle arena in minutes"
        text="Commanders drop in a syllabus, textbook chapter, or study guide — the AI Forge extracts questions, filters them in a review panel, and publishes an arena with a room code. Every question is human-verified before it ever reaches a Gladiator."
      >
        <div className="relative mx-auto w-full max-w-lg">
          {/* Glow uses warning/primary tokens — no amber */}
          <div className="absolute -inset-4 rounded-[28px] bg-gradient-to-br from-warning/15 to-primary/10 blur-2xl animate-glow-pulse" aria-hidden="true" />
          <div className="relative rounded-3xl border bg-card p-5 shadow-elevation-large">
            <div className="flex items-center gap-3 border-b pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10 text-warning">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">AI Quiz Forge</p>
                <p className="text-xs text-muted-foreground">genkit · gemini</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
                <Zap className="h-3 w-3" /> FORGING
              </span>
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 rounded-xl border bg-background/60 p-3">
                <FileUp className="h-4 w-4 shrink-0 text-primary" />
                <p className="truncate text-xs font-medium">Computer-Science-101.pdf</p>
                <span className="ml-auto text-[10px] text-muted-foreground">1.2 MB</span>
              </div>
              <div className="space-y-2">
                {AI_FORGE_QUESTIONS.map((q, i) => (
                  <div key={q.text} className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 animate-in" style={{ animationDelay: `${i * 150}ms` }}>
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{q.text}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {q.category} · {q.difficulty}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ShowcaseRow>

      <ShowcaseRow
        id="live-battle"
        eyebrow="Live Battle Command Center"
        title="Watch every arena breathe — live"
        text="Executives see the entire arena in real time: who is online, the exact question being answered, remaining timers, rankings that re-sort live, probabilistic winner shortlists, and a per-question answer heatmap. Zero page refreshes."
        reverse
      >
        <div className="relative mx-auto w-full max-w-lg">
          <div className="absolute -inset-4 rounded-[28px] bg-gradient-to-br from-primary/20 to-success/10 blur-2xl animate-glow-pulse" aria-hidden="true" />
          <div className="relative rounded-3xl border bg-card p-5 shadow-elevation-large">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 font-headline text-sm font-bold">
                <Activity className="h-4 w-4 text-primary" /> Battle Command Center
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> LIVE
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-background/60 p-3">
                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <MonitorPlay className="h-3 w-3" /> Live arenas
                </p>
                <p className="mt-1 font-headline text-2xl font-bold">12</p>
              </div>
              <div className="rounded-xl border bg-background/60 p-3">
                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <Users className="h-3 w-3" /> Active gladiators
                </p>
                <p className="mt-1 font-headline text-2xl font-bold">84</p>
              </div>
            </div>
            {/* Arena rankings in the command center — same neo-roman style */}
            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Top Gladiators</p>
              <div className="space-y-2">
                {LEADERBOARD_HINT.map((row, i) => (
                  <div key={row.name} className="flex items-center gap-2.5 rounded-xl border bg-background/60 p-2 animate-in" style={{ animationDelay: `${i * 120}ms` }}>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-[10px] font-bold text-white">
                      {row.initials}
                    </span>
                    <span className="flex-1 truncate text-xs font-medium">{row.name}</span>
                    <span className="font-headline text-sm font-bold tabular-nums text-primary">{row.score}</span>
                    {i === 0 && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-warning/15 text-warning">
                        <Trophy className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ShowcaseRow>

      <ShowcaseRow
        id="analytics"
        eyebrow="Analytics"
        title="Executive intelligence, not just dashboards"
        text="30-day engagement trends, arena usage, AI adoption, messaging activity, and per-Commander performance — computed on demand from live arena data, no ETL pipeline required."
      >
        <div className="relative mx-auto w-full max-w-lg">
          <div className="absolute -inset-4 rounded-[28px] bg-gradient-to-br from-accent/20 to-primary/10 blur-2xl animate-glow-pulse" aria-hidden="true" />
          <div className="relative rounded-3xl border bg-card p-5 shadow-elevation-large">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 font-headline text-sm font-bold">
                <BarChart3 className="h-4 w-4 text-accent" /> Engagement Overview
              </p>
              <span className="text-[10px] text-muted-foreground">Last 7 days</span>
            </div>
            <div className="mt-5 flex h-36 items-end gap-2.5 sm:gap-3">
              {ANALYTICS_BARS.map((bar, i) => (
                <div key={bar.label} className="group flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-[10px] font-semibold tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                    {bar.value}
                  </span>
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-primary/70 to-accent transition-all duration-500 animate-in"
                    style={{ height: `${bar.value}%`, animationDelay: `${i * 80}ms` }}
                  />
                  <span className="text-[10px] text-muted-foreground">{bar.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 border-t pt-4">
              {[
                { icon: LineChart, label: 'Trend', value: '+24%' },
                { icon: Timer, label: 'Avg. session', value: '18m' },
                { icon: MessageSquare, label: 'Messages', value: '1.2k' },
              ].map(stat => (
                <div key={stat.label} className="text-center">
                  <stat.icon className="mx-auto h-4 w-4 text-muted-foreground" />
                  <p className="mt-1 font-headline text-lg font-bold">{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ShowcaseRow>
    </>
  );
}

const LEADERBOARD_HINT = [
  { initials: 'R', name: 'Ruby', score: 1240 },
  { initials: 'A', name: 'Atlas', score: 980 },
  { initials: 'L', name: 'Lola', score: 360 },
];

function Sparkles({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.9 5.7a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z" />
      <path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" />
    </svg>
  );
}

export function LandingFeatures() {
  const features = [
    { icon: Zap, title: 'Real-time arenas', text: 'Firestore-synced battles with presence tracking, live timers, and instant ranking movement.' },
    { icon: BrainCircuit, title: 'AI question forge', text: 'Generate reviewable questions from any document via Genkit and Gemini — with full audit trails.' },
    { icon: ShieldAlert, title: 'Anti-cheat presence', text: 'Gladiator heartbeat tracking, skip/timeout detection, and reconnect suspicion flags.' },
    { icon: Radar, title: 'Command center', text: 'Live arena telemetry for Executives: predictions, answer heatmaps, and activity streams.' },
    { icon: BarChart3, title: 'Deep analytics', text: '30-day engagement, arena usage, AI adoption, and messaging activity in one command view.' },
    { icon: Layers, title: 'Role-first UX', text: 'Dedicated Gladiator, Commander, and Executive stations with tailored battle workflows.' },
  ];
  return (
    <section id="features" className="border-y bg-secondary/40">
      <div className="page-container py-16 md:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Features</p>
          <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Everything a battle-ready arena needs
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 100}>
              <div className="card-hover h-full rounded-2xl border bg-card p-6 shadow-elevation-small">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-headline text-base font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
