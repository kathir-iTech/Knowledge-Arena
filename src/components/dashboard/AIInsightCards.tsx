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
    <Card className="bg-secondary/10 border-primary/20">
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </CardContent>
    </Card>
  );
}

function PredictionCard() {
  const { data, isLoading, error, refetch } = useAIFetch<PredictionData>('/api/predictions/summary');

  return (
    <Card className={cn("bg-secondary/10 border-primary/20 relative overflow-hidden", isLoading && "opacity-60")}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-headline flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Prediction Engine
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refetch} disabled={isLoading}>
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : error ? (
          <div className="text-xs text-destructive space-y-2">
            <p>Prediction unavailable.</p>
            <p className="text-[10px] opacity-70 break-words">{error}</p>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={refetch}>Retry</Button>
          </div>
        ) : data ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Trend:</span>
              <span className="font-medium">{data.trend}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Engagement:</span>
              <Badge variant="outline" className="font-mono">{data.predictedEngagement}%</Badge>
            </div>
            <p className="text-xs text-muted-foreground italic mt-2">{data.recommendation}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function KnowledgeCard() {
  const { data, isLoading, error, refetch } = useAIFetch<KnowledgeData>('/api/knowledge/summary');

  return (
    <Card className={cn("bg-secondary/10 border-primary/20 relative overflow-hidden", isLoading && "opacity-60")}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-headline flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-accent" />
          Knowledge Engine
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refetch} disabled={isLoading}>
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : error ? (
          <div className="text-xs text-destructive space-y-2">
            <p>Knowledge unavailable.</p>
            <p className="text-[10px] opacity-70 break-words">{error}</p>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={refetch}>Retry</Button>
          </div>
        ) : data ? (
          <div className="space-y-2 text-sm">
            <p className="text-xs text-muted-foreground leading-relaxed">{data.insight}</p>
            {data.topicCoverage.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {data.topicCoverage.map((topic, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">{topic}</Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-accent font-medium pt-1">{data.nextStrategicMove}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DecisionSupportCard() {
  const { data, isLoading, error, refetch } = useAIFetch<DecisionSupportData>('/api/decision-support/summary');

  return (
    <Card className={cn("bg-secondary/10 border-primary/20 relative overflow-hidden", isLoading && "opacity-60")}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-headline flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-green-500" />
          Decision Support
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refetch} disabled={isLoading}>
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : error ? (
          <div className="text-xs text-destructive space-y-2">
            <p>Decision support unavailable.</p>
            <p className="text-[10px] opacity-70 break-words">{error}</p>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={refetch}>Retry</Button>
          </div>
        ) : data ? (
          <div className="space-y-2 text-sm">
            {data.criticalAlerts.length > 0 && (
              <div className="space-y-1">
                {data.criticalAlerts.map((alert, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-destructive">
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>{alert}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{data.arenaOptimization}</p>
            <p className="text-xs font-medium text-green-500 pt-1">{data.commanderAdvice}</p>
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
