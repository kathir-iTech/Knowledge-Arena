'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ConsistencyReport } from '@/lib/rpl/types';
import { computeKappaImprovement } from '@/lib/rpl/kappa';

interface HistoryEntry {
  at: number;
  kappa: number;
}

type ReportWithHistory = ConsistencyReport & { history?: HistoryEntry[] };

function cellFill(kappa: number): string {
  if (kappa < 0.2) return 'var(--destructive)';
  if (kappa < 0.6) return 'var(--accent)';
  return 'var(--success)';
}

function badgeVariantFor(kappa: number): 'destructive' | 'warning' | 'success' | 'default' {
  if (kappa < 0.2) return 'destructive';
  if (kappa < 0.6) return 'warning';
  if (kappa >= 0.8) return 'success';
  return 'default';
}

export default function RplConsistencyPage() {
  const params = useParams<{ packId: string }>();
  const packId = (() => { try { return decodeURIComponent(params.packId); } catch { return params.packId; } })();
  const { user, isLoading } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter();

  const [report, setReport] = useState<ReportWithHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | 'name'>('desc');

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/');
      return;
    }
    if (user.role !== 'executive') {
      router.replace('/');
      return;
    }
  }, [user, isLoading, router]);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setError('Not authenticated.');
        return;
      }
      const res = await fetch(`/api/rpl/consistency/${encodeURIComponent(packId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to load consistency report.');
        return;
      }
      const data = (await res.json()) as ReportWithHistory;
      setReport(data);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [auth, packId]);

  useEffect(() => {
    if (!user || user.role !== 'executive') return;
    if (!packId) return;
    fetchReport();
  }, [user, packId, fetchReport]);

  const assessors = useMemo(() => {
    if (!report) return [];
    const set = new Set<string>();
    for (const p of report.assessorPairs) {
      set.add(p.assessorA);
      set.add(p.assessorB);
    }
    return [...set].sort();
  }, [report]);

  const pairLookup = useMemo(() => {
    const m = new Map<string, number>();
    if (!report) return m;
    for (const p of report.assessorPairs) {
      m.set(`${p.assessorA}::${p.assessorB}`, p.kappa);
      m.set(`${p.assessorB}::${p.assessorA}`, p.kappa);
    }
    return m;
  }, [report]);

  const sortedCriteria = useMemo(() => {
    if (!report) return [];
    const rows = [...report.perCriterion];
    if (sortOrder === 'asc') rows.sort((a, b) => a.kappa - b.kappa);
    else if (sortOrder === 'desc') rows.sort((a, b) => b.kappa - a.kappa);
    else rows.sort((a, b) => a.criterionId.localeCompare(b.criterionId));
    return rows;
  }, [report, sortOrder]);

  const history: HistoryEntry[] = useMemo(() => {
    if (!report?.history || !Array.isArray(report.history)) return [];
    return report.history.filter((h) => typeof h?.at === 'number' && typeof h?.kappa === 'number');
  }, [report]);

  if (isLoading || loading) {
    return (
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <p className="text-sm text-muted-foreground">Loading consistency report…</p>
      </main>
    );
  }

  if (!user || user.role !== 'executive') {
    return null;
  }

  if (error) {
    return (
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Consistency report unavailable</CardTitle>
            <CardDescription>Pack {packId}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button onClick={fetchReport}>Retry</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <p className="text-sm text-muted-foreground">No report yet.</p>
      </main>
    );
  }

  const needsCalibration = report.overallKappa < 0.2;
  const improvement =
    report.unassistedKappa !== null && report.assistedKappa !== null
      ? computeKappaImprovement(report.unassistedKappa, report.assistedKappa)
      : null;

  const cellSize = 72;
  const labelWidth = 140;
  const labelHeight = 40;
  const gridWidth = labelWidth + assessors.length * cellSize;
  const gridHeight = labelHeight + assessors.length * cellSize;

  const trendWidth = 480;
  const trendHeight = 140;
  const trendPadding = 16;
  const trendPoints =
    history.length > 1
      ? history
          .map((h, i) => {
            const x =
              history.length === 1
                ? trendWidth / 2
                : trendPadding + (i / (history.length - 1)) * (trendWidth - trendPadding * 2);
            const clamped = Math.max(-1, Math.min(1, h.kappa));
            const y =
              trendPadding + ((1 - clamped) / 2) * (trendHeight - trendPadding * 2);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ')
      : '';

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-primary">Inter-assessor consistency</h1>
        <p className="text-sm text-muted-foreground">Pack {report.packId} · {report.assessmentCount} submitted assessments</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overall agreement</CardTitle>
          <CardDescription>
            Linear-weighted Cohen&apos;s kappa across pooled item scores (categories 1–4)
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <span className="text-4xl font-bold text-primary">{report.overallKappa.toFixed(3)}</span>
          <Badge variant={badgeVariantFor(report.overallKappa)}>{report.interpretation}</Badge>
          <span className="text-sm text-muted-foreground">
            95% CI [{report.confidence[0].toFixed(3)}, {report.confidence[1].toFixed(3)}]
          </span>
          <Button variant="outline" size="sm" onClick={fetchReport}>
            Refresh
          </Button>
        </CardContent>
      </Card>

      {needsCalibration && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">Assessor calibration session recommended</CardTitle>
            <CardDescription>
              Overall kappa {report.overallKappa.toFixed(3)} is below 0.2 (Poor). Schedule a calibration
              session and re-assess before certification.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle>Unassisted baseline vs AI-assisted</CardTitle>
          <CardDescription>
            Pairs where both assessments avoided AI suggestions vs both used them. Mixed pairs count
            only toward the overall kappa.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-[12px] border border-border/60 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Unassisted baseline</p>
            <p className="text-2xl font-bold text-primary">
              {report.unassistedKappa === null ? '—' : report.unassistedKappa.toFixed(3)}
            </p>
          </div>
          <div className="rounded-[12px] border border-accent/50 bg-accent/10 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">AI-assisted</p>
            <p className="text-2xl font-bold text-primary">
              {report.assistedKappa === null ? '—' : report.assistedKappa.toFixed(3)}
            </p>
          </div>
          <div className="rounded-[12px] border border-border/60 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Improvement</p>
            <p className="text-2xl font-bold text-success">
              {improvement === null ? '—' : `${improvement.improvementPct.toFixed(1)}%`}
            </p>
            {improvement !== null && (
              <p className="text-xs text-muted-foreground">
                {improvement.isSignificant ? 'Significant (> 0.1 gain)' : 'Not significant (≤ 0.1 gain)'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assessor-pair agreement</CardTitle>
          <CardDescription>Hand-rolled heatmap · red &lt; 0.2 · gold &lt; 0.6 · green ≥ 0.6</CardDescription>
        </CardHeader>
        <CardContent>
          {assessors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assessor pairs with overlapping items yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <svg
                width={gridWidth}
                height={gridHeight}
                role="img"
                aria-label="Assessor pair kappa heatmap"
              >
                {assessors.map((id, col) => (
                  <text
                    key={`col-${id}`}
                    x={labelWidth + col * cellSize + cellSize / 2}
                    y={labelHeight - 8}
                    textAnchor="middle"
                    fontSize="11"
                    fill="var(--muted-foreground)"
                  >
                    {id.length > 10 ? `${id.slice(0, 10)}…` : id}
                  </text>
                ))}
                {assessors.map((rowId, row) => (
                  <g key={`row-${rowId}`}>
                    <text
                      x={labelWidth - 8}
                      y={labelHeight + row * cellSize + cellSize / 2 + 4}
                      textAnchor="end"
                      fontSize="11"
                      fill="var(--muted-foreground)"
                    >
                      {rowId.length > 16 ? `${rowId.slice(0, 16)}…` : rowId}
                    </text>
                    {assessors.map((colId, col) => {
                      const isDiag = rowId === colId;
                      const kappa = isDiag ? 1 : pairLookup.get(`${rowId}::${colId}`);
                      const x = labelWidth + col * cellSize;
                      const y = labelHeight + row * cellSize;
                      if (isDiag || kappa === undefined) {
                        return (
                          <g key={`${rowId}-${colId}`}>
                            <rect
                              x={x + 2}
                              y={y + 2}
                              width={cellSize - 4}
                              height={cellSize - 4}
                              rx={10}
                              fill="var(--muted)"
                              fillOpacity={0.35}
                            />
                            <text
                              x={x + cellSize / 2}
                              y={y + cellSize / 2 + 4}
                              textAnchor="middle"
                              fontSize="12"
                              fill="var(--muted-foreground)"
                            >
                              {isDiag ? '—' : 'n/a'}
                            </text>
                          </g>
                        );
                      }
                      return (
                        <g key={`${rowId}-${colId}`}>
                          <rect
                            x={x + 2}
                            y={y + 2}
                            width={cellSize - 4}
                            height={cellSize - 4}
                            rx={10}
                            fill={cellFill(kappa)}
                            fillOpacity={0.28}
                            stroke={cellFill(kappa)}
                            strokeOpacity={0.7}
                          />
                          <text
                            x={x + cellSize / 2}
                            y={y + cellSize / 2 + 4}
                            textAnchor="middle"
                            fontSize="12"
                            fontWeight={700}
                            fill="var(--foreground)"
                          >
                            {kappa.toFixed(2)}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                ))}
              </svg>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-criterion agreement</CardTitle>
          <CardDescription>Same itemId pooled across assessor pairs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Sort</span>
            <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as typeof sortOrder)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sort criteria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Highest first</SelectItem>
                <SelectItem value="asc">Lowest first</SelectItem>
                <SelectItem value="name">By criterion id</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {sortedCriteria.length === 0 ? (
            <p className="text-sm text-muted-foreground">No per-criterion overlap yet.</p>
          ) : (
            <ul className="space-y-2">
              {sortedCriteria.map((c) => (
                <li
                  key={c.criterionId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-border/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.criterionId}</p>
                    {'criterionText' in c && c.criterionText ? (
                      <p className="truncate text-xs text-muted-foreground">{c.criterionText}</p>
                    ) : null}
                  </div>
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{c.kappa.toFixed(3)}</span>
                    <Badge variant={badgeVariantFor(c.kappa)}>
                      {c.kappa < 0.2 ? 'Poor' : c.kappa < 0.4 ? 'Fair' : c.kappa < 0.6 ? 'Moderate' : c.kappa < 0.8 ? 'Substantial' : 'Almost perfect'}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {history.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Agreement trend</CardTitle>
            <CardDescription>{history.length} snapshots (capped at 20)</CardDescription>
          </CardHeader>
          <CardContent>
            <svg
              width={trendWidth}
              height={trendHeight}
              role="img"
              aria-label="Kappa trend over time"
              className="max-w-full"
            >
              <line
                x1={trendPadding}
                x2={trendWidth - trendPadding}
                y1={trendHeight / 2}
                y2={trendHeight / 2}
                stroke="var(--border)"
                strokeDasharray="4 4"
              />
              <polyline
                points={trendPoints}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {history.map((h, i) => {
                const x =
                  trendPadding + (i / (history.length - 1)) * (trendWidth - trendPadding * 2);
                const clamped = Math.max(-1, Math.min(1, h.kappa));
                const y =
                  trendPadding + ((1 - clamped) / 2) * (trendHeight - trendPadding * 2);
                return (
                  <g key={`${h.at}-${i}`}>
                    <circle cx={x} cy={y} r={4} fill="var(--accent)" stroke="var(--primary)" />
                    <text x={x} y={trendHeight - 2} textAnchor="middle" fontSize="9" fill="var(--muted-foreground)">
                      {new Date(h.at).toLocaleDateString()}
                    </text>
                  </g>
                );
              })}
            </svg>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
