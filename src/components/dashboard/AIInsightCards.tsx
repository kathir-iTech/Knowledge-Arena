'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useFirebase } from '@/firebase';
import { RefreshCw, TrendingUp, BookOpen, ShieldCheck, AlertTriangle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

const tabs = [
  { id: 'prediction', label: 'Prediction', icon: TrendingUp },
  { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
  { id: 'decisions', label: 'Decisions', icon: ShieldCheck },
];

function PredictionPanel() {
  const { data, isLoading, error, refetch } = useAIFetch<PredictionData>('/api/predictions/summary');

  if (isLoading) return <div className="space-y-3 py-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/3" /></div>;
  if (error) return <div className="text-center py-6"><p className="text-sm text-muted-foreground mb-3">Prediction data unavailable.</p><Button variant="outline" size="sm" onClick={refetch}>Try Again</Button></div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Trend</span>
          <p className="text-sm font-medium">{data.trend}</p>
        </div>
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Engagement</span>
          <Badge variant="success" className="font-mono h-6">{data.predictedEngagement}%</Badge>
        </div>
      </div>
      <div className="pt-3 border-t border-border/50">
        <p className="text-sm text-muted-foreground leading-relaxed">{data.recommendation}</p>
      </div>
    </div>
  );
}

function KnowledgePanel() {
  const { data, isLoading, error, refetch } = useAIFetch<KnowledgeData>('/api/knowledge/summary');

  if (isLoading) return <div className="space-y-3 py-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/3" /></div>;
  if (error) return <div className="text-center py-6"><p className="text-sm text-muted-foreground mb-3">Knowledge data unavailable.</p><Button variant="outline" size="sm" onClick={refetch}>Try Again</Button></div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">{data.insight}</p>
      {data.topicCoverage.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.topicCoverage.map((topic, i) => (
            <Badge key={i} variant="secondary" className="h-6">{topic}</Badge>
          ))}
        </div>
      )}
      <div className="pt-3 border-t border-border/50 flex items-start gap-2.5">
        <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <p className="text-sm font-medium text-primary">{data.nextStrategicMove}</p>
      </div>
    </div>
  );
}

function DecisionPanel() {
  const { data, isLoading, error, refetch } = useAIFetch<DecisionSupportData>('/api/decision-support/summary');

  if (isLoading) return <div className="space-y-3 py-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/3" /></div>;
  if (error) return <div className="text-center py-6"><p className="text-sm text-muted-foreground mb-3">Decision support unavailable.</p><Button variant="outline" size="sm" onClick={refetch}>Try Again</Button></div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {data.criticalAlerts.length > 0 && (
        <div className="space-y-2">
          {data.criticalAlerts.map((alert, i) => (
            <div key={i} className="flex items-start gap-2.5 text-sm text-destructive bg-destructive/5 p-3 rounded-[10px] border border-destructive/10">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{alert}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-sm text-muted-foreground leading-relaxed">{data.arenaOptimization}</p>
      <div className="pt-3 border-t border-border/50">
        <p className="text-sm font-medium text-primary">{data.commanderAdvice}</p>
      </div>
    </div>
  );
}

export function AIInsightCards() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">AI Workspace</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <Tabs defaultValue="prediction" className="w-full">
          <TabsList className="w-full grid grid-cols-3 h-10 mb-4 rounded-[10px]">
            {tabs.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id} className="text-xs gap-1.5">
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="prediction"><PredictionPanel /></TabsContent>
          <TabsContent value="knowledge"><KnowledgePanel /></TabsContent>
          <TabsContent value="decisions"><DecisionPanel /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
