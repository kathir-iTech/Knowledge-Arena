'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { QuizAnalytics } from '@/services/analytics.service';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
} from './charts';
import { AlertTriangle, Users } from 'lucide-react';

function ScoreDistributionChart({ quiz }: { quiz: QuizAnalytics }) {
  const BAR_COLORS = ['hsl(var(--destructive))', 'hsl(var(--warning))', '#eab308', 'hsl(var(--success))', 'hsl(var(--primary))'];
  return (
    <div className="h-48">
      <p className="text-sm font-medium text-muted-foreground mb-3">Score Distribution</p>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={quiz.scoreDistribution} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="range" tick={{ fontSize: 11 }} />
          <YAxis />
          <Tooltip />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {quiz.scoreDistribution.map((_, i) => (
              <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

import { Cell } from './charts';

function TimelineChart({ quiz }: { quiz: QuizAnalytics }) {
  if (!quiz.participationTimeline.length) return null;
  return (
    <div className="h-48">
      <p className="text-sm font-medium text-muted-foreground mb-3">Participation Timeline</p>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={quiz.participationTimeline} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="time" tick={{ fontSize: 11 }} tickFormatter={v => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
          <YAxis />
          <Tooltip labelFormatter={v => new Date(Number(v)).toLocaleTimeString()} />
          <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function QuizAnalyticsSection({ quizzes }: { quizzes: QuizAnalytics[] }) {
  if (!quizzes.length) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Quiz Analytics</CardTitle></CardHeader>
        <CardContent className="text-center py-12 text-muted-foreground">No finished quizzes yet.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5">
        <h2 className="text-section-title tracking-tight">Quiz Analytics</h2>
      </div>
      {quizzes.map(quiz => (
        <Card key={quiz.quizId}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{quiz.title}</CardTitle>
              <Badge variant="outline" className="font-mono">{quiz.quizId}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="text-center p-4 bg-muted/30 rounded-[12px]">
                <div className="text-xl font-semibold tracking-tight">{quiz.finishedParticipants}<span className="text-sm text-muted-foreground ml-1">/ {quiz.totalParticipants}</span></div>
                <div className="text-xs text-muted-foreground mt-1">Finished</div>
              </div>
              <div className="text-center p-4 bg-muted/30 rounded-[12px]">
                <div className="text-xl font-semibold tracking-tight">{quiz.averageScore}</div>
                <div className="text-xs text-muted-foreground mt-1">Avg Score</div>
              </div>
              <div className="text-center p-4 bg-muted/30 rounded-[12px]">
                <div className="text-xl font-semibold tracking-tight">{Math.round(quiz.duration / 60000)}m</div>
                <div className="text-xs text-muted-foreground mt-1">Duration</div>
              </div>
              <div className="text-center p-4 bg-muted/30 rounded-[12px]">
                <div className="text-xl font-semibold tracking-tight">{quiz.engagementScore}</div>
                <div className="text-xs text-muted-foreground mt-1">Engagement</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ScoreDistributionChart quiz={quiz} />
              <TimelineChart quiz={quiz} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-sm">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className={cn('inline-block w-2 h-2 rounded-full', quiz.completionPercent >= 50 ? 'bg-success' : 'bg-warning')} />
                Completion: {quiz.completionPercent}%
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="inline-block w-2 h-2 rounded-full bg-destructive" />
                Dropout: {quiz.dropoutPercent}%
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                Violations: {quiz.totalViolations}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="w-3.5 h-3.5" aria-hidden="true" />
                Blocked: {quiz.blockedParticipants}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2 text-sm text-muted-foreground">
              <div>Median: {quiz.medianScore}</div>
              <div>StdDev: {quiz.stdDevScore}</div>
              <div>Avg Answer: {quiz.averageAnswerTime}s</div>
              <div>Engagement: {quiz.engagementScore}/100</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
