"use client";

import { useAuth } from '@/hooks/useAuth';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Suspense, useRef, useEffect, useState, useCallback, type ReactNode } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import {
  BrainCircuit, Sparkles, Swords, BarChart3, Shield, Users,
  MessageSquare, Upload, Zap, Trophy, ArrowRight, ChevronDown,
  Check, FileText, Eye, UserPlus, BookOpen, LogIn,
  Github, Twitter, Linkedin, Mail, Menu, X
} from 'lucide-react';
import { LoadingScreen } from '@/components/LoadingScreen';

const LoginForm = dynamic(() => import('@/components/auth/LoginForm').then(m => m.LoginForm), { ssr: false });

// ============================================================
// Data
// ============================================================

const FEATURES = [
  { icon: Sparkles, title: 'AI-Powered Quizzes', description: 'Generate intelligent questions from any PDF using our AI PDF Forge. Save hours of manual work.' },
  { icon: Swords, title: 'Real-time Battles', description: 'Compete live with opponents. Questions appear simultaneously, scores update in real-time.' },
  { icon: BarChart3, title: 'Smart Analytics', description: 'Track performance with detailed insights. Identify strengths and areas for improvement.' },
  { icon: Shield, title: 'Secure Platform', description: 'Enterprise-grade encryption and authentication. Your content stays private and protected.' },
  { icon: Users, title: 'Role-based Access', description: 'Three tiers: Commander, Executive, and Gladiator. Tailored experiences for every role.' },
  { icon: MessageSquare, title: 'Instant Feedback', description: 'Get immediate results and explanations. Learn from every answer with detailed breakdowns.' },
] as const;

const AI_STEPS = [
  { icon: Upload, title: 'Upload PDF', description: 'Drop any educational PDF into the forge.' },
  { icon: Zap, title: 'AI Analysis', description: 'Our AI reads and understands the content.' },
  { icon: Sparkles, title: 'Smart Generation', description: 'Questions are crafted from key concepts.' },
  { icon: Check, title: 'Arena Ready', description: 'Publish to the arena and start battling.' },
] as const;

const ARENA_STEPS = [
  { icon: FileText, title: 'Create', description: 'Design your quiz or generate with AI.' },
  { icon: Upload, title: 'Publish', description: 'Set rules, timing, and unleash it.' },
  { icon: LogIn, title: 'Join', description: 'Participants enter with a unique code.' },
  { icon: Swords, title: 'Compete', description: 'Answer questions against the clock.' },
  { icon: Trophy, title: 'Win', description: 'Top scorers claim glory and bragging rights.' },
] as const;

const WORKFLOW_STEPS = [
  { icon: UserPlus, title: 'Sign Up', description: 'Create your account and choose your role.' },
  { icon: Eye, title: 'Explore', description: 'Browse the arena and discover upcoming battles.' },
  { icon: FileText, title: 'Create', description: 'Upload PDFs or craft quizzes with AI assistance.' },
  { icon: Swords, title: 'Battle', description: 'Join live sessions and compete in real-time.' },
  { icon: BarChart3, title: 'Analyze', description: 'Review detailed analytics and performance insights.' },
  { icon: Zap, title: 'Improve', description: 'Use insights to level up and create better content.' },
] as const;

const FAQ_ITEMS = [
  { question: 'What is Knowledge Arena?', answer: 'Knowledge Arena is a real-time quiz platform where educators create AI-powered quizzes and students compete in live battles. It transforms traditional assessment into an engaging, competitive experience.' },
  { question: 'How does AI PDF Forge work?', answer: 'Simply upload your PDF study materials, and our AI analyzes the content to automatically generate quiz questions. It identifies key concepts, terms, and relationships to create meaningful assessments in seconds.' },
  { question: 'Is my data secure?', answer: 'Absolutely. We use enterprise-grade encryption (AES-256) for all data at rest and TLS 1.3 for data in transit. Authentication is handled through secure OAuth providers. Your content belongs to you.' },
  { question: 'Can I create custom quizzes?', answer: 'Yes! Commanders and Executives can create custom quizzes from scratch, set time limits, configure scoring rules, and publish them to the arena. You have full control over the content and rules.' },
  { question: 'How do real-time battles work?', answer: 'Participants join a quiz room using a unique room code. Questions appear on all screens simultaneously. Each answer is scored instantly, and a live leaderboard updates as the battle progresses.' },
  { question: 'What roles are available?', answer: 'We support three roles: Commander (full administrative access), Executive (content creation and management), and Gladiator (battle participation). Each role has a tailored experience.' },
] as const;

const FOOTER_LINKS = {
  Product: ['Features', 'Pricing', 'API', 'Changelog'],
  Resources: ['Documentation', 'Guides', 'Support', 'Status'],
  Company: ['About', 'Blog', 'Careers', 'Contact'],
  Legal: ['Privacy', 'Terms', 'Security', 'Cookies'],
} as const;

// ============================================================
// Hooks
// ============================================================

function useReveal(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null!);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isVisible };
}

// ============================================================
// Components
// ============================================================

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const { ref, isVisible } = useReveal();
  return (
    <div
      ref={ref}
      className={cn('reveal', isVisible && 'reveal-visible', className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function SectionHeading({ label, title, description }: { label?: string; title: string; description?: string }) {
  return (
    <div className="text-center space-y-3 mb-12 md:mb-16">
      {label && (
        <Reveal>
          <Badge variant="default" className="px-4 py-1.5 text-xs font-semibold tracking-wider uppercase">
            {label}
          </Badge>
        </Reveal>
      )}
      <Reveal delay={100}>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-headline font-bold tracking-tight">
          {title}
        </h2>
      </Reveal>
      {description && (
        <Reveal delay={200}>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{description}</p>
        </Reveal>
      )}
    </div>
  );
}

function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
      <div className="page-container flex items-center justify-between h-16">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <BrainCircuit className="w-4 h-4 text-primary" />
          </div>
          <span className="font-headline font-bold text-lg">Knowledge Arena</span>
        </div>

        <div className="hidden md:flex items-center gap-6">
          <button onClick={() => scrollTo('features')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</button>
          <button onClick={() => scrollTo('ai-section')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">AI Forge</button>
          <button onClick={() => scrollTo('arena')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Arena</button>
          <button onClick={() => scrollTo('faq')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">FAQ</button>
          <Button size="sm" onClick={() => scrollTo('cta')}>Get Started</Button>
        </div>

        <button className="md:hidden p-2" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl">
          <div className="page-container py-4 flex flex-col gap-3">
            <button onClick={() => scrollTo('features')} className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2 text-left">Features</button>
            <button onClick={() => scrollTo('ai-section')} className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2 text-left">AI Forge</button>
            <button onClick={() => scrollTo('arena')} className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2 text-left">Arena</button>
            <button onClick={() => scrollTo('faq')} className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2 text-left">FAQ</button>
            <Button size="sm" className="w-full" onClick={() => scrollTo('cta')}>Get Started</Button>
          </div>
        </div>
      )}
    </nav>
  );
}

function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] via-background to-background" />
      <div className="absolute top-1/4 -left-32 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] animate-orb" />
      <div className="absolute bottom-1/4 -right-32 w-[400px] h-[400px] bg-accent/10 rounded-full blur-[100px] animate-orb" style={{ animationDelay: '-6s' }} />

      <div className="relative z-10 text-center space-y-8 max-w-4xl mx-auto px-4 py-20">
        <Reveal>
          <div className="relative inline-flex mb-2">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl animate-glow-pulse" />
            <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-[22px] bg-primary/10 flex items-center justify-center border border-primary/20">
              <BrainCircuit className="w-10 h-10 md:w-12 md:h-12 text-primary" />
            </div>
          </div>
        </Reveal>

        <Reveal delay={150}>
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-headline font-bold tracking-tight leading-[0.95]">
            <span className="gradient-text">Knowledge Arena</span>
          </h1>
        </Reveal>

        <Reveal delay={250}>
          <p className="text-lg sm:text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            The ultimate AI-powered quiz battleground.{' '}
            <span className="text-foreground font-medium">Create, compete, and conquer.</span>
          </p>
        </Reveal>

        <Reveal delay={350}>
          <div className="flex flex-wrap gap-4 justify-center pt-4">
            <Button size="lg" className="gap-2 h-13 px-8 text-base" onClick={() => document.getElementById('cta')?.scrollIntoView({ behavior: 'smooth' })}>
              Get Started <ArrowRight className="w-4 h-4" />
            </Button>
            <Button size="lg" variant="outline" className="h-13 px-8 text-base" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>
              Learn More
            </Button>
          </div>
        </Reveal>

        <Reveal delay={450}>
          <div className="flex items-center justify-center gap-6 sm:gap-10 pt-8 text-muted-foreground">
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-foreground">10K+</div>
              <div className="text-xs sm:text-sm">Battles Fought</div>
            </div>
            <div className="w-px h-10 bg-border" />
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-foreground">5K+</div>
              <div className="text-xs sm:text-sm">Active Players</div>
            </div>
            <div className="w-px h-10 bg-border" />
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-foreground">50K+</div>
              <div className="text-xs sm:text-sm">Quiz Questions</div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="relative py-20 md:py-28">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.02] to-transparent" />
      <div className="page-container relative">
        <SectionHeading
          label="Features"
          title="Everything you need to dominate"
          description="AI-powered tools, real-time competition, and deep analytics — all in one platform."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={i * 80}>
              <div className="group rounded-[18px] bg-card border border-border/50 p-6 md:p-8 card-hover">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/15 transition-colors">
                  <feature.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-card-title mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function AISection() {
  return (
    <section id="ai-section" className="relative py-20 md:py-28">
      <div className="absolute inset-0 bg-secondary/50" />
      <div className="page-container relative">
        <SectionHeading
          label="AI PDF Forge"
          title="Turn PDFs into quizzes instantly"
          description="Upload any educational material and let our AI craft the perfect quiz in seconds."
        />
        <div className="relative">
          <div className="hidden md:block absolute top-1/2 left-[10%] right-[10%] h-0.5 bg-gradient-to-r from-primary/30 via-primary/60 to-accent/60 -translate-y-1/2" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {AI_STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 120}>
                <div className="relative flex flex-col items-center text-center">
                  <div className="relative z-10 w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center mb-4">
                    <step.icon className="w-7 h-7 text-primary" />
                    <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </div>
                  </div>
                  <h3 className="font-headline font-semibold text-base mb-1.5">{step.title}</h3>
                  <p className="text-sm text-muted-foreground max-w-[200px]">{step.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ArenaSection() {
  return (
    <section id="arena" className="relative py-20 md:py-28">
      <div className="page-container">
        <SectionHeading
          label="How It Works"
          title="From creation to victory"
          description="The battleground is simple. Create a quiz, publish it, and let the competition begin."
        />
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-4 lg:gap-6">
          {ARENA_STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 100} className="flex-1 w-full">
              <div className="relative flex md:flex-col items-center gap-4 md:gap-3 p-4 md:p-6 rounded-[18px] bg-card border border-border/50 card-hover">
                <div className="hidden md:flex absolute -top-3 -left-3 w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold items-center justify-center shadow-elevation-medium">
                  {i + 1}
                </div>
                <div className="shrink-0 w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                  <step.icon className="w-5 h-5 text-primary" />
                </div>
                <div className="md:text-center flex-1 min-w-0">
                  <h3 className="font-semibold text-sm md:text-base">{step.title}</h3>
                  <p className="text-xs md:text-sm text-muted-foreground mt-0.5">{step.description}</p>
                </div>
                {i < ARENA_STEPS.length - 1 && (
                  <ArrowRight className="hidden md:block absolute -right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/40" />
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  return (
    <section id="workflow" className="relative py-20 md:py-28">
      <div className="absolute inset-0 bg-secondary/50" />
      <div className="page-container relative">
        <SectionHeading
          label="User Journey"
          title="Your path to mastery"
          description="From first login to arena champion — we guide you every step of the way."
        />
        <div className="max-w-3xl mx-auto">
          {WORKFLOW_STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 100}>
              <div className="relative flex gap-6 pb-10 last:pb-0">
                {i < WORKFLOW_STEPS.length - 1 && (
                  <div className="absolute left-5 top-12 bottom-0 w-0.5 bg-gradient-to-b from-primary/40 to-accent/40" />
                )}
                <div className="relative z-10 shrink-0 w-10 h-10 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                  <step.icon className="w-4 h-4 text-primary" />
                  <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {i + 1}
                  </div>
                </div>
                <div className="flex-1 pt-1.5">
                  <h3 className="font-headline font-semibold text-lg">{step.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{step.description}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQSection() {
  return (
    <section id="faq" className="relative py-20 md:py-28">
      <div className="page-container max-w-3xl">
        <SectionHeading
          label="FAQ"
          title="Questions? We've got answers"
          description="Everything you need to know about Knowledge Arena."
        />
        <Reveal>
          <Accordion.Root type="single" collapsible className="space-y-3">
            {FAQ_ITEMS.map((item) => (
              <Accordion.Item
                key={item.question}
                value={item.question}
                className="rounded-[18px] bg-card border border-border/50 overflow-hidden"
              >
                <Accordion.Header>
                  <Accordion.Trigger className="accordion-trigger flex items-center justify-between w-full p-5 md:p-6 text-left text-sm md:text-base font-medium hover:bg-secondary/50 transition-colors">
                    {item.question}
                    <ChevronDown className="accordion-chevron w-4 h-4 text-muted-foreground shrink-0 ml-4 transition-transform duration-200" />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Content className="data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up overflow-hidden">
                  <div className="px-5 md:px-6 pb-5 md:pb-6 text-sm text-muted-foreground leading-relaxed">
                    {item.answer}
                  </div>
                </Accordion.Content>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        </Reveal>
      </div>
    </section>
  );
}

function CTASection() {
  const { user, isLoading } = useAuth();

  return (
    <section id="cta" className="relative py-20 md:py-28 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-accent/5 to-primary/10 animate-gradient" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[100px]" />
      <div className="page-container relative">
        <div className="max-w-md mx-auto text-center space-y-8">
          <Reveal>
            <div className="w-16 h-16 rounded-[18px] bg-primary/10 flex items-center justify-center mx-auto border border-primary/20">
              <BrainCircuit className="w-8 h-8 text-primary" />
            </div>
          </Reveal>
          <Reveal delay={100}>
            <h2 className="text-3xl md:text-4xl font-headline font-bold tracking-tight">
              Ready to Enter the <span className="gradient-text">Arena</span>?
            </h2>
          </Reveal>
          <Reveal delay={200}>
            <p className="text-muted-foreground">
              Join thousands of players and educators. Create, compete, and conquer.
            </p>
          </Reveal>
          <Reveal delay={300}>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-11 w-full rounded-[12px]" />
                <Skeleton className="h-11 w-full rounded-[12px]" />
                <Skeleton className="h-11 w-28 mx-auto rounded-[12px]" />
              </div>
            ) : user ? (
              <div className="space-y-4">
                <div className="p-4 rounded-[18px] bg-success/10 border border-success/20">
                  <p className="text-sm font-medium text-success">You&apos;re signed in!</p>
                  <p className="text-xs text-muted-foreground mt-1">Welcome back to the arena.</p>
                </div>
                <Button size="lg" className="w-full gap-2" onClick={() => window.location.href = '/dashboard'}>
                  Go to Dashboard <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Suspense fallback={
                <div className="space-y-4">
                  <Skeleton className="h-11 w-full rounded-[12px]" />
                  <Skeleton className="h-11 w-full rounded-[12px]" />
                  <Skeleton className="h-11 w-28 mx-auto rounded-[12px]" />
                </div>
              }>
                <LoginForm />
              </Suspense>
            )}
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function FooterSection() {
  return (
    <footer className="relative border-t border-border/50 bg-foreground/[0.02]">
      <div className="page-container py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {Object.entries(FOOTER_LINKS).map(([category, links]) => (
            <div key={category}>
              <h4 className="font-headline font-semibold text-sm mb-4 text-foreground">{category}</h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-border/50">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
              <BrainCircuit className="w-3 h-3 text-primary" />
            </div>
            <span className="text-sm font-medium">Knowledge Arena</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="GitHub">
              <Github className="w-4 h-4" />
            </a>
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Twitter">
              <Twitter className="w-4 h-4" />
            </a>
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="LinkedIn">
              <Linkedin className="w-4 h-4" />
            </a>
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Email">
              <Mail className="w-4 h-4" />
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Knowledge Arena. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

// ============================================================
// Page Content
// ============================================================

function PageContent() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen message="Preparing the arena..." />;
  }

  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <FeaturesSection />
        <AISection />
        <ArenaSection />
        <WorkflowSection />
        <FAQSection />
        <CTASection />
      </main>
      <FooterSection />
    </>
  );
}

// ============================================================
// Page Export
// ============================================================

export default function Home() {
  return (
    <Suspense>
      <PageContent />
    </Suspense>
  );
}