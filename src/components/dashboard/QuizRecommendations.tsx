'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Sparkles, Target, TrendingUp, ChevronRight, Zap, BookOpen, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QuizRecommendation } from '@/ai/engines/prediction-engine';

export function QuizRecommendations() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const [recommendations, setRecommendations] = useState<QuizRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchRecommendations = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch('/api/gladiator/recommendations', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load recommendations');
        const data = await res.json();
        setRecommendations(data.recommendations || []);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchRecommendations();
  }, [user, auth]);

  if (loading) {
    return (
      <section className="page-section">
        <Card>
          <CardHeader className="border-b border-border/30 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Recommended for You
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-[10px] bg-muted/30">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-8 w-20 rounded-lg" />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    );
  }

  if (error) {
    return (
      <section className="page-section">
        <Card>
          <CardContent className="py-8 text-center">
            <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Could not load recommendations.</p>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (!recommendations.length) {
    return (
      <section className="page-section">
        <Card>
          <CardHeader className="border-b border-border/30 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Recommended for You
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <EmptyState
              icon={BookOpen}
              title="No Recommendations Yet"
              description="Complete more battles to get personalized quiz recommendations."
            />
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="page-section">
      <Card className="card-hover">
        <CardHeader className="border-b border-border/30 pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Recommended for You
            <Badge variant="outline" className="text-[10px] h-5 ml-auto">AI-Powered</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          {recommendations.map((rec) => (
            <div
              key={rec.quizId}
              className="flex items-center gap-4 p-3 rounded-[10px] bg-muted/20 border border-border/30 hover:border-primary/20 transition-colors group"
            >
              <div className="w-10 h-10 rounded-[10px] bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center shrink-0">
                <Target className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold truncate">{rec.title}</p>
                  <Badge variant="outline" className="text-[10px] h-5 capitalize shrink-0">{rec.difficulty}</Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">{rec.category} · {rec.questionCount} questions</p>
                <p className="text-[11px] text-primary/70 mt-0.5">{rec.reason}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">Confidence</p>
                  <p className="text-sm font-bold text-primary tabular-nums">{Math.round(rec.confidence * 100)}%</p>
                </div>
                <Button size="sm" variant="outline" asChild className="md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <Link href={`/battle/${rec.quizId}`}>Join<ChevronRight className="w-3 h-3 ml-1" /></Link>
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}