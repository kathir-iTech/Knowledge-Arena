'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Search, TrendingUp, TrendingDown, Minus, Medal, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StudentAnalytics } from '@/services/analytics.service';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from './charts';

function TrendIcon({ trend }: { trend: number }) {
  if (trend > 0) return <TrendingUp className="w-4 h-4 text-success" aria-hidden="true" />;
  if (trend < 0) return <TrendingDown className="w-4 h-4 text-destructive" aria-hidden="true" />;
  return <Minus className="w-4 h-4 text-muted-foreground" aria-hidden="true" />;
}

function PercentileBadge({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'bg-success/10 text-success' : pct >= 50 ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive';
  return <Badge variant="outline" className={cn(color, 'border-0')}>{pct.toFixed(0)}th</Badge>;
}

export function StudentAnalyticsSection({ students }: { students: StudentAnalytics[] }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return students;
    const q = search.toLowerCase();
    return students.filter(s => s.name.toLowerCase().includes(q) || s.userId.toLowerCase().includes(q));
  }, [students, search]);

  if (!students.length) {
    return (
      <Card>
        <CardHeader><CardTitle>Student Analytics</CardTitle></CardHeader>
        <CardContent className="text-center py-8 text-muted-foreground">No student data yet.</CardContent>
      </Card>
    );
  }

  const chartData = filtered.slice(0, 20).map(s => ({ name: s.name, score: s.averageScore }));
  const barColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Student Analytics</CardTitle>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search students..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 max-w-xs"
            aria-label="Search students"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" role="table">
            <thead>
              <tr className="border-b">
                <th scope="col" className="text-left py-2 px-3 font-medium text-muted-foreground">Student</th>
                <th scope="col" className="text-center py-2 px-3 font-medium text-muted-foreground">Attended</th>
                <th scope="col" className="text-center py-2 px-3 font-medium text-muted-foreground">Completed</th>
                <th scope="col" className="text-center py-2 px-3 font-medium text-muted-foreground">Avg Score</th>
                <th scope="col" className="text-center py-2 px-3 font-medium text-muted-foreground">High / Low</th>
                <th scope="col" className="text-center py-2 px-3 font-medium text-muted-foreground">Percentile</th>
                <th scope="col" className="text-center py-2 px-3 font-medium text-muted-foreground">Trend</th>
                <th scope="col" className="text-center py-2 px-3 font-medium text-muted-foreground">Avg Time</th>
                <th scope="col" className="text-center py-2 px-3 font-medium text-muted-foreground">Violations</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.userId} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <Avatar className="w-7 h-7">
                        <AvatarFallback className="text-sm">{s.avatar}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{s.name}</span>
                    </div>
                  </td>
                  <td className="text-center py-2 px-3">{s.quizzesAttended}</td>
                  <td className="text-center py-2 px-3">{s.quizzesCompleted} <span className="text-muted-foreground text-xs">({s.completionPercent}%)</span></td>
                  <td className="text-center py-2 px-3 font-semibold">{s.averageScore}</td>
                  <td className="text-center py-2 px-3 text-xs">
                    <span className="text-success">{s.highestScore}</span>
                    <span className="text-muted-foreground mx-1">/</span>
                    <span className="text-destructive">{s.lowestScore}</span>
                  </td>
                  <td className="text-center py-2 px-3"><PercentileBadge pct={s.latestPercentile} /></td>
                  <td className="text-center py-2 px-3">
                    <div className="flex items-center justify-center gap-1">
                      <TrendIcon trend={s.improvementTrend} />
                      <span className={cn('text-xs', s.improvementTrend > 0 ? 'text-success' : s.improvementTrend < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                        {s.improvementTrend > 0 ? '+' : ''}{s.improvementTrend}
                      </span>
                    </div>
                  </td>
                  <td className="text-center py-2 px-3">
                    <span className="text-xs flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      {s.averageAnswerTime}s
                    </span>
                  </td>
                  <td className="text-center py-2 px-3">
                    <span className={cn('flex items-center justify-center gap-1 text-xs', s.totalViolations > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                      <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                      {s.totalViolations}
                      {s.blockedCount > 0 && <Badge variant="destructive" className="ml-1 text-[10px] px-1 py-0">{s.blockedCount}B</Badge>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {chartData.length > 0 && (
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 40, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={barColors[i % barColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
