import { Reveal } from '@/components/landing/Reveal';
import { KappaGauge } from '@/components/rpl/KappaGauge';
import {
  Award,
  BadgeCheck,
  Calculator,
  ClipboardCheck,
  FileText,
  History,
  Languages,
  Radar,
  Scale,
  Search,
  WifiOff,
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
    text: 'An NSQF competency profile is generated. The recommendation is always PENDING ADMIN SIGN-OFF — the tool recommends, the admin decides.',
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
  { assessor: 'Assessor A', kappa: 0.78, interpretation: 'Substantial' },
  { assessor: 'Assessor B', kappa: 0.64, interpretation: 'Substantial' },
  { assessor: 'Assessor C', kappa: 0.35, interpretation: 'Fair — flagged for calibration' },
];

const PROFILE_UNITS = [
  { unit: 'N1301 · Use hand tools', mastery: 92 },
  { unit: 'N1302 · Connect circuits', mastery: 84 },
  { unit: 'N1303 · Test & measure', mastery: 76 },
  { unit: 'N1304 · Diagnose faults', mastery: 61 },
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
            {/* Part 3: real KappaGauge visualisation on the landing */}
            {/* FIX-W3: centre with flex (text-center does nothing on the SVG) */}
            <div className="mt-3 flex justify-center">
              <KappaGauge kappa={0.78} n={42} size={170} />
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
        text="Every worker gets a unit-by-unit NSQF competency profile with mastery percentages and a knowledge-gap list. The certification recommendation always shows PENDING ADMIN SIGN-OFF — and sign-off requires an explicit admin confirmation, recorded with timestamp and UID."
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
                <BadgeCheck className="h-3 w-3" /> PENDING ADMIN SIGN-OFF
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
              Certification is recommended from the profile — never auto-issued. The admin signs, or the worker is referred for more evidence.
            </p>
          </div>
        </div>
      </ShowcaseRow>

      {/* ── The problem RPL solves ──────────────────────────────────── */}
      <section id="problem" className="border-y bg-secondary/40">
        <div className="page-container py-16 md:py-20">
          <Reveal className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">The problem</p>
            <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              Millions of workers have the skills but no certificate to prove it.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Informal-sector workers — electricians, welders, mechanics — learn on the job
              for years but never sit a formal exam. NSQF qualification packs exist, but
              assessing a worker against them still means paper forms, inconsistent scoring,
              and no audit trail. RPL Compass turns that process into a digital, transparent
              workflow.
            </p>
          </Reveal>
        </div>
      </section>

      <ShowcaseRow
        id="ai-transparency"
        eyebrow="AI transparency"
        title="Every AI suggestion is recorded and auditable"
        text="When AI proposes a rubric score, the assessor must explicitly accept, modify or reject it. The aiSuggestionUsed flag is stored per item, so AI-assisted and unassisted scores can be compared honestly — the system never hides which marks came from AI."
      >
        <div className="relative mx-auto w-full max-w-lg">
          <div className="absolute -inset-4 rounded-[28px] bg-gradient-to-br from-warning/15 to-primary/10 blur-2xl animate-glow-pulse" aria-hidden="true" />
          <div className="relative rounded-3xl border bg-card p-5 shadow-elevation-large">
            <div className="flex items-center gap-3 border-b pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10 text-warning">
                <History className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Rubric item with AI suggestion</p>
                <p className="text-xs text-muted-foreground">Every change is recorded</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
                aiSuggestionUsed
              </span>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border bg-background/60 p-3">
                <p className="text-xs font-medium">ELE/Q1301 · Performance criterion 3</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Install a single-phase lighting circuit</p>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'AI proposes', value: '3 — Competent', note: 'Based on worker evidence + rubric text', ai: true },
                  { label: 'Assessor decides', value: 'Modify → 4 — Highly competent', note: 'Worker demonstrated fault-diagnosis beyond the criterion', ai: false },
                  { label: 'Recorded', value: 'aiSuggestionUsed: true · change: 3→4', note: 'Audit trail stores both values', ai: false },
                ].map((r, i) => (
                  <div key={r.label} className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 animate-in" style={{ animationDelay: `${i * 150}ms` }}>
                    <span className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full ${r.ai ? 'bg-warning/40' : 'bg-success/40'}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{r.label}: {r.value}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{r.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ShowcaseRow>
    </>
  );
}

export function LandingFeatures() {
  const features = [
    { icon: Languages, title: 'AI-matched self-declaration', text: 'Workers describe experience in plain language; Gemini + TF-IDF maps it to the closest NCVET NSQF pack with matched units highlighted.' },
    { icon: ClipboardCheck, title: 'Per-criterion rubric', text: 'Every performance criterion scored 1–4. AI proposes a mark the assessor must explicitly accept, modify or reject — each change recorded.' },
    { icon: Scale, title: 'Live Cohen\u2019s \u03BA', text: 'Inter-assessor agreement recomputed after every assessment, with Landis & Koch interpretation, sample size, and admin alerts below 0.4.' },
    { icon: Radar, title: 'NSQF competency profile', text: 'Unit-by-unit mastery with knowledge-gap list. Recommendations stay PENDING ADMIN SIGN-OFF until an admin confirms.' },
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
