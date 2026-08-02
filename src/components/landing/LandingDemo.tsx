import { DemoQuickLogin } from '@/components/landing/DemoQuickLogin';
import { Reveal } from '@/components/landing/Reveal';
import { KeyRound } from 'lucide-react';
import { DEMO_PASSWORD } from '@/lib/demo-accounts';

export function LandingDemo() {
  return (
    <section id="demo" className="page-container py-16 md:py-20">
      <Reveal className="rounded-3xl border bg-gradient-to-br from-primary/5 via-card to-accent/5 p-6 shadow-elevation-medium sm:p-10">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-semibold text-primary">
            <KeyRound className="h-3.5 w-3.5" />
            DEMO MODE
          </span>
          <h2 className="mt-4 font-headline text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Try the live product in one click
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Explore a fully seeded arena — a live battle is running right now. One click signs
            you in as any role. All demo accounts share the password{' '}
            <code className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold text-foreground">
              {DEMO_PASSWORD}
            </code>
            .
          </p>
        </div>
        <div className="mt-8">
          <DemoQuickLogin />
        </div>
      </Reveal>
    </section>
  );
}
