'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Download, Swords, Users, Calendar, Trophy, Star, ChevronDown, ChevronRight, AlertTriangle, RefreshCw } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

interface BattleSummary {
  id: string;
  title: string;
  commanderName: string;
  createdAt: number;
  finishedAt: number;
  participantCount: number;
  questionCount: number;
  difficulty: string;
  averageScore: number;
  winner: { name: string; score: number } | null;
}

const PAGE_SIZE = 50;

export default function ExecutiveBattlesPage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const [battles, setBattles] = useState<BattleSummary[]>([]);
  const [totalBattles, setTotalBattles] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchBattles = useCallback(async (offset: number, append: boolean) => {
    if (!user) return;
    try {
      if (append) setLoadingMore(true); else setError(null);
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      params.set('offset', String(offset));
      const res = await fetch(`/api/executive/battles?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBattles(prev => append ? [...prev, ...(data.battles || [])] : (data.battles || []));
        setTotalBattles(data.totalBattles || 0);
        setHasMore(!!data.hasMore);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to load battle history.');
        if (!append) setBattles([]);
      }
    } catch {
      setError('Network error. Check your connection and try again.');
      if (!append) setBattles([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, auth, search]);

  useEffect(() => {
    setLoading(true);
    setBattles([]);
    const t = setTimeout(() => fetchBattles(0, false), 250);
    return () => clearTimeout(t);
  }, [search, fetchBattles]);

  const loadMore = () => fetchBattles(battles.length, true);

  const exportCSV = () => {
    const rows = [['Title', 'Commander', 'Date', 'Difficulty', 'Participants', 'Avg Score', 'Winner', 'Winner Score']];
    battles.forEach(b => {
      rows.push([
        b.title,
        b.commanderName,
        new Date(b.createdAt || 0).toLocaleDateString(),
        b.difficulty,
        String(b.participantCount),
        String(b.averageScore),
        b.winner?.name || '',
        b.winner ? String(b.winner.score) : '',
      ]);
    });
    const csv = rows.map(r => `"${r.map(c => c.replace(/"/g, '""')).join('","')}"`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `battle-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-container animate-in safe-bottom">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="space-y-1.5">
          <h1 className="text-page-title font-headline tracking-tight">Battle History</h1>
          <p className="text-base text-muted-foreground">All completed arenas across the platform. {totalBattles > 0 && `${battles.length} shown of ${totalBattles}.`}</p>
        </div>
        <Button variant="outline" onClick={exportCSV} disabled={battles.length === 0}>
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="relative max-w-md mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search battles by title or ID..."
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-44" />
          <Skeleton className="h-10 max-w-md" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card className="border-destructive/40">
          <CardContent className="py-14 text-center">
            <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-4" />
            <p className="text-base font-medium mb-1">Failed to load battle history</p>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" onClick={() => { setLoading(true); fetchBattles(0, false); }}>
              <RefreshCw className="w-4 h-4 mr-2" /> Retry
            </Button>
          </CardContent>
        </Card>
      ) : battles.length === 0 ? (
        <EmptyState icon={Swords}
          title={search ? 'No Battles Match' : 'No Completed Battles'}
          description={search ? 'No completed battles match your search.' : 'Completed arenas will appear here as battles finish.'}
        />
      ) : (
        <div className="space-y-3">
          {battles.map(b => (
            <Card key={b.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-card-title font-headline tracking-tight truncate block">{b.title}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">COMPLETED</Badge>
                      <Badge variant="outline" className="text-[10px] shrink-0 capitalize">{b.difficulty}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5 flex-wrap">
                      <span className="font-mono text-[11px] bg-muted/50 px-2 py-0.5 rounded-[6px]">{b.id}</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(b.createdAt || 0).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {b.participantCount} gladiator{b.participantCount !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <Star className="w-3 h-3" />
                        Avg: {b.averageScore}
                      </span>
                      {b.winner && (
                        <span className="flex items-center gap-1">
                          <Trophy className="w-3 h-3 text-warning" />
                          {b.winner.name} ({b.winner.score} pts)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">Hosted by {b.commanderName}</p>
                  </div>
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link href={`/executive/battles/${b.id}`}>
                      <ChevronRight className="w-3.5 h-3.5 mr-1" /> Details
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Loading...</>
                ) : (
                  <><ChevronDown className="w-4 h-4 mr-2" /> Load More ({Math.min(PAGE_SIZE, totalBattles - battles.length)} more)</>
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
