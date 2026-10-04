'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusTracker, type TrackerStep } from '@/components/rpl/StatusTracker';
import type { RPLStage, StatusResponse } from '@/lib/rpl/types';
import { Check, Copy } from 'lucide-react';

const STAGE_ORDER: RPLStage[] = [
  'declared',
  'assessment_scheduled',
  'assessed',
  'profile_ready',
  'certified',
];

const STAGE_LABELS: Record<RPLStage, string> = {
  declared: 'Declared',
  assessment_scheduled: 'Assessment scheduled',
  assessed: 'Assessed',
  profile_ready: 'Profile ready',
  certified: 'Certified',
};

function stepsForStage(stage: RPLStage): TrackerStep[] {
  if (stage === 'certified') {
    return STAGE_ORDER.map((s) => ({ label: STAGE_LABELS[s], state: 'done' as const }));
  }
  const currentIdx = STAGE_ORDER.indexOf(stage);
  return STAGE_ORDER.map((s, i) => ({
    label: STAGE_LABELS[s],
    state: (i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'pending') as TrackerStep['state'],
  }));
}

export default function RplStatusPage() {
  // Authoritative page-level guard (global (rpl) layout guard exists but this
  // stays authoritative). Worker-own record via own uid; the API enforces
  // worker-sees-own vs commander/executive.
  const { user, isLoading } = useAuth();
  const { auth } = useFirebase();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    const rawUid = user?.id;
    if (!rawUid || !rawUid.trim()) {
      setLoading(false);
      return;
    }
    const workerId: string = rawUid.trim();
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = await auth.currentUser?.getIdToken().catch(() => null);
        if (!token) {
          if (!cancelled) {
            setError('You are not signed in. Please sign in again.');
            setLoading(false);
          }
          return;
        }
        const res = await fetch(`/api/rpl/status/${encodeURIComponent(workerId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = (await res.json().catch(() => null)) as (StatusResponse & {
          error?: string;
        }) | null;
        if (cancelled) return;
        if (!res.ok || !body || Array.isArray(body) || typeof body.stage !== 'string') {
          setError(
            typeof body?.error === 'string'
              ? body.error
              : res.status === 404
                ? 'No declaration found yet. Start your assessment to get your status.'
                : 'Failed to load your RPL status.',
          );
        } else {
          setStatus(body);
        }
      } catch {
        if (!cancelled) setError('Failed to load your RPL status. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user, isLoading, auth]);

  async function copyRef(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (isLoading || loading) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
            <CardDescription>Please sign in to view your RPL status.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/login">Go to login</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (error || !status) {
    const isEmpty = error?.includes('No declaration found') === true;
    return (
      <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>{isEmpty ? 'No declaration yet' : 'Could not load status'}</CardTitle>
            <CardDescription>{error ?? 'Failed to load your RPL status.'}</CardDescription>
          </CardHeader>
          {isEmpty && (
            <CardContent>
              <Button asChild>
                <Link href="/rpl/declare">Start your assessment</Link>
              </Button>
            </CardContent>
          )}
        </Card>
      </main>
    );
  }

  const showProfileLink =
    status.profileReady === true ||
    status.certified === true ||
    status.stage === 'assessed' ||
    status.stage === 'profile_ready' ||
    status.stage === 'certified';
  const profileUid = status.workerId || user.id;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">My RPL Status</h1>
        <p className="text-sm text-muted-foreground">Track your journey from declaration to certificate.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
          <CardDescription>Current stage: {STAGE_LABELS[status.stage]}</CardDescription>
        </CardHeader>
        <CardContent>
          <StatusTracker steps={stepsForStage(status.stage)} />
        </CardContent>
      </Card>

      <section className="space-y-4" aria-label="Matched qualification packs">
        <h2 className="text-lg font-semibold text-foreground">Matched qualification packs</h2>
        {status.matchedPacks.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                No packs matched yet — an assessor will map your declaration manually.
              </p>
            </CardContent>
          </Card>
        ) : (
          status.matchedPacks.map((pack) => (
            <Card key={pack.packId}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {pack.title}
                  <Badge variant="default">NSQF Level {pack.nsqfLevel}</Badge>
                </CardTitle>
                <CardDescription>{pack.packId}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2" aria-label="Matched units">
                  {pack.matchedUnits.map((unit) => (
                    <Badge key={unit} variant="secondary">
                      {unit}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {(status.assessorAssigned || typeof status.assessmentScheduledAt === 'number') && (
        <Card>
          <CardHeader>
            <CardTitle>Assessment schedule</CardTitle>
            <CardDescription>Show up on time with your reference code.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {status.assessorAssigned && (
              <p>
                <span className="font-semibold">Assessor:</span> {status.assessorAssigned}
              </p>
            )}
            {typeof status.assessmentScheduledAt === 'number' && (
              <p>
                <span className="font-semibold">Scheduled:</span>{' '}
                {new Date(status.assessmentScheduledAt).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Reference code</CardTitle>
          <CardDescription>Quote this at your physical assessment.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-[10px] border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground">
              {status.referenceCode}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copyRef(status.referenceCode)}
              aria-label="Copy reference code"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {showProfileLink && (
        <Button asChild className="w-full">
          <Link href={`/rpl/profile/${encodeURIComponent(profileUid)}`}>View my competency profile</Link>
        </Button>
      )}
    </main>
  );
}
