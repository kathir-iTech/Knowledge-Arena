import { Reveal } from '@/components/landing/Reveal';
import {
  Activity,
  Award,
  BadgeCheck,
  BarChart3,
  BrainCircuit,
  Calculator,
  ClipboardCheck,
  FileText,
  FileUp,
  History,
  Languages,
  Radar,
  Scale,
  Search,
  Trophy,
  WifiOff,
  Zap,
} from 'lucide-react';

// The 5-step RPL workflow (matches the product's actual pipeline)
const WORKFLOW_STEPS = [
  {
    icon: FileText,
    step: '1 · Declare',
    title: 'AI-matched self-declaration',
    text: 'The worker describes their trade experience in plain language. The system maps it to the closest NCVET NSQF qualification pack.',
  },
  {
    icon: Search,
    step: '2 · Match',
    title: 'Top packs, highlighted units',
    text: 'TF-IDF keyword scoring plus Gemini semantic understanding return the top 3 packs with matched competency units highlighted for the assessor.',
  },
  {
    icon: ClipboardCheck,
    step: '3 · Score',
    title: 'Guided per-criterion rubric',
    text: 'Each NSQF performance criterion is scored 1–4. AI proposes a mark the assessor must accept, modify or reject — every change recorded.',
  },
  {
    icon: Calculator,
    step: '4 · Measure',
    title: 'Live Cohen\u2019s \u03BA',
    text: 'Inter-assessor agreement is recomputed after every assessment. \u03BA below 0.4 raises an automatic admin alert.',
  },
  {
    icon: Award,
    step: '5 · Certify',
    title: 'Profile + human sign-off',
    text: 'An NSQF competency profile is generated. The recommendation is always PENDING ASSESSOR SIGN-OFF — the tool recommends, the assessor decides.',
  },
];

// Landis & Koch scale for the consistency mock
const KAPPA_SCALE = [
  { label: 'Poor', range: '< 0.20' },
  { label: 'Fair', range: '0.21–0.40' },
  { label: 'Moderate', range: '0.41–0.60' },
  { label: 'Substantial', range: '0.61–0.80' },
  { label: 'Almost perfect', range: '0.81–1.00' },
];

const CONSISTENCY_ROWS = [
  { assessor: 'Commander A', kappa: 0.78, interpretation: 'Substantial' },
  { assessor: 'Commander B', kappa: 0.64, interpretation: 'Substantial' },
  { assessor: 'Commander C', kappa: 0.35, interpretation: 'Fair — flagged for calibration' },
];

const PROFILE_UNITS = [
  { unit: 'N1301 · Use hand tools', mastery: 92 },
  { unit: 'N1302 · Connect circuits', mastery: 84 },
  { unit: 'N1303 · Test & measure', mastery: 76 },
  { unit: 'N1304 · Diagnose faults', mastery: 61 },
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
      {/* ── RPL: the product judges came for ─────────────────────────── */}
      <section id="workflow" className="border-y bg-secondary/40">
        <div className="page-container py-16 md:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">How it works</p>
            <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              Five steps, one decision trail.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              From a worker&apos;s plain-language declaration to a signed NSQF
              recommendation — every mark, every override, and every agreement
              score is recorded and auditable.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {WORKFLOW_STEPS.map((s, i) => (
              <Reveal key={s.step} delay={i * 80}>
                <div className="card-hover h-full rounded-2xl border bg-card p-5 shadow-elevation-small">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-primary">{s.step}</p>
                  <h3 className="mt-1 font-headline text-base font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <ShowcaseRow
        id="consistency"
        eyebrow="Real-time consistency"
        title="Disagreement, measured — not assumed"
        text={"Cohen\u2019s \u03BA is recomputed after every assessment across all assessors who scored the same pack. Assessors see their own agreement against the panel, and a \u03BA below 0.4 raises an automatic admin alert \u2014 the system identifies who needs calibration, not just that training is needed."}
      >
        <div className="relative mx-auto w-full max-w-lg">
          <div className="absolute -inset-4 rounded-[28px] bg-gradient-to-br from-primary/20 to-success/10 blur-2xl animate-glow-pulse" aria-hidden="true" />
          <div className="relative rounded-3xl border bg-card p-5 shadow-elevation-large">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 font-headline text-sm font-bold">
                <Scale className="h-4 w-4 text-primary" /> Inter-assessor agreement
              </p>
              <span className="text-[10px] text-muted-foreground">ELE/Q1301 · N = 42 item-pairs</span>
            </div>
            <div className="mt-4 space-y-2">
              {CONSISTENCY_ROWS.map((row, i) => (
                <div key={row.assessor} className="flex items-center gap-2.5 rounded-xl border bg-background/60 p-2.5 animate-in" style={{ animationDelay: `${i * 120}ms` }}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-[10px] font-bold text-white">
                    {row.assessor.split(' ').map(p => p[0]).join('')}
                  </span>
                  <span className="flex-1 truncate text-xs font-medium">{row.assessor}</span>
                  {row.kappa < 0.4 && (
                    <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning">ALERT</span>
                  )}
                  <span className="shrink-0 font-headline text-sm font-bold tabular-nums text-primary">{'\u03BA'} {row.kappa.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t pt-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Landis &amp; Koch scale</p>
              <div className="mt-2 flex items-center gap-1">
                {KAPPA_SCALE.map((band, i) => (
                  <div key={band.label} className={`flex-1 rounded-md px-1.5 py-1 text-center ${i === 3 ? 'bg-success/15 text-success' : 'bg-muted/60 text-muted-foreground'}`}>
                    <p className="text-[9px] font-bold leading-tight">{band.label}</p>
                    <p className="text-[8px] leading-tight opacity-80">{band.range}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                Small samples are flagged as preliminary — {'\u03BA'} is never shown as a lone number without N.
              </p>
            </div>
          </div>
        </div>
      </ShowcaseRow>

      <ShowcaseRow
        id="certify"
        eyebrow="Competency profile"
        title="The tool recommends, the assessor decides"
        text="Every worker gets a unit-by-unit NSQF competency profile with mastery percentages and a knowledge-gap list. The certification recommendation always shows PENDING ASSESSOR SIGN-OFF — and sign-off requires an explicit executive confirmation, recorded with timestamp and UID."
        reverse
      >
        <div className="relative mx-auto w-full max-w-lg">
          <div className="absolute -inset-4 rounded-[28px] bg-gradient-to-br from-accent/20 to-primary/10 blur-2xl animate-glow-pulse" aria-hidden="true" />
          <div className="relative rounded-3xl border bg-card p-5 shadow-elevation-large">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 font-headline text-sm font-bold">
                <Radar className="h-4 w-4 text-accent" /> NSQF competency profile
              </p>
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
                <BadgeCheck className="h-3 w-3" /> PENDING ASSESSOR SIGN-OFF
              </span>
            </div>
            <div className="mt-5 space-y-3">
              {PROFILE_UNITS.map((row, i) => (
                <div key={row.unit} className="animate-in" style={{ animationDelay: `${i * 100}ms` }}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{row.unit}</span>
                    <span className="font-headline font-bold tabular-nums text-primary">{row.mastery}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${row.mastery}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
              Certification is recommended from the profile — never auto-issued. The assessor signs, or the worker is referred for more evidence.
            </p>
          </div>
        </div>
      </ShowcaseRow>

      {/* ── Live quizzes — secondary, still part of the platform ─────── */}
      <section id="quiz" className="border-y bg-secondary/40">
        <div className="page-container pt-16 md:pt-20 pb-2">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">Also on the platform</p>
            <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              Live quizzes for the classroom
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              The same platform runs real-time quiz battles: upload a PDF, the AI
              drafts questions, students join with a room code, and the
              leaderboard updates live.
            </p>
          </Reveal>
        </div>
      </section>

      <ShowcaseRow
        id="ai-forge"
        eyebrow="AI Quiz Creator"
        title="From PDF to quiz in minutes"
        text="Upload a syllabus, textbook chapter, or study guide. The platform generates multiple-choice questions, you review and edit them, and publish with one room code. Every question is verified before students see it."
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
                <p className="text-sm font-semibold">AI Quiz Creator</p>
                <p className="text-xs text-muted-foreground">Sample generated questions</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
                <Zap className="h-3 w-3" /> GENERATING
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
        eyebrow="Real-time Battles"
        title="Everyone plays at the same time"
        text="When the quiz goes live, every student sees the same question on the same timer. Answers submit instantly, and the leaderboard re-sorts in front of the whole class."
        reverse
      >
        <div className="relative mx-auto w-full max-w-lg">
          <div className="absolute -inset-4 rounded-[28px] bg-gradient-to-br from-primary/20 to-success/10 blur-2xl animate-glow-pulse" aria-hidden="true" />
          <div className="relative rounded-3xl border bg-card p-5 shadow-elevation-large">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 font-headline text-sm font-bold">
                <Activity className="h-4 w-4 text-primary" /> Quiz in progress
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> LIVE
              </span>
            </div>
            <p className="mt-4 rounded-xl border bg-background/60 p-3 text-[11px] leading-relaxed text-muted-foreground">
              A preview of the leaderboard — during a real quiz, students&apos;
              names and live scores appear here.
            </p>
            {/* Leaderboard mockup — same neo-roman style */}
            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Leaderboard</p>
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
        eyebrow="Insights"
        title="See how your class is doing"
        text="Track insights over time — how many students played, how participants performed, and which questions tripped people up. See progress from one week to the next."
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
            <p className="mt-5 border-t pt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
              A preview — during a real quiz, these charts show your class&apos;s
              week-to-week engagement.
            </p>
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
    { icon: Languages, title: 'AI-matched self-declaration', text: 'Workers describe experience in plain language; Gemini + TF-IDF maps it to the closest NCVET NSQF pack with matched units highlighted.' },
    { icon: ClipboardCheck, title: 'Per-criterion rubric', text: 'Every performance criterion scored 1–4. AI proposes a mark the assessor must explicitly accept, modify or reject — each change recorded.' },
    { icon: Scale, title: 'Live Cohen\u2019s \u03BA', text: 'Inter-assessor agreement recomputed after every assessment, with Landis & Koch interpretation, sample size, and admin alerts below 0.4.' },
    { icon: Radar, title: 'NSQF competency profile', text: 'Unit-by-unit mastery with knowledge-gap list. Recommendations stay PENDING ASSESSOR SIGN-OFF until an executive confirms.' },
    { icon: WifiOff, title: 'Offline-first', text: 'Declarations queue locally when connectivity drops and sync automatically on reconnect — built for rural and semi-urban assessment centres.' },
    { icon: History, title: 'Auditable by design', text: 'aiSuggestionUsed is stored per item, so AI-assisted and unassisted scores can be compared honestly. Every decision is reconstructable.' },
  ];
  return (
    <section id="features" className="border-y bg-secondary/40">
      <div className="page-container py-16 md:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Features</p>
          <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Built for certification integrity
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
