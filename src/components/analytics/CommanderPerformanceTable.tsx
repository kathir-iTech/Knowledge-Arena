'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { useFirebase } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUp, ArrowDown, ArrowUpDown, RefreshCw, Crown, Swords } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommanderRow {
  commanderId: string;
  commanderLabel: string;
  battlesCount: number;
  totalParticipants: number;
  totalFinished: number;
  totalScore: number;
  avgGladiatorScore: number;
  completionRate: number;
}

type SortKey = 'commanderLabel' | 'battlesCount' | 'totalParticipants' | 'avgGladiatorScore' | 'completionRate';
type SortDir = 'asc' | 'desc';

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3.5 h-3.5 opacity-40" aria-hidden="true" />;
  return dir === 'asc' ? <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />;
}

export function CommanderPerformanceTable() {
  const { firestore } = useFirebase();
  const [rows, setRows] = useState<CommanderRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('battlesCount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [refreshNonce, setRefreshNonce] = useState(0);

  const fetchLive = useCallback(async () => {
    if (!firestore) return;
    setLoading(true);
    setError(null);
    try {
      // Live query — no cache, direct Firestore getDocs
      const quizzesSnap = await getDocs(collection(firestore, 'quizzes'));
      const quizzes = quizzesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as { id: string; created_by?: string; title?: string }));

      if (quizzes.length === 0) {
        setRows([]);
        setFetchedAt(Date.now());
        return;
      }

      // Fetch participants for each battle live via getDocs (per spec)
      const participantsSnaps = await Promise.all(
        quizzes.map((q) => getDocs(collection(firestore, 'quizzes', q.id, 'participants')))
      );

      const map = new Map<string, CommanderRow>();

      // Optional: try to enrich commander names from users collection (best-effort, no cache)
      let userNameMap = new Map<string, string>();
      try {
        const usersSnap = await getDocs(collection(firestore, 'users'));
        for (const u of usersSnap.docs) {
          const data = u.data() as Record<string, unknown>;
          const name = (data.displayName as string) || (data.name as string) || '';
          if (name) userNameMap.set(u.id, name);
        }
      } catch {
        // ignore — fallback to id display
      }

      for (let i = 0; i < quizzes.length; i++) {
        const q = quizzes[i];
        const creator = (q.created_by as string) || 'unknown';
        const parts = participantsSnaps[i].docs.map((d) => ({ user_id: d.id, ...d.data() } as { user_id: string; status?: string; score?: number }));
        // Exclude commander self if present as participant
        const gladiators = parts.filter((p) => p.user_id !== creator);
        const total = gladiators.length;
        const finished = gladiators.filter((p) => p.status === 'finished').length;
        const totalScore = gladiators.reduce((s, p) => s + (typeof p.score === 'number' ? p.score : 0), 0);

        const existing = map.get(creator);
        if (existing) {
          existing.battlesCount += 1;
          existing.totalParticipants += total;
          existing.totalFinished += finished;
          existing.totalScore += totalScore;
        } else {
          const label = userNameMap.get(creator) || creator;
          map.set(creator, {
            commanderId: creator,
            commanderLabel: label,
            battlesCount: 1,
            totalParticipants: total,
            totalFinished: finished,
            totalScore,
          } as CommanderRow);
        }
      }

      const computed: CommanderRow[] = Array.from(map.values()).map((r) => ({
        ...r,
        avgGladiatorScore: r.totalParticipants > 0 ? Math.round((r.totalScore / r.totalParticipants) * 100) / 100 : 0,
        completionRate: r.totalParticipants > 0 ? Math.round((r.totalFinished / r.totalParticipants) * 10000) / 100 : 0,
      }));

      setRows(computed);
      setFetchedAt(Date.now());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load commander performance');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [firestore, refreshNonce]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      await fetchLive();
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [fetchLive]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'commanderLabel' ? 'asc' : 'desc');
    }
  };

  const sorted = useMemo(() => {
    if (!rows) return [];
    const copy = [...rows];
    copy.sort((a, b) => {
      let av: string | number = a[sortKey];
      let bv: string | number = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        const cmp = av.localeCompare(bv);
        return sortDir === 'asc' ? cmp : -cmp;
      }
      const numA = av as number;
      const numB = bv as number;
      if (numA < numB) return sortDir === 'asc' ? -1 : 1;
      if (numA > numB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  if (loading && !rows) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="w-4 h-4" aria-hidden="true" /> Commander Performance
          </CardTitle>
          <CardDescription className="text-xs">Live-queried via Firestore getDocs — no cache</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="w-4 h-4" aria-hidden="true" /> Commander Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="py-10 text-center space-y-3">
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
          <Button variant="outline" size="sm" onClick={() => setRefreshNonce((n) => n + 1)}>
            <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Crown className="w-4 h-4" aria-hidden="true" />
              Commander Performance
              <Badge variant="outline" className="ml-1 bg-success/10 text-success border-0 text-[10px] font-medium">
                Live
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              Per-Commander breakdown — battles, gladiators, avg score, completion. Live-queried via <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">getDocs</code> on mount (no 5 min cache).
              {fetchedAt && <span className="ml-1">Fetched: {new Date(fetchedAt).toLocaleTimeString()}</span>}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRefreshNonce((n) => n + 1)} aria-label="Refresh commander performance" disabled={loading}>
            <RefreshCw className={cn('w-4 h-4 mr-1.5', loading && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!rows || rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No commander data yet.</div>
        ) : (
          <div className="overflow-x-auto rounded-[12px] border border-border/50">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="bg-muted/30 border-b border-border/50">
                  <th scope="col" className="text-left py-3 px-4 font-medium text-muted-foreground text-xs">
                    <button onClick={() => handleSort('commanderLabel')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors" aria-label="Sort by commander">
                      Commander <SortIcon active={sortKey === 'commanderLabel'} dir={sortDir} />
                    </button>
                  </th>
                  <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">
                    <button onClick={() => handleSort('battlesCount')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors" aria-label="Sort by battles">
                      <span className="inline-flex items-center gap-1">
                        <Swords className="w-3 h-3" aria-hidden="true" /> Battles
                      </span>
                      <SortIcon active={sortKey === 'battlesCount'} dir={sortDir} />
                    </button>
                  </th>
                  <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">
                    <button onClick={() => handleSort('totalParticipants')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors" aria-label="Sort by gladiators">
                      Gladiators <SortIcon active={sortKey === 'totalParticipants'} dir={sortDir} />
                    </button>
                  </th>
                  <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">
                    <button onClick={() => handleSort('avgGladiatorScore')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors" aria-label="Sort by average score">
                      Avg Score <SortIcon active={sortKey === 'avgGladiatorScore'} dir={sortDir} />
                    </button>
                  </th>
                  <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">
                    <button onClick={() => handleSort('completionRate')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors" aria-label="Sort by completion rate">
                      Completion <SortIcon active={sortKey === 'completionRate'} dir={sortDir} />
                    </button>
                  </th>
                  <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">
                    Finished
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.commanderId} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <span className="font-medium text-sm truncate max-w-[180px]" title={r.commanderLabel}>
                          {r.commanderLabel.length > 24 ? `${r.commanderLabel.slice(0, 24)}…` : r.commanderLabel}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[180px]">{r.commanderId.slice(0, 12)}…</span>
                      </div>
                    </td>
                    <td className="text-center py-3 px-4 font-medium">{r.battlesCount}</td>
                    <td className="text-center py-3 px-4">{r.totalParticipants}</td>
                    <td className="text-center py-3 px-4">
                      <Badge variant="outline" className={cn('font-mono border-0', r.avgGladiatorScore >= 700 ? 'bg-success/10 text-success' : r.avgGladiatorScore >= 400 ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground')}>
                        {r.avgGladiatorScore}
                      </Badge>
                    </td>
                    <td className="text-center py-3 px-4">
                      <Badge variant="outline" className={cn('border-0', r.completionRate >= 80 ? 'bg-success/10 text-success' : r.completionRate >= 50 ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive')}>
                        {r.completionRate.toFixed(1)}%
                      </Badge>
                    </td>
                    <td className="text-center py-3 px-4 text-xs">
                      <span className="font-medium">{r.totalFinished}</span>
                      <span className="text-muted-foreground"> / {r.totalParticipants}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[10px] text-muted-foreground">
          Read-only live view — queries <code className="font-mono bg-muted px-1 py-0.5 rounded">quizzes</code> and <code className="font-mono bg-muted px-1 py-0.5 rounded">quizzes/&#123;id&#125;/participants</code> via getDocs on mount and on refresh.
        </p>
      </CardContent>
    </Card>
  );
}
