'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Search, TrendingUp, TrendingDown, Minus, Medal } from 'lucide-react';
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
        <CardHeader><CardTitle className="text-base">Student Analytics</CardTitle></CardHeader>
        <CardContent className="text-center py-12 text-muted-foreground">No student data yet.</CardContent>
      </Card>
    );
  }

  const chartData = filtered.slice(0, 20).map(s => ({ name: s.name, score: s.averageScore }));
  const barColors = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Student Analytics</CardTitle>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search students..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 max-w-xs"
            aria-label="Search students"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-[12px] border border-border/50">
          <table className="w-full text-sm" role="table">
            <thead>
              <tr className="bg-muted/30 border-b border-border/50">
                <th scope="col" className="text-left py-3 px-4 font-medium text-muted-foreground text-xs">Student</th>
                <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">Attended</th>
                <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">Completed</th>
                <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">Avg Score</th>
                <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">High / Low</th>
                <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">Percentile</th>
                <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">Trend</th>
                <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">Avg Time</th>
                <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">Violations</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.userId} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">{s.avatar}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm">{s.name}</span>
                    </div>
                  </td>
                  <td className="text-center py-3 px-4 text-sm">{s.quizzesAttended}</td>
                  <td className="text-center py-3 px-4 text-sm">{s.quizzesCompleted} <span className="text-muted-foreground text-xs">({s.completionPercent}%)</span></td>
                  <td className="text-center py-3 px-4 font-semibold text-sm">{s.averageScore}</td>
                  <td className="text-center py-3 px-4 text-xs">
                    <span className="text-success">{s.highestScore}</span>
                    <span className="text-muted-foreground mx-1">/</span>
                    <span className="text-destructive">{s.lowestScore}</span>
                  </td>
                  <td className="text-center py-3 px-4"><PercentileBadge pct={s.latestPercentile} /></td>
                  <td className="text-center py-3 px-4">
                    <div className="flex items-center justify-center gap-1">
                      <TrendIcon trend={s.improvementTrend} />
                      <span className={cn('text-xs', s.improvementTrend > 0 ? 'text-success' : s.improvementTrend < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                        {s.improvementTrend > 0 ? '+' : ''}{s.improvementTrend}
                      </span>
                    </div>
                  </td>
                  <td className="text-center py-3 px-4">
                    <span className="text-xs">
                      {s.averageAnswerTime}s
                    </span>
                  </td>
                  <td className="text-center py-3 px-4">
                    <span className={cn('text-xs', s.totalViolations > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                      {s.totalViolations}
                      {s.blockedCount > 0 && <Badge variant="destructive" className="ml-1 h-5 px-1 text-[10px]">{s.blockedCount}B</Badge>}
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
