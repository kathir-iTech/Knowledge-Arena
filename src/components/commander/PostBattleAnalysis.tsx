'use client';

import React, { useEffect, useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Download, BarChart3, Clock, Target, TrendingUp, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BreakdownItem {
  questionId: string;
  text: string;
  options: string[];
  correctOptionIndex: number | null;
  submittedCount: number;
  correctCount: number;
  avgTimeSec: number;
  mostCommonWrongAnswer: { option: string; count: number } | null;
  optionCounts: Record<string, number>;
}

interface EngagementItem {
  gladiatorId: string;
  name: string;
  progression: number[];
  total: number;
}

interface AnalysisData {
  quizId: string;
  title: string;
  questionBreakdown: BreakdownItem[];
  engagement: EngagementItem[];
  detailed: Array<{ gladiatorName: string; questionText: string; answerGiven: string; correct: boolean; timeTakenSec: number; pointsAwarded: number }>;
  participants: number;
}

const PostBattleCharts = dynamic(
  () => import('./PostBattleCharts').then(m => ({ default: m.PostBattleCharts })),
  { ssr: false, loading: () => <LoadingScreen /> }
);

export function PostBattleAnalysis({ quizId }: { quizId: string }) {
  const { auth } = useFirebase();
  const { toast } = useToast();
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const fetchData = async () => {
      try {
        const token = await auth.currentUser!.getIdToken();
        const res = await fetch(`/api/battle/${quizId}/analysis`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `Failed (${res.status})`);
        }
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load analysis');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [quizId, auth]);

  const handleExportCSV = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(`/api/battle/${quizId}/analysis?format=csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `battle-${quizId}-analysis.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'CSV Exported', description: 'Detailed per-gladiator-question CSV downloaded.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Export failed', description: e instanceof Error ? e.message : 'Unknown error' });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-10 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => window.location.reload()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  // Prepare chart data: per-question view vs per-gladiator progression
  const questionChartData = data.questionBreakdown.map((q, idx) => ({
    name: `Q${idx + 1}`,
    correct: q.correctCount,
    incorrect: q.submittedCount - q.correctCount,
    avgTime: q.avgTimeSec,
  }));

  // Engagement chart: line per gladiator
  const maxQuestions = data.questionBreakdown.length;
  const engagementChartData = Array.from({ length: maxQuestions }, (_, qIdx) => {
    const row: Record<string, string | number> = { question: `Q${qIdx + 1}` };
    for (const g of data.engagement) {
      row[g.name] = g.progression[qIdx] ?? 0;
    }
    return row;
  });

  const colors = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-headline tracking-tight flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" /> Post-Battle Analysis
          </h2>
          <p className="text-sm text-muted-foreground">{data.title} — {data.participants} gladiator(s), {data.questionBreakdown.length} question(s)</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV}>
          <Download className="w-4 h-4 mr-2" /> Export Detailed CSV
        </Button>
      </div>

      <Suspense fallback={<LoadingScreen />}>
        <PostBattleCharts
          questionChartData={questionChartData}
          engagementChartData={engagementChartData}
          engagement={data.engagement}
          colors={colors}
        />
      </Suspense>

      {/* Question-by-question breakdown details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" /> Question Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {data.questionBreakdown.map((q, idx) => (
              <div key={q.questionId} className="p-3 rounded-[12px] border border-border/40 bg-muted/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Q{idx + 1}: {q.text}</p>
                    <div className="flex flex-wrap gap-2 mt-2 text-xs">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-success/10 text-success border border-success/20">
                        <Users className="w-3 h-3" /> {q.correctCount}/{q.submittedCount} correct ({q.submittedCount ? Math.round((q.correctCount / q.submittedCount) * 100) : 0}%)
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                        <Clock className="w-3 h-3" /> Avg {q.avgTimeSec}s
                      </span>
                      {q.mostCommonWrongAnswer && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                          Most wrong: "{q.mostCommonWrongAnswer.option}" ×{q.mostCommonWrongAnswer.count}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2">
                      {q.options.map((opt, oi) => {
                        const isCorrect = oi === q.correctOptionIndex;
                        const count = q.optionCounts[String(oi)] || 0;
                        return (
                          <div key={oi} className={`px-2 py-1 rounded-[8px] border text-xs flex items-center justify-between ${isCorrect ? 'bg-success/10 border-success/30' : 'bg-background border-border/40'}`}>
                            <span className="truncate">{String.fromCharCode(65 + oi)}: {opt.slice(0, 24)}</span>
                            <Badge variant="outline" className="text-[10px] h-4 ml-1">{count}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Gladiator engagement details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> Gladiator Engagement — Score Progression
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.engagement.length === 0 ? (
            <p className="text-sm text-muted-foreground">No gladiator data.</p>
          ) : (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {data.engagement.map(g => (
                <div key={g.gladiatorId} className="p-2.5 rounded-[10px] bg-muted/20 border border-border/30">
                  <p className="text-xs font-medium truncate">{g.name}</p>
                  <p className="text-sm font-bold text-primary">{g.total} pts</p>
                  <p className="text-[11px] text-muted-foreground">Prog: {g.progression.join(' → ')}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed CSV preview */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Detailed Rows (per gladiator-question)</CardTitle>
          <Badge variant="outline" className="text-[10px]">{data.detailed.length} rows</Badge>
        </CardHeader>
        <CardContent>
          <div className="max-h-[280px] overflow-auto border rounded-[10px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Gladiator</th>
                  <th className="text-left p-2 font-medium">Question</th>
                  <th className="text-left p-2 font-medium">Answer</th>
                  <th className="text-left p-2 font-medium">Result</th>
                  <th className="text-right p-2 font-medium">Time (s)</th>
                  <th className="text-right p-2 font-medium">Points</th>
                </tr>
              </thead>
              <tbody>
                {data.detailed.slice(0, 100).map((r, i) => (
                  <tr key={i} className="border-t border-border/20">
                    <td className="p-2 truncate max-w-[100px]">{r.gladiatorName}</td>
                    <td className="p-2 truncate max-w-[160px]">{r.questionText.slice(0, 40)}</td>
                    <td className="p-2 truncate max-w-[100px]">{r.answerGiven.slice(0, 24)}</td>
                    <td className="p-2"><Badge variant={r.correct ? 'default' : 'secondary'} className="text-[10px] h-4">{r.correct ? 'Correct' : 'Wrong'}</Badge></td>
                    <td className="p-2 text-right">{r.timeTakenSec}</td>
                    <td className="p-2 text-right font-mono">{r.pointsAwarded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.detailed.length > 100 && <p className="text-[11px] text-muted-foreground mt-2">Showing 100 of {data.detailed.length} rows — CSV contains all.</p>}
        </CardContent>
      </Card>
    </div>
  );
}