'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const STEPS = ['Declare', 'Assess', 'Profile', 'Certificate'] as const;

function ProcessDiagram() {
  // Hand-rolled SVG: 4 boxes + arrows. Uses Tailwind CSS-var tokens via fill-/stroke-.
  const boxW = 140;
  const boxH = 56;
  const gap = 32;
  const y = 24;
  const totalW = STEPS.length * boxW + (STEPS.length - 1) * gap;
  return (
    <svg
      viewBox={`0 0 ${totalW} ${boxH + 48}`}
      className="h-auto w-full"
      role="img"
      aria-label="RPL process: Declare, then Assess, then Profile, then Certificate"
    >
      <defs>
        <marker
          id="rpl-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
        </marker>
      </defs>
      {STEPS.map((label, i) => {
        const x = i * (boxW + gap);
        return (
          <g key={label}>
            <rect
              x={x}
              y={y}
              width={boxW}
              height={boxH}
              rx={12}
              className="fill-card stroke-border"
              strokeWidth={1.5}
            />
            <text
              x={x + boxW / 2}
              y={y + 24}
              textAnchor="middle"
              className="fill-foreground"
              fontSize={13}
              fontWeight={700}
            >
              {`${i + 1}. ${label}`}
            </text>
            <text
              x={x + boxW / 2}
              y={y + 42}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize={11}
            >
              {i === 0
                ? 'Tell us your skills'
                : i === 1
                  ? 'Expert reviews you'
                  : i === 2
                    ? 'Skills mapped'
                    : 'Get certified'}
            </text>
            {i < STEPS.length - 1 && (
              <line
                x1={x + boxW + 4}
                y1={y + boxH / 2}
                x2={x + boxW + gap - 4}
                y2={y + boxH / 2}
                className="stroke-muted-foreground"
                strokeWidth={2}
                markerEnd="url(#rpl-arrow)"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function RplLandingPage() {
  // Authoritative page-level guard (global (rpl) layout guard exists but this
  // stays authoritative). Unauthenticated users see the landing + login CTA and
  // are never redirect-looped; signed-in workers with a declaration go to status.
  const { user, isLoading } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    const rawUid = user?.id;
    if (!rawUid || !rawUid.trim()) return;
    const workerId: string = rawUid.trim();
    let cancelled = false;
    async function check() {
      setChecking(true);
      try {
        const token = await auth.currentUser?.getIdToken().catch(() => null);
        if (!token || cancelled) return;
        const res = await fetch(`/api/rpl/status/${encodeURIComponent(workerId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled && res.status === 200) {
          router.replace('/rpl/status');
        }
      } catch {
        // Stay on landing on failure.
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [user, isLoading, auth, router]);

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-40 w-full" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <CardTitle>What is RPL?</CardTitle>
          <CardDescription>
            Recognition of Prior Learning (RPL) gives you formal credit for skills you learned on
            the job, not in a classroom. Describe your experience, get assessed by an expert, and
            earn a certificate employers trust.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProcessDiagram />
          {checking ? (
            <Skeleton className="h-11 w-full" />
          ) : !user ? (
            <Button asChild className="w-full">
              <Link href="/login">Sign in to start your assessment</Link>
            </Button>
          ) : (
            <Button asChild className="w-full">
              <Link href="/rpl/declare">Start your assessment</Link>
            </Button>
          )}
          {!user && (
            <p className="text-center text-xs text-muted-foreground">
              New here? Sign in first — it takes a minute, then you can declare your skills.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
