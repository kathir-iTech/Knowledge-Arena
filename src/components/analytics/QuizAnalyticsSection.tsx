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
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from './charts';
import { Clock, Users, Target, Activity, AlertTriangle } from 'lucide-react';

function ScoreDistributionChart({ quiz }: { quiz: QuizAnalytics }) {
  const BAR_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];
  return (
    <div className="h-48">
      <p className="text-xs font-medium text-muted-foreground mb-2">Score Distribution</p>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={quiz.scoreDistribution} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="range" tick={{ fontSize: 10 }} />
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

function TimelineChart({ quiz }: { quiz: QuizAnalytics }) {
  if (!quiz.participationTimeline.length) return null;
  return (
    <div className="h-48">
      <p className="text-xs font-medium text-muted-foreground mb-2">Participation Timeline</p>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={quiz.participationTimeline} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="time" tick={{ fontSize: 10 }} tickFormatter={v => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
          <YAxis />
          <Tooltip labelFormatter={v => new Date(Number(v)).toLocaleTimeString()} />
          <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function QuizAnalyticsSection({ quizzes }: { quizzes: QuizAnalytics[] }) {
  if (!quizzes.length) {
    return (
      <Card>
        <CardHeader><CardTitle>Quiz Analytics</CardTitle></CardHeader>
        <CardContent className="text-center py-8 text-muted-foreground">No finished quizzes yet.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 mb-8">
      <div className="flex items-center gap-2">
        <h2 className="text-section-title tracking-tight">Quiz Analytics</h2>
      </div>
      {quizzes.map(quiz => (
        <Card key={quiz.quizId}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{quiz.title}</CardTitle>
              <Badge variant="outline" className="font-mono text-xs">{quiz.quizId}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center p-2 bg-muted/30 rounded-lg">
                <div className="text-lg font-bold">{quiz.finishedParticipants}<span className="text-xs text-muted-foreground ml-1">/ {quiz.totalParticipants}</span></div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Users className="w-3 h-3" aria-hidden="true" /> Finished</div>
              </div>
              <div className="text-center p-2 bg-muted/30 rounded-lg">
                <div className="text-lg font-bold">{quiz.averageScore}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Target className="w-3 h-3" aria-hidden="true" /> Avg Score</div>
              </div>
              <div className="text-center p-2 bg-muted/30 rounded-lg">
                <div className="text-lg font-bold">{Math.round(quiz.duration / 60000)}m</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Clock className="w-3 h-3" aria-hidden="true" /> Duration</div>
              </div>
              <div className="text-center p-2 bg-muted/30 rounded-lg">
                <div className="text-lg font-bold">{quiz.engagementScore}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Activity className="w-3 h-3" aria-hidden="true" /> Engagement</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              <ScoreDistributionChart quiz={quiz} />
              <TimelineChart quiz={quiz} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs">
              <div className="flex items-center gap-1 text-muted-foreground">
                <span className={cn('inline-block w-2 h-2 rounded-full', quiz.completionPercent >= 50 ? 'bg-green-500' : 'bg-amber-500')} />
                Completion: {quiz.completionPercent}%
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                Dropout: {quiz.dropoutPercent}%
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                Violations: {quiz.totalViolations}
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Users className="w-3 h-3" aria-hidden="true" />
                Blocked: {quiz.blockedParticipants}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2 text-xs text-muted-foreground">
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
