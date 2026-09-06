'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { participantService } from '@/services/participant.service';
import { quizService } from '@/services/quiz.service';
import { Swords, ExternalLink, ArrowLeft, AlertTriangle, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'warning'> = {
  finished: 'default',
  live: 'success',
  waiting: 'warning',
};

type HistoryEntry = { quizId: string; title: string; score: number; status: string; created_at: number };
type EnrichedEntry = HistoryEntry & {
  rank: number | null;
  total: number | null;
  percentile: number | null;
  accuracy: number | null;
};

// Phase 5: rolling percentile — 100 when alone, else linear rank scaling.
// Percentile = (1 - (Rank-1)/(N-1)) * 100. Winner => 100, last => 0.
function percentileForRank(rank: number, total: number): number {
  if (total <= 1) return 100;
  return (1 - (rank - 1) / (total - 1)) * 100;
}

function Sparkline({ values, width = 120, height = 32, label }: { values: number[]; width?: number; height?: number; label: string }) {
  const points = useMemo(() => {
    if (values.length === 0) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return values
      .map((v, i) => {
        const x = values.length === 1 ? width / 2 : (i / (values.length - 1)) * (width - 4) + 2;
        const y = height - 3 - ((v - min) / span) * (height - 6);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [values, width, height]);
  if (values.length === 0) return null;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="overflow-visible">
      <polyline points={points} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stroke-primary" />
      {values.map((v, i) => {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const span = max - min || 1;
        const x = values.length === 1 ? width / 2 : (i / (values.length - 1)) * (width - 4) + 2;
        const y = height - 3 - ((v - min) / span) * (height - 6);
        return <circle key={i} cx={x} cy={y} r="2" className="fill-primary" />;
      })}
    </svg>
  );
}

export default function GladiatorHistoryPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  // Enrichment is read-only: participants per finished battle + quizMap for
  // created_by (commander excluded from rank, mirrors QuizResults/analytics).
  // No writes. Base history still comes from getStudentHistory which uses
  // collectionGroup documentId()==userId (dashboard uses where user_id==
  // with a divergent index — preserved, do not unify).
  const [enriched, setEnriched] = useState<Map<string, { rank: number | null; total: number | null; percentile: number | null; accuracy: number | null }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(() => {
    if (!user) return;
    const uid = user.id;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const base = await participantService.getStudentHistory(uid);
      if (cancelled) return;
      setHistory(base);
      // Enrich finished battles only (status===finished gate preserved).
      const finished = base.filter(h => h.status === 'finished');
      type Enrichment = { rank: number | null; total: number | null; percentile: number | null; accuracy: number | null };
      const entries: Array<[string, Enrichment]> = await Promise.all(
        finished.map(async (h): Promise<[string, Enrichment]> => {
          try {
            const [parts, quiz] = await Promise.all([
              participantService.getAllParticipants(h.quizId),
              quizService.getQuizById(h.quizId).catch(() => null),
            ]);
            const creatorId = quiz?.created_by ?? null;
            // Rank among non-commander gladiators; other blocked gladiators
            // are excluded but self is always kept so a blocked self still ranks.
            const eligible = parts.filter(
              p => p.user_id !== creatorId && (p.status !== 'blocked' || p.user_id === uid)
            );
            const pool = eligible.length > 0 ? eligible : parts.filter(p => p.user_id !== creatorId);
            const sorted = [...pool].sort((a, b) => (b.score || 0) - (a.score || 0));
            const idx = sorted.findIndex(p => p.user_id === uid);
            if (idx < 0 || sorted.length === 0) {
              return [h.quizId, { rank: null, total: null, percentile: null, accuracy: null }];
            }
            const rank = idx + 1;
            const total = sorted.length;
            const percentile = Math.round(percentileForRank(rank, total) * 10) / 10;
            const maxScore = Math.max(...sorted.map(p => p.score || 0));
            const accuracy = maxScore > 0 ? Math.round((h.score / maxScore) * 100) : 0;
            return [h.quizId, { rank, total, percentile, accuracy }];
          } catch {
            return [h.quizId, { rank: null, total: null, percentile: null, accuracy: null }];
          }
        })
      );
      if (cancelled) return;
      setEnriched(new Map(entries));
    })()
      .catch(() => { if (!cancelled) { setError('Failed to load battle history. Please try again.'); setHistory([]); setEnriched(new Map()); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => { const cleanup = fetchHistory(); return () => { if (typeof cleanup === 'function') cleanup(); }; }, [fetchHistory]);

  const rows: EnrichedEntry[] = useMemo(
    () => history.map(h => ({ ...h, ...(enriched.get(h.quizId) ?? { rank: null, total: null, percentile: null, accuracy: null }) })),
    [history, enriched]
  );

  // Finished-only trajectory, chronological (oldest -> newest).
  const finishedAsc = useMemo(
    () => rows.filter(h => h.status === 'finished').sort((a, b) => (a.created_at || 0) - (b.created_at || 0)),
    [rows]
  );
  const percentileSeries = useMemo(
    () => finishedAsc.map(h => h.percentile).filter((v): v is number => typeof v === 'number'),
    [finishedAsc]
  );
  const accuracySeries = useMemo(
    () => finishedAsc.map(h => h.accuracy).filter((v): v is number => typeof v === 'number'),
    [finishedAsc]
  );
  const avgPercentile = percentileSeries.length > 0
    ? Math.round((percentileSeries.reduce((a, b) => a + b, 0) / percentileSeries.length) * 10) / 10
    : null;
  const best = useMemo(() => {
    const ranked = finishedAsc.filter(h => h.rank !== null && h.total !== null);
    if (ranked.length === 0) return null;
    return ranked.reduce((a, b) => (b.percentile ?? -1) > (a.percentile ?? -1) ? b : a);
  }, [finishedAsc]);
  // Improvement vector: last minus first over finished battles (score pts +
  // percentile points). Positive => climbing, negative => slipping.
  const improvement = useMemo(() => {
    if (finishedAsc.length < 2) return null;
    const first = finishedAsc[0];
    const last = finishedAsc[finishedAsc.length - 1];
    return {
      scoreDelta: last.score - first.score,
      percentileDelta:
        typeof last.percentile === 'number' && typeof first.percentile === 'number'
          ? Math.round((last.percentile - first.percentile) * 10) / 10
          : null,
    };
  }, [finishedAsc]);

  if (loading) {
    return (
      <div className="page-container safe-bottom safe-top animate-in space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-[18px]" />
      </div>
    );
  }

  return (
    <div className="page-container safe-bottom safe-top animate-in">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.push('/gladiator/dashboard')} aria-label="Back to dashboard">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-page-title font-headline tracking-tight">Battle History</h1>
        <span className="text-sm text-muted-foreground ml-auto">{history.length} battle{history.length !== 1 ? 's' : ''}</span>
      </div>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="py-14 text-center">
            <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-4" />
            <p className="text-base font-medium mb-1">Failed to load battle history</p>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" onClick={fetchHistory}>
              <RefreshCw className="w-4 h-4 mr-2" /> Retry
            </Button>
          </CardContent>
        </Card>
      ) : history.length === 0 ? (
        <EmptyState icon={Swords} title="No Battles Fought Yet" description="Join a battle from your dashboard to start your journey." action={<Button asChild><Link href="/gladiator/dashboard">Join a Battle</Link></Button>} />
      ) : (
        <>
          {finishedAsc.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Avg percentile</p>
                  <p className="text-2xl font-bold font-mono tabular-nums">{avgPercentile !== null ? `${avgPercentile}%` : '—'}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Across {percentileSeries.length} finished battle{percentileSeries.length !== 1 ? 's' : ''}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Best rank</p>
                  <p className="text-2xl font-bold font-mono tabular-nums">{best ? `#${best.rank}/${best.total}` : '—'}</p>
                  <p className="text-[11px] text-muted-foreground mt-1 truncate">{best ? best.title : 'Finish a battle to rank'}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Improvement</p>
                  {improvement ? (
                    <p className="text-2xl font-bold font-mono tabular-nums flex items-center gap-1.5">
                      {improvement.scoreDelta > 0 ? <TrendingUp className="w-5 h-5 text-success" /> : improvement.scoreDelta < 0 ? <TrendingDown className="w-5 h-5 text-destructive" /> : <Minus className="w-5 h-5 text-muted-foreground" />}
                      {improvement.scoreDelta >= 0 ? '+' : ''}{improvement.scoreDelta} pts
                    </p>
                  ) : (
                    <p className="text-2xl font-bold font-mono tabular-nums">—</p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {improvement?.percentileDelta !== null && improvement?.percentileDelta !== undefined
                      ? `${improvement.percentileDelta >= 0 ? '+' : ''}${improvement.percentileDelta} percentile pts (first → last finished)`
                      : 'Need 2+ finished battles'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 space-y-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Percentile trajectory</p>
                    <Sparkline values={percentileSeries} label="Rolling percentile sparkline over finished battles" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Accuracy trajectory</p>
                    <Sparkline values={accuracySeries} label="Accuracy trajectory over finished battles" />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          <div className="-mx-4 md:mx-0 overflow-x-auto rounded-none md:rounded-[18px] border-x-0 md:border border-border/50 mobile-hide-overflow">
            <table className="w-full text-sm min-w-[360px] md:min-w-0">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted/30 border-b border-border/50">
                  <th scope="col" className="text-left p-3 font-medium text-muted-foreground text-xs">#</th>
                  <th scope="col" className="text-left p-3 font-medium text-muted-foreground text-xs">Title</th>
                  <th scope="col" className="text-left p-3 font-medium text-muted-foreground text-xs hidden sm:table-cell">Status</th>
                  <th scope="col" className="text-left p-3 font-medium text-muted-foreground text-xs hidden sm:table-cell">Date</th>
                  <th scope="col" className="text-left p-3 font-medium text-muted-foreground text-xs hidden sm:table-cell">Rank</th>
                  <th scope="col" className="text-right p-3 font-medium text-muted-foreground text-xs hidden sm:table-cell">Percentile</th>
                  <th scope="col" className="text-right p-3 font-medium text-muted-foreground text-xs">Score</th>
                  <th scope="col" className="text-center p-3 font-medium text-muted-foreground text-xs">Review</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h, idx) => (
                  <tr key={h.quizId} className={cn("border-b border-border/30 transition-colors hover:bg-muted/20", idx % 2 === 0 ? "bg-card" : "bg-muted/[0.03]")}>
                    <td className="p-3">
                      <span className="flex items-center justify-center w-8 h-8 rounded-[10px] bg-primary/10 text-primary font-mono text-xs font-bold">{idx + 1}</span>
                    </td>
                    <td className="p-3 font-medium text-sm min-w-0 max-w-[120px] md:max-w-none truncate">{h.title}</td>
                    <td className="p-3 hidden sm:table-cell">
                      <Badge variant={STATUS_VARIANT[h.status] || 'secondary'} className="h-6">
                        {h.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground whitespace-nowrap hidden sm:table-cell">{new Date(h.created_at).toLocaleDateString()}</td>
                    <td className="p-3 text-sm font-mono tabular-nums whitespace-nowrap hidden sm:table-cell">
                      {h.status === 'finished' && h.rank !== null && h.total !== null ? `#${h.rank}/${h.total}` : <span className="text-muted-foreground">&mdash;</span>}
                    </td>
                    <td className="p-3 text-right text-sm font-mono tabular-nums whitespace-nowrap hidden sm:table-cell">
                      {h.status === 'finished' && h.percentile !== null ? `${h.percentile}%` : <span className="text-muted-foreground">&mdash;</span>}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <span className="font-semibold text-base text-primary">{h.score}</span>
                      <span className="text-xs text-muted-foreground ml-0.5">pts</span>
                      {h.status === 'finished' && h.accuracy !== null && (
                        <span className="block text-[11px] text-muted-foreground font-mono tabular-nums">{h.accuracy}% of winner</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {h.status === 'finished' ? (
                        <Button variant="ghost" size="icon" asChild aria-label={`View results for ${h.title}`}>
                          <Link href={`/battle/${h.quizId}`}><ExternalLink className="w-4 h-4" /></Link>
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">&mdash;</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
