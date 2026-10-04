'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  Award,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Minus,
  RefreshCw,
  Scale,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { ActivityEvent, AdminOverview, AssessorLeaderboardRow, KappaAlert } from '@/lib/rpl/types';

type KappaTone = 'red' | 'amber' | 'green' | 'none';

// Agreement bands: red < 0.4 / amber < 0.6 / green >= 0.6.
function kappaTone(kappa: number | null): KappaTone {
  if (kappa === null) return 'none';
  if (kappa < 0.4) return 'red';
  if (kappa < 0.6) return 'amber';
  return 'green';
}

function kappaVar(tone: KappaTone): string {
  if (tone === 'red') return 'var(--destructive)';
  if (tone === 'amber') return 'var(--warning)';
  if (tone === 'green') return 'var(--success)';
  return 'var(--muted-foreground)';
}

function kappaBadgeVariant(tone: KappaTone): 'destructive' | 'warning' | 'success' | 'outline' {
  if (tone === 'red') return 'destructive';
  if (tone === 'amber') return 'warning';
  if (tone === 'green') return 'success';
  return 'outline';
}

function formatTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return '—';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleString();
}

function ActivityIcon({ type }: { type: ActivityEvent['type'] }) {
  if (type === 'declaration') return <FileText className="h-4 w-4 text-primary" />;
  if (type === 'assessment') return <ClipboardCheck className="h-4 w-4 text-primary" />;
  if (type === 'certification') return <Award className="h-4 w-4 text-primary" />;
  return <AlertTriangle className="h-4 w-4 text-destructive" />;
}

function TrendMark({ trend }: { trend: AssessorLeaderboardRow['trend'] }) {
  if (trend === 'improving') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
        <TrendingUp className="h-3.5 w-3.5" /> Improving
      </span>
    );
  }
  if (trend === 'declining') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
        <TrendingDown className="h-3.5 w-3.5" /> Declining
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <Minus className="h-3.5 w-3.5" /> Stable
    </span>
  );
}

export default function RplAdminPage() {
  // Authoritative page-level executive guard (the global (rpl) layout guard
  // exists in parallel; this guard stays authoritative).
  const { user, isLoading } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter();

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<KappaAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/');
      return;
    }
    if (user.role !== 'executive') {
      router.replace('/');
    }
  }, [user, isLoading, router]);

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setError('Not authenticated. Please sign in again.');
        return;
      }
      const res = await fetch('/api/rpl/admin/overview', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data: { error?: string } | null = await res.json().catch(() => null);
        setError(data?.error ?? 'Failed to load admin overview.');
        return;
      }
      const data = (await res.json()) as AdminOverview;
      setOverview(data);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    if (!user || user.role !== 'executive') return;
    fetchOverview();
  }, [user, fetchOverview]);

  const fetchAlerts = useCallback(async () => {
    try {
      setAlertsLoading(true);
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/rpl/alerts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json().catch(() => null)) as { alerts?: KappaAlert[] } | null;
      if (data && Array.isArray(data.alerts)) setAlerts(data.alerts);
    } catch {
      // Silent: alerts are advisory and must never break the overview.
    } finally {
      setAlertsLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    if (!user || user.role !== 'executive') return;
    fetchAlerts();
  }, [user, fetchAlerts]);

  if (isLoading || loading) {
    return (
      <main className="page-container animate-in space-y-6">
        {/* [SIH-RPL] Alerts section (P15) */}
        {alertsLoading ? (
          <Skeleton className="h-24 w-full" aria-label="Loading alerts" />
        ) : alerts.length > 0 ? (
          <section aria-label="Kappa alerts" className="space-y-3">
            {alerts.map((alert, i) => (
              <Card
                key={`${alert.packId}-${alert.createdAt}-${i}`}
                className={
                  alert.severity === 'critical'
                    ? 'border-destructive/50 bg-destructive/10'
                    : 'border-warning/50 bg-warning/10'
                }
              >
                <CardContent className="space-y-1 p-4">
                  <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {alert.severity === 'critical' ? 'Critical' : 'Warning'} ·{' '}
                    <span className="font-mono normal-case">{alert.packId}</span>
                  </p>
                  <p className="text-sm">{alert.message}</p>
                  <p className="text-xs text-muted-foreground">{alert.recommendedAction}</p>
                </CardContent>
              </Card>
            ))}
          </section>
        ) : null}
        <div className="space-y-1.5">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </main>
    );
  }

  if (!user || user.role !== 'executive') {
    return null;
  }

  if (error || !overview) {
    return (
      <main className="page-container animate-in space-y-6">
        {/* [SIH-RPL] Alerts section (P15) */}
        {alertsLoading ? (
          <Skeleton className="h-24 w-full" aria-label="Loading alerts" />
        ) : alerts.length > 0 ? (
          <section aria-label="Kappa alerts" className="space-y-3">
            {alerts.map((alert, i) => (
              <Card
                key={`${alert.packId}-${alert.createdAt}-${i}`}
                className={
                  alert.severity === 'critical'
                    ? 'border-destructive/50 bg-destructive/10'
                    : 'border-warning/50 bg-warning/10'
                }
              >
                <CardContent className="space-y-1 p-4">
                  <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {alert.severity === 'critical' ? 'Critical' : 'Warning'} ·{' '}
                    <span className="font-mono normal-case">{alert.packId}</span>
                  </p>
                  <p className="text-sm">{alert.message}</p>
                  <p className="text-xs text-muted-foreground">{alert.recommendedAction}</p>
                </CardContent>
              </Card>
            ))}
          </section>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Admin overview unavailable</CardTitle>
            <CardDescription>Could not load live RPL metrics.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-destructive">{error ?? 'No data yet.'}</p>
            <button
              type="button"
              onClick={fetchOverview}
              className="inline-flex items-center gap-2 rounded-[12px] border border-border/60 px-4 py-2 text-sm font-medium hover:bg-accent/30 transition-colors"
            >
              <RefreshCw className="h-4 w-4" /> Retry
            </button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const statCards = [
    { label: 'Total workers', value: String(overview.totalWorkers), icon: Users },
    { label: 'In progress', value: String(overview.assessmentsInProgress), icon: ClipboardList },
    { label: 'Completed', value: String(overview.assessmentsCompleted), icon: ClipboardCheck },
    {
      label: 'Avg kappa',
      value: overview.averageKappa === null ? '—' : overview.averageKappa.toFixed(3),
      icon: Scale,
    },
    { label: 'Certifications this month', value: String(overview.certificationsThisMonth), icon: Award },
  ];

  return (
    <main className="page-container animate-in space-y-6 safe-bottom">
      {/* [SIH-RPL] Alerts section (P15) — FIRST */}
      <section aria-label="Kappa alerts" aria-live="polite" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <AlertTriangle className="h-4 w-4 text-primary" /> Alerts
          </h2>
          {alertsLoading ? null : (
            <Badge variant={alerts.length > 0 ? 'warning' : 'outline'}>
              {alerts.length === 0 ? 'All clear' : `${alerts.length} active`}
            </Badge>
          )}
        </div>
        {alertsLoading ? (
          <Skeleton className="h-24 w-full" aria-label="Loading alerts" />
        ) : alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active kappa alerts.</p>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert, i) => (
              <Card
                key={`${alert.packId}-${alert.createdAt}-${i}`}
                className={
                  alert.severity === 'critical'
                    ? 'border-destructive/50 bg-destructive/10'
                    : 'border-warning/50 bg-warning/10'
                }
              >
                <CardContent className="space-y-1 p-4">
                  <p className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    <Badge variant={alert.severity === 'critical' ? 'destructive' : 'warning'}>
                      {alert.severity === 'critical' ? 'Critical' : 'Warning'}
                    </Badge>
                    <span className="font-mono normal-case text-muted-foreground">
                      {alert.packId}
                      {alert.assessorId ? ` · ${alert.assessorId}` : ''}
                    </span>
                  </p>
                  <p className="text-sm">{alert.message}</p>
                  <p className="text-xs text-muted-foreground">{alert.recommendedAction}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-page-title font-headline tracking-tight">RPL Admin Overview</h1>
          <p className="text-base text-muted-foreground">
            Live worker, assessment, agreement and assessor metrics.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchOverview}
          className="inline-flex items-center gap-2 rounded-[12px] border border-border/60 px-4 py-2 text-sm font-medium hover:bg-accent/30 transition-colors"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* (1) Overview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" aria-live="polite" aria-label="RPL statistics">
        {statCards.map((stat) => (
          <Card key={stat.label} className="group/card card-hover shadow-elevation-small hover:shadow-elevation-medium">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-2xl font-bold tabular-nums">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
                <div className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 bg-primary/10 group-hover/card:bg-primary/15 transition-colors">
                  <stat.icon className="w-5 h-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* (2) Pack performance (div-built table; no table component) */}
      <Card className="card-hover">
        <CardHeader className="border-b border-border/30 pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" /> Pack performance
          </CardTitle>
          <CardDescription>
            Workers assessed, average score and inter-assessor agreement per NSQF pack
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {overview.packs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No packs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1.6fr_auto] gap-3 px-3 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <span>Pack</span>
                  <span>NSQF level</span>
                  <span>Workers</span>
                  <span>Avg score</span>
                  <span>Agreement</span>
                  <span className="text-right">Report</span>
                </div>
                <Separator />
                {overview.packs.map((pack) => {
                  const tone = kappaTone(pack.kappa);
                  return (
                    <div
                      key={pack.packId}
                      className="grid grid-cols-[2fr_1fr_1fr_1fr_1.6fr_auto] items-center gap-3 px-3 py-3 border-b border-border/20 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{pack.title}</p>
                        <p className="text-xs font-mono text-muted-foreground">{pack.packId}</p>
                      </div>
                      <span className="text-sm">Level {pack.nsqfLevel}</span>
                      <span className="text-sm font-semibold tabular-nums">{pack.workersAssessed}</span>
                      <span className="text-sm tabular-nums">{pack.avgScore.toFixed(2)}</span>
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: kappaVar(tone) }}
                        />
                        <span className="text-sm font-semibold tabular-nums">
                          {pack.kappa === null ? '—' : pack.kappa.toFixed(3)}
                        </span>
                        <Badge variant={kappaBadgeVariant(tone)}>{pack.interpretation}</Badge>
                      </span>
                      <Link
                        href={`/rpl/consistency/${encodeURIComponent(pack.packId)}`}
                        className="text-sm text-primary hover:underline justify-self-end"
                      >
                        View
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* (3) Recent activity feed */}
        <Card className="card-hover">
          <CardHeader className="border-b border-border/30 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" /> Recent activity
            </CardTitle>
            <CardDescription>Latest declarations, submissions, certifications and kappa alerts</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {overview.recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity yet.</p>
            ) : (
              <div className="space-y-0 max-h-[360px] overflow-y-auto -mx-1 px-1">
                {overview.recentActivity.map((event, i) => (
                  <div
                    key={`${event.type}-${event.at}-${i}`}
                    className="flex items-start gap-3 py-2.5 border-b border-border/20 last:border-0 -mx-1 px-1 rounded-[8px]"
                  >
                    <div className="shrink-0 w-8 h-8 rounded-[10px] bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                      <ActivityIcon type={event.type} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{event.message}</p>
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        {formatTime(event.at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* (4) Assessor consistency leaderboard */}
        <Card className="card-hover">
          <CardHeader className="border-b border-border/30 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Assessor consistency
            </CardTitle>
            <CardDescription>Assessments completed and mean pair agreement per assessor</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {overview.assessors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No assessor activity yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[420px]">
                  <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 px-3 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <span>Assessor</span>
                    <span>Assessments</span>
                    <span>Avg agreement</span>
                    <span>Trend</span>
                  </div>
                  <Separator />
                  {overview.assessors.map((row) => (
                    <div
                      key={row.assessorId}
                      className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center gap-3 px-3 py-2.5 border-b border-border/20 last:border-0"
                    >
                      <span className="text-sm font-medium font-mono truncate">{row.assessorId}</span>
                      <span className="text-sm font-semibold tabular-nums">{row.assessments}</span>
                      <span className="text-sm tabular-nums">
                        {row.avgAgreement === null ? '—' : row.avgAgreement.toFixed(3)}
                      </span>
                      <TrendMark trend={row.trend} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
