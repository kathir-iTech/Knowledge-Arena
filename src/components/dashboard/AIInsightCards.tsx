'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useFirebase } from '@/firebase';
import { RefreshCw, TrendingUp, BookOpen, ShieldCheck, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PredictionData {
  trend: string;
  predictedEngagement: number;
  recommendation: string;
}

interface KnowledgeData {
  insight: string;
  topicCoverage: string[];
  nextStrategicMove: string;
}

interface DecisionSupportData {
  criticalAlerts: string[];
  arenaOptimization: string;
  commanderAdvice: string;
}

function useAIFetch<T>(url: string) {
  const { auth } = useFirebase();
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!idToken) throw new Error('Session expired');

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${idToken}` },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch');
      }

      setData(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [url, auth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}

function CardSkeleton() {
  return (
    <Card className="bg-secondary/10 border-primary/10 animate-pulse">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-6 w-6 rounded" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3.5 w-5/6" />
      </CardContent>
    </Card>
  );
}

function PredictionCard() {
  const { data, isLoading, error, refetch } = useAIFetch<PredictionData>('/api/predictions/summary');

  return (
    <Card className={cn("bg-secondary/10 border-primary/15 relative overflow-hidden transition-all duration-200 hover:border-primary/30", isLoading && "opacity-60")}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/[0.03] to-transparent rounded-bl-full pointer-events-none" />
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-headline flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Prediction Engine
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={refetch} disabled={isLoading} aria-label="Refresh prediction">
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2" aria-hidden="true">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        ) : error ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Prediction insights are currently unavailable. The oracle needs a moment.</p>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={refetch}>Try Again</Button>
          </div>
        ) : data ? (
          <div className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Trend</span>
              <span className="font-medium text-xs">{data.trend}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Engagement</span>
              <Badge variant="outline" className="font-mono text-[10px] h-5">{data.predictedEngagement}%</Badge>
            </div>
            <p className="text-xs text-muted-foreground/80 italic leading-relaxed pt-1 border-t border-border/20">{data.recommendation}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function KnowledgeCard() {
  const { data, isLoading, error, refetch } = useAIFetch<KnowledgeData>('/api/knowledge/summary');

  return (
    <Card className={cn("bg-secondary/10 border-primary/15 relative overflow-hidden transition-all duration-200 hover:border-primary/30", isLoading && "opacity-60")}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-accent/[0.03] to-transparent rounded-bl-full pointer-events-none" />
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-headline flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-accent" />
          Knowledge Engine
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={refetch} disabled={isLoading} aria-label="Refresh knowledge">
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2" aria-hidden="true">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        ) : error ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Knowledge insights are currently unavailable. The archives are being consulted.</p>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={refetch}>Try Again</Button>
          </div>
        ) : data ? (
          <div className="space-y-2.5 text-sm">
            <p className="text-xs text-muted-foreground/80 leading-relaxed">{data.insight}</p>
            {data.topicCoverage.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {data.topicCoverage.map((topic, i) => (
                  <Badge key={i} variant="secondary" className="text-[9px] h-5">{topic}</Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-accent font-medium pt-1 border-t border-border/20">{data.nextStrategicMove}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DecisionSupportCard() {
  const { data, isLoading, error, refetch } = useAIFetch<DecisionSupportData>('/api/decision-support/summary');

  return (
    <Card className={cn("bg-secondary/10 border-primary/15 relative overflow-hidden transition-all duration-200 hover:border-primary/30", isLoading && "opacity-60")}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-green-500/[0.03] to-transparent rounded-bl-full pointer-events-none" />
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-headline flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-green-500" />
          Decision Support
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={refetch} disabled={isLoading} aria-label="Refresh decision support">
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2" aria-hidden="true">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        ) : error ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Decision support is currently unavailable. The war council is in session.</p>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={refetch}>Try Again</Button>
          </div>
        ) : data ? (
          <div className="space-y-2.5 text-sm">
            {data.criticalAlerts.length > 0 && (
              <div className="space-y-1.5">
                {data.criticalAlerts.map((alert, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 p-2 rounded-lg">
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>{alert}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground/80">{data.arenaOptimization}</p>
            <p className="text-xs font-medium text-green-400 pt-1 border-t border-border/20">{data.commanderAdvice}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function AIInsightCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <PredictionCard />
      <KnowledgeCard />
      <DecisionSupportCard />
    </div>
  );
}
