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
    <Card>
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

function InfoCardShell({ icon, label, color, isLoading, error, onRefresh, children }: {
  icon: React.ElementType; label: string; color: string;
  isLoading: boolean; error: string | null; onRefresh: () => void;
  children: React.ReactNode;
}) {
  const Icon = icon;
  return (
    <Card className={cn("transition-all duration-200 hover:shadow-elevation-hover", isLoading && "opacity-60")}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className={cn("w-4 h-4", color)} />
          {label}
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={onRefresh} disabled={isLoading} aria-label={`Refresh ${label}`}>
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent className="min-h-[80px]">
        {isLoading ? (
          <div className="space-y-2" aria-hidden="true">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        ) : error ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Currently unavailable.</p>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onRefresh}>Try Again</Button>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function PredictionCard() {
  const { data, isLoading, error, refetch } = useAIFetch<PredictionData>('/api/predictions/summary');

  return (
    <InfoCardShell icon={TrendingUp} label="Prediction Engine" color="text-primary" isLoading={isLoading} error={error} onRefresh={refetch}>
      {data && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Trend</span>
            <span className="font-medium text-xs">{data.trend}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Engagement</span>
            <Badge variant="outline" className="font-mono text-[10px] h-5">{data.predictedEngagement}%</Badge>
          </div>
          <p className="text-xs text-muted-foreground/80 leading-relaxed pt-1 border-t border-border/20">{data.recommendation}</p>
        </div>
      )}
    </InfoCardShell>
  );
}

function KnowledgeCard() {
  const { data, isLoading, error, refetch } = useAIFetch<KnowledgeData>('/api/knowledge/summary');

  return (
    <InfoCardShell icon={BookOpen} label="Knowledge Engine" color="text-primary" isLoading={isLoading} error={error} onRefresh={refetch}>
      {data && (
        <div className="space-y-2.5">
          <p className="text-xs text-muted-foreground/80 leading-relaxed">{data.insight}</p>
          {data.topicCoverage.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {data.topicCoverage.map((topic, i) => (
                <Badge key={i} variant="secondary" className="text-[9px] h-5">{topic}</Badge>
              ))}
            </div>
          )}
          <p className="text-xs text-primary font-medium pt-1 border-t border-border/20">{data.nextStrategicMove}</p>
        </div>
      )}
    </InfoCardShell>
  );
}

function DecisionSupportCard() {
  const { data, isLoading, error, refetch } = useAIFetch<DecisionSupportData>('/api/decision-support/summary');

  return (
    <InfoCardShell icon={ShieldCheck} label="Decision Support" color="text-primary" isLoading={isLoading} error={error} onRefresh={refetch}>
      {data && (
        <div className="space-y-2.5">
          {data.criticalAlerts.length > 0 && (
            <div className="space-y-1.5">
              {data.criticalAlerts.map((alert, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 p-2 rounded-[8px]">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{alert}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground/80">{data.arenaOptimization}</p>
          <p className="text-xs font-medium text-primary pt-1 border-t border-border/20">{data.commanderAdvice}</p>
        </div>
      )}
    </InfoCardShell>
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
