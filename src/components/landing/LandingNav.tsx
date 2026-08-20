import Link from 'next/link';
import { BrainCircuit, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';

const NAV_LINKS = [
  { href: '#product', label: 'Product' },
  { href: '#demo', label: 'Demo' },
  { href: '#ai-forge', label: 'AI Forge' },
  { href: '#live-battle', label: 'Live Battles' },
  { href: '#analytics', label: 'Analytics' },
  { href: '#architecture', label: 'Architecture' },
  { href: '#team', label: 'Team' },
];

export function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
      <div className="page-container flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm"
          aria-label="Quorena home"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-elevation-medium">
            <BrainCircuit className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-headline text-lg font-bold tracking-tight">Quorena</span>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex" aria-label="Primary">
          {NAV_LINKS.map(link => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <Button
          asChild
          size="sm"
          className="shrink-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Link href="/login">
            <LogIn className="mr-1.5 h-4 w-4" />
            Enter the Arena
          </Link>
        </Button>
      </div>
    </header>
  );
}
