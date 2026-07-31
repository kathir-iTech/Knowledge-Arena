'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BrainCircuit, ShieldAlert, Clock, CheckCircle2, XCircle, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
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
} from './charts';

const PIE_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4'];

interface SystemInsights {
  ai: {
    total: number;
    success: number;
    failures: number;
    successRate: number;
    avgDurationMs: number;
    totalQuestionsGenerated: number;
    modelBreakdown: { model: string; total: number; success: number; successRate: number }[];
    dailyActivity: { date: string; generated: number; failed: number }[];
  };
  security: {
    total: number;
    violations: number;
    authFailures: number;
    suspicious: number;
    rateLimited: number;
    eventBreakdown: { event: string; count: number }[];
  };
  windowDays: number;
}

const eventLabels: Record<string, string> = {
  login_success: 'Login Success',
  login_failed: 'Login Failed',
  logout: 'Logout',
  invalid_token: 'Invalid Token',
  unauthorized_access: 'Unauthorized Access',
  session_replaced: 'Session Replaced',
  duplicate_session: 'Duplicate Session',
  suspicious_reconnect: 'Suspicious Reconnect',
  battle_join_denied: 'Join Denied',
  rate_limited: 'Rate Limited',
  security_violation: 'Violation',
};

function formatDuration(ms: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function SystemInsightsSection({ getToken }: { getToken?: () => Promise<string | null> }) {
  const [insights, setInsights] = useState<SystemInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = getToken ? await getToken() : null;
        const res = await fetch('/api/executive/insights', {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error('Failed to load insights');
        const data = await res.json();
        if (!cancelled) setInsights(data);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load insights');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [getToken]);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">System Insights</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !insights) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">System Insights</CardTitle></CardHeader>
        <CardContent className="text-center py-10 text-muted-foreground text-sm">
          {error || 'No insight data available.'}
        </CardContent>
      </Card>
    );
  }

  const { ai, security } = insights;

  const topEvents = security.eventBreakdown.slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BrainCircuit className="w-4 h-4" aria-hidden="true" />
              AI Generation ({insights.windowDays}d)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <InsightStat icon={CheckCircle2} label="Generations" value={ai.total} />
              <InsightStat icon={Gauge} label="Success Rate" value={`${ai.successRate}%`} />
              <InsightStat icon={XCircle} label="Failures" value={ai.failures} accent={ai.failures > 0 ? 'text-destructive' : ''} />
              <InsightStat icon={Clock} label="Avg Duration" value={formatDuration(ai.avgDurationMs)} />
            </div>

            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                Questions Generated: <span className="font-medium text-foreground">{ai.totalQuestionsGenerated}</span>
              </p>
              {ai.modelBreakdown.length > 0 ? (
                <div className="overflow-x-auto rounded-[12px] border border-border/50">
                  <table className="w-full text-sm" role="table">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border/50">
                        <th scope="col" className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Model</th>
                        <th scope="col" className="text-center py-2 px-3 font-medium text-muted-foreground text-xs">Requests</th>
                        <th scope="col" className="text-center py-2 px-3 font-medium text-muted-foreground text-xs">Success</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ai.modelBreakdown.map(m => (
                        <tr key={m.model} className="border-b border-border/30 last:border-0">
                          <td className="py-2 px-3 font-mono text-xs">{m.model}</td>
                          <td className="py-2 px-3 text-center">{m.total}</td>
                          <td className="py-2 px-3 text-center">
                            <Badge variant="outline" className={cn('text-[10px] font-normal border-0', m.successRate >= 90 ? 'bg-success/10 text-success' : m.successRate >= 50 ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive')}>
                              {m.successRate}%
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No AI activity in this window.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" aria-hidden="true" />
              Security Events ({insights.windowDays}d)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <InsightStat icon={ShieldAlert} label="Total Events" value={security.total} />
              <InsightStat icon={ShieldAlert} label="Violations" value={security.violations} accent={security.violations > 0 ? 'text-destructive' : ''} />
              <InsightStat icon={ShieldAlert} label="Auth Failures" value={security.authFailures} accent={security.authFailures > 0 ? 'text-warning' : ''} />
              <InsightStat icon={ShieldAlert} label="Suspicious" value={security.suspicious} accent={security.suspicious > 0 ? 'text-warning' : ''} />
            </div>

            {topEvents.length > 0 ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={topEvents} dataKey="count" nameKey="event" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }: any) => `${eventLabels[name] || name} ${((percent || 0) * 100).toFixed(0)}%`} labelLine={false}>
                      {topEvents.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value: any, name: any) => [value, eventLabels[name as string] || name]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No security events in this window.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {ai.dailyActivity.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BrainCircuit className="w-4 h-4" aria-hidden="true" />
              AI Activity by Day
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ai.dailyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="generated" name="Generated" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="failed" name="Failed" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InsightStat({ icon: Icon, label, value, accent = '' }: { icon: React.ElementType; label: string; value: number | string; accent?: string }) {
  return (
    <div className="bg-muted/30 rounded-[12px] px-3 py-3">
      <Icon className={cn('w-4 h-4 text-muted-foreground mb-1.5', accent)} aria-hidden="true" />
      <p className={cn('text-xl font-semibold leading-tight', accent)}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
