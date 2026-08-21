'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { useFirebase } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUp, ArrowDown, ArrowUpDown, RefreshCw, Brain, Search, AlertTriangle, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DifficultyRow {
  questionId: string;
  quizId: string;
  quizTitle: string;
  text: string;
  submittedCount: number;
  correctCount: number;
  wrongCount: number;
  wrongRate: number;
  correctRate: number;
}

type SortKey = 'wrongRate' | 'submittedCount' | 'correctCount' | 'text' | 'quizTitle' | 'correctRate';
type SortDir = 'asc' | 'desc';

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3.5 h-3.5 opacity-40" aria-hidden="true" />;
  return dir === 'asc' ? <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />;
}

export function DifficultyCalibrationTable() {
  const { firestore } = useFirebase();
  const [rows, setRows] = useState<DifficultyRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('wrongRate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [refreshNonce, setRefreshNonce] = useState(0);

  const fetchLive = useCallback(async () => {
    if (!firestore) return;
    setLoading(true);
    setError(null);
    try {
      // Live query — no cache, direct Firestore getDocs. Reads questionStats denormalized on question docs.
      const quizzesSnap = await getDocs(collection(firestore, 'quizzes'));
      const quizzes = quizzesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as { id: string; title?: string }));
      if (quizzes.length === 0) {
        setRows([]);
        setFetchedAt(Date.now());
        return;
      }

      const quizTitleMap = new Map<string, string>();
      for (const q of quizzes) quizTitleMap.set(q.id, (q.title as string) || 'Untitled');

      const questionsSnaps = await Promise.all(quizzes.map((q) => getDocs(collection(firestore, 'quizzes', q.id, 'questions'))));

      const out: DifficultyRow[] = [];
      for (let i = 0; i < quizzes.length; i++) {
        const qid = quizzes[i].id;
        const quizTitle = quizTitleMap.get(qid) || 'Untitled';
        const snap = questionsSnaps[i];
        for (const doc of snap.docs) {
          const data = doc.data() as Record<string, unknown>;
          const text = (data.text as string) || '(no text)';
          const stats = data.questionStats as { submittedCount?: number; correctCount?: number } | undefined;
          const submittedCount = typeof stats?.submittedCount === 'number' ? stats.submittedCount : 0;
          const correctCount = typeof stats?.correctCount === 'number' ? stats.correctCount : 0;
          const wrongCount = Math.max(0, submittedCount - correctCount);
          const wrongRate = submittedCount > 0 ? (1 - correctCount / submittedCount) * 100 : 0;
          const correctRate = submittedCount > 0 ? (correctCount / submittedCount) * 100 : 0;
          out.push({
            questionId: doc.id,
            quizId: qid,
            quizTitle,
            text,
            submittedCount,
            correctCount,
            wrongCount,
            wrongRate: Math.round(wrongRate * 100) / 100,
            correctRate: Math.round(correctRate * 100) / 100,
          });
        }
      }

      setRows(out);
      setFetchedAt(Date.now());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load difficulty calibration');
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
      // default dirs: hardest first (desc) for wrongRate, otherwise desc for counts
      setSortDir(key === 'text' || key === 'quizTitle' ? 'asc' : 'desc');
    }
  };

  const filtered = useMemo(() => {
    if (!rows) return [];
    let base = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      base = base.filter((r) => r.text.toLowerCase().includes(q) || r.quizTitle.toLowerCase().includes(q));
    }
    const copy = [...base];
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
  }, [rows, search, sortKey, sortDir]);

  const hardest = useMemo(() => {
    if (!rows) return [];
    return [...rows].filter((r) => r.submittedCount > 0).sort((a, b) => b.wrongRate - a.wrongRate).slice(0, 3);
  }, [rows]);

  const easiest = useMemo(() => {
    if (!rows) return [];
    return [...rows].filter((r) => r.submittedCount > 0).sort((a, b) => a.wrongRate - b.wrongRate).slice(0, 3);
  }, [rows]);

  if (loading && !rows) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4" aria-hidden="true" /> Difficulty Calibration
          </CardTitle>
          <CardDescription className="text-xs">Live-queried via Firestore getDocs — no cache</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4" aria-hidden="true" /> Difficulty Calibration
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
              <Brain className="w-4 h-4" aria-hidden="true" />
              Difficulty Calibration
              <Badge variant="outline" className="ml-1 bg-success/10 text-success border-0 text-[10px] font-medium">
                Live
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              Hardest vs easiest questions across all battles. Computed live from <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">questionStats</code> (correctCount / submittedCount → wrongRate) via{' '}
              <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">getDocs</code>. No cache.
              {fetchedAt && <span className="ml-1">Fetched: {new Date(fetchedAt).toLocaleTimeString()}</span>}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRefreshNonce((n) => n + 1)} aria-label="Refresh difficulty calibration" disabled={loading}>
            <RefreshCw className={cn('w-4 h-4 mr-1.5', loading && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </div>

        {rows && rows.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <div className="bg-destructive/5 border border-destructive/10 rounded-[14px] p-4 space-y-2">
              <h4 className="text-xs font-medium flex items-center gap-1.5 text-destructive">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> Hardest (high wrongRate)
              </h4>
              {hardest.length === 0 ? (
                <p className="text-xs text-muted-foreground">No submitted data yet.</p>
              ) : (
                hardest.map((r, i) => (
                  <div key={r.questionId} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">
                      {i + 1}. {r.text}
                    </span>
                    <Badge variant="destructive" className="shrink-0 font-mono text-[10px]">
                      {r.wrongRate.toFixed(1)}% wrong
                    </Badge>
                  </div>
                ))
              )}
            </div>
            <div className="bg-success/5 border border-success/10 rounded-[14px] p-4 space-y-2">
              <h4 className="text-xs font-medium flex items-center gap-1.5 text-success">
                <Target className="w-3.5 h-3.5" aria-hidden="true" /> Easiest (low wrongRate)
              </h4>
              {easiest.length === 0 ? (
                <p className="text-xs text-muted-foreground">No submitted data yet.</p>
              ) : (
                easiest.map((r, i) => (
                  <div key={r.questionId} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">
                      {i + 1}. {r.text}
                    </span>
                    <Badge className="bg-success/10 text-success border-0 shrink-0 font-mono text-[10px]">{r.wrongRate.toFixed(1)}% wrong</Badge>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="relative mt-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <Input placeholder="Search questions or battles..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 max-w-sm" aria-label="Search difficulty calibration" />
        </div>
      </CardHeader>
      <CardContent>
        {!rows || rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No questions found. Live query scanned quizzes/&#123;id&#125;/questions.</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No matches for “{search}”.</div>
        ) : (
          <div className="overflow-x-auto rounded-[12px] border border-border/50">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="bg-muted/30 border-b border-border/50">
                  <th scope="col" className="text-left py-3 px-4 font-medium text-muted-foreground text-xs">
                    <button onClick={() => handleSort('text')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors" aria-label="Sort by question">
                      Question <SortIcon active={sortKey === 'text'} dir={sortDir} />
                    </button>
                  </th>
                  <th scope="col" className="text-left py-3 px-4 font-medium text-muted-foreground text-xs">
                    <button onClick={() => handleSort('quizTitle')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors" aria-label="Sort by battle">
                      Battle <SortIcon active={sortKey === 'quizTitle'} dir={sortDir} />
                    </button>
                  </th>
                  <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">
                    <button onClick={() => handleSort('submittedCount')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors" aria-label="Sort by submitted">
                      Submitted <SortIcon active={sortKey === 'submittedCount'} dir={sortDir} />
                    </button>
                  </th>
                  <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">
                    <button onClick={() => handleSort('correctCount')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors" aria-label="Sort by correct">
                      Correct <SortIcon active={sortKey === 'correctCount'} dir={sortDir} />
                    </button>
                  </th>
                  <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">
                    <button onClick={() => handleSort('wrongRate')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors" aria-label="Sort by wrong rate">
                      Wrong Rate <SortIcon active={sortKey === 'wrongRate'} dir={sortDir} />
                    </button>
                  </th>
                  <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">
                    <button onClick={() => handleSort('correctRate')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors" aria-label="Sort by correct rate">
                      Correct Rate <SortIcon active={sortKey === 'correctRate'} dir={sortDir} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={`${r.quizId}-${r.questionId}`} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4 max-w-[320px]">
                      <span className="font-medium text-sm line-clamp-2" title={r.text}>
                        {r.text}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">{r.questionId.slice(0, 8)}…</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-muted-foreground max-w-[160px] truncate" title={r.quizTitle}>
                      {r.quizTitle}
                    </td>
                    <td className="text-center py-3 px-4 font-medium">{r.submittedCount}</td>
                    <td className="text-center py-3 px-4 text-success font-medium">{r.correctCount}</td>
                    <td className="text-center py-3 px-4">
                      <Badge variant="outline" className={cn('font-mono border-0 text-xs', r.wrongRate >= 60 ? 'bg-destructive/10 text-destructive' : r.wrongRate >= 30 ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success')}>
                        {r.wrongRate.toFixed(1)}%
                      </Badge>
                    </td>
                    <td className="text-center py-3 px-4">
                      <span className="text-xs text-muted-foreground font-mono">{r.correctRate.toFixed(1)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[10px] text-muted-foreground">
          Read-only live view — queries <code className="font-mono bg-muted px-1 py-0.5 rounded">quizzes</code> and{' '}
          <code className="font-mono bg-muted px-1 py-0.5 rounded">quizzes/&#123;id&#125;/questions</code> via getDocs on mount and on refresh; computes{' '}
          <code className="font-mono bg-muted px-1 py-0.5 rounded">wrongRate = 1 - correctCount/submittedCount</code> from questionStats.
        </p>
      </CardContent>
    </Card>
  );
}
