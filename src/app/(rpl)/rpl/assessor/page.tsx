'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { NSQF_PACKS } from '@/lib/rpl/nsqf-packs';
import type { RPLAssessmentDoc } from '@/lib/rpl/types';

type AssessmentRow = Partial<RPLAssessmentDoc> & { id: string };

interface MyPair {
  assessorA: string;
  assessorB: string;
  kappa: number;
}

interface MyPack {
  packId: string;
  packKappa: number | null;
  myPairs: MyPair[];
}

interface CriterionDelta {
  criterionId: string;
  criterionText: string;
  mine: number;
  panelAvg: number;
  delta: number;
}

interface MyConsistencyResponse {
  packs: MyPack[];
  perCriterionDeltas: CriterionDelta[];
}

function packTitle(packId: string | undefined): string {
  if (!packId) return '—';
  return NSQF_PACKS.find((p) => p.id === packId)?.title ?? packId;
}

function formatDate(ts: number | undefined): string {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return '—';
  return new Date(ts).toLocaleDateString();
}

function kappaVariant(kappa: number | null): 'destructive' | 'warning' | 'success' | 'outline' {
  if (kappa === null) return 'outline';
  if (kappa < 0.4) return 'destructive';
  if (kappa < 0.6) return 'warning';
  return 'success';
}

export default function RplAssessorPage() {
  // Authoritative page-level guard (commander-or-executive; the global (rpl)
  // layout guard also covers /rpl/assessor but this guard stays authoritative).
  const { user, isLoading } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter();

  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [packs, setPacks] = useState<MyPack[]>([]);
  const [deltas, setDeltas] = useState<CriterionDelta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/');
      return;
    }
    if (user.role !== 'commander' && user.role !== 'executive') {
      router.replace('/');
    }
  }, [user, isLoading, router]);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      if (!token) {
        setError('Not authenticated. Please sign in again.');
        return;
      }
      const [assessRes, consistencyRes] = await Promise.all([
        fetch('/api/rpl/assess', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/rpl/assess/my-consistency', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const assessBody = (await assessRes.json().catch(() => null)) as {
        assessments?: AssessmentRow[];
        error?: string;
      } | null;
      if (!assessRes.ok || !assessBody || !Array.isArray(assessBody.assessments)) {
        setError(
          typeof assessBody?.error === 'string' ? assessBody.error : 'Failed to load queue.',
        );
        return;
      }
      setAssessments(assessBody.assessments);

      const consistencyBody = (await consistencyRes.json().catch(() => null)) as
        | MyConsistencyResponse
        | { error?: string }
        | null;
      if (
        consistencyRes.ok &&
        consistencyBody &&
        Array.isArray((consistencyBody as MyConsistencyResponse).packs)
      ) {
        const typed = consistencyBody as MyConsistencyResponse;
        setPacks(Array.isArray(typed.packs) ? typed.packs : []);
        setDeltas(Array.isArray(typed.perCriterionDeltas) ? typed.perCriterionDeltas : []);
      } else {
        // Consistency is advisory — queue still renders without it.
        setPacks([]);
        setDeltas([]);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    if (!user || (user.role !== 'commander' && user.role !== 'executive')) return;
    void fetchAll();
  }, [user, fetchAll]);

  const queue = useMemo(() => {
    // Workers awaiting assessment: drafts, oldest first (FIFO by created date).
    return assessments
      .filter((a) => a.status === 'draft')
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  }, [assessments]);

  const history = useMemo(() => {
    return assessments
      .filter((a) => a.status === 'submitted')
      .sort(
        (a, b) =>
          (b.submittedAt ?? b.createdAt ?? 0) - (a.submittedAt ?? a.createdAt ?? 0),
      );
  }, [assessments]);

  if (isLoading || loading) {
    return (
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </main>
    );
  }

  if (!user || (user.role !== 'commander' && user.role !== 'executive')) {
    return null;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Assessor Home</h1>
        <p className="text-sm text-muted-foreground">
          Your queue, your agreement with the panel, and where you drift from it.
        </p>
      </div>

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>Could not load assessor data</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <button
              type="button"
              onClick={fetchAll}
              className="rounded-[12px] border border-border/60 px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/30"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      ) : null}

      {/* Queue: workers awaiting assessment */}
      <Card>
        <CardHeader>
          <CardTitle>
            Awaiting assessment{' '}
            <span className="text-sm font-normal text-muted-foreground">({queue.length})</span>
          </CardTitle>
          <CardDescription>Oldest first — workers waiting the longest are on top.</CardDescription>
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">Queue is clear. Nothing awaiting scoring.</p>
          ) : (
            <div className="space-y-3">
              {queue.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-col gap-3 rounded-[12px] border border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-base font-medium">
                      {a.workerName || 'Unknown worker'}
                      {a.referenceCode ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {a.referenceCode}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {packTitle(typeof a.packId === 'string' ? a.packId : undefined)}
                      {typeof a.packId === 'string' && a.packId ? (
                        <span className="ml-2 font-mono text-xs">({a.packId})</span>
                      ) : null}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      Created {formatDate(a.createdAt)}
                    </p>
                  </div>
                  <Link
                    href={`/rpl/assess/${encodeURIComponent(a.id)}`}
                    className="shrink-0 rounded-[10px] border border-border/60 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-accent/30"
                  >
                    Open scoring
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* My consistency vs panel */}
      <Card>
        <CardHeader>
          <CardTitle>My consistency vs panel</CardTitle>
          <CardDescription>
            Pack agreement and your pair kappas wherever you overlap with another assessor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {packs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No overlap yet — submit assessments on shared workers to build agreement data.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {packs.map((p) => {
                const pairAvg =
                  p.myPairs.length > 0
                    ? p.myPairs.reduce((s, x) => s + x.kappa, 0) / p.myPairs.length
                    : null;
                return (
                  <div key={p.packId} className="rounded-[12px] border border-border/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{packTitle(p.packId)}</p>
                      <Badge variant={kappaVariant(p.packKappa)}>
                        {p.packKappa === null ? 'no data' : `κ ${p.packKappa.toFixed(3)}`}
                      </Badge>
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{p.packId}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {p.myPairs.length === 0
                        ? 'No overlapping pairs yet.'
                        : `${p.myPairs.length} overlapping pair${p.myPairs.length === 1 ? '' : 's'}${
                            pairAvg !== null ? ` · avg κ ${pairAvg.toFixed(3)}` : ''
                          }`}
                    </p>
                    {p.myPairs.length > 0 ? (
                      <div className="mt-2 space-y-1.5">
                        {p.myPairs.map((pair) => (
                          <div
                            key={`${pair.assessorA}::${pair.assessorB}`}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="truncate font-mono text-muted-foreground">
                              {pair.assessorA} ↔ {pair.assessorB}
                            </span>
                            <span className="font-semibold tabular-nums">
                              {pair.kappa.toFixed(3)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>
            History{' '}
            <span className="text-sm font-normal text-muted-foreground">({history.length})</span>
          </CardTitle>
          <CardDescription>Your submitted assessments, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No submitted assessments yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-col gap-1 rounded-[12px] border border-border/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {a.workerName || 'Unknown worker'}
                      {a.referenceCode ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {a.referenceCode}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {packTitle(typeof a.packId === 'string' ? a.packId : undefined)} · Submitted{' '}
                      {formatDate(a.submittedAt ?? a.createdAt)}
                    </p>
                  </div>
                  <Link
                    href={`/rpl/assess/${encodeURIComponent(a.id)}`}
                    className="shrink-0 text-sm text-primary hover:underline"
                  >
                    View
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* My calibration: per-criterion self-awareness */}
      <Card>
        <CardHeader>
          <CardTitle>My calibration</CardTitle>
          <CardDescription>
            Your mean score vs the panel mean on the same criteria. Positive means you score
            higher than the panel; negative means lower.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deltas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No shared criteria yet — calibration appears once you and the panel score the same
              items.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[560px]">
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 px-3 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <span>Criterion</span>
                  <span className="text-right">Mine</span>
                  <span className="text-right">Panel avg</span>
                  <span className="text-right">Delta</span>
                </div>
                <div className="border-t border-border/30" />
                {deltas.map((d) => {
                  const strong = Math.abs(d.delta) > 0.5;
                  const tone =
                    d.delta > 0.1
                      ? 'text-success'
                      : d.delta < -0.1
                        ? 'text-destructive'
                        : 'text-muted-foreground';
                  return (
                    <div
                      key={d.criterionId}
                      className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center gap-3 border-b border-border/20 px-3 py-2.5 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" title={d.criterionId}>
                          {d.criterionId}
                        </p>
                        <p className="truncate text-xs text-muted-foreground" title={d.criterionText}>
                          {d.criterionText}
                        </p>
                      </div>
                      <span className="text-right text-sm tabular-nums">{d.mine.toFixed(2)}</span>
                      <span className="text-right text-sm tabular-nums">{d.panelAvg.toFixed(2)}</span>
                      <span className={`text-right text-sm font-semibold tabular-nums ${tone}`}>
                        {d.delta > 0 ? '+' : ''}
                        {d.delta.toFixed(2)}
                        {strong ? ' ●' : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
