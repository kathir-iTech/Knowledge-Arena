'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NSQF_PACKS } from '@/lib/rpl/nsqf-packs';
import type {
  CompetencyProfile,
  EvidenceImageDoc,
  RPLCertificationRecommendation,
  UnitMastery,
} from '@/lib/rpl/types';

interface RadarUnit {
  id: string;
  name: string;
  score: number;
}

interface ProfileResponse {
  profile: CompetencyProfile;
  recommendation: RPLCertificationRecommendation & { requiresHumanSignoff?: boolean };
  evidence: EvidenceImageDoc[];
}

function unitBadgeVariant(status: UnitMastery): 'success' | 'warning' | 'destructive' {
  if (status === 'competent') return 'success';
  if (status === 'partial') return 'warning';
  return 'destructive';
}

function unitBadgeLabel(status: UnitMastery): string {
  if (status === 'competent') return 'Competent';
  if (status === 'partial') return 'Partially';
  return 'Not Yet';
}

function recommendationLabel(status: RPLCertificationRecommendation['status']): string {
  if (status === 'recommend_certification') return 'Eligible for certification (draft)';
  if (status === 'recommend_gap_training') return 'Gap training recommended (draft)';
  if (status === 'recommend_reassessment') return 'Reassessment recommended (draft)';
  return 'Pending human sign-off (draft)';
}

// Hand-rolled SVG radar polygon (no chart library). One axis per unit — works
// for any unit count >= 1. Concentric N-gon grid rings at 25/50/75/100, axis
// spokes, the score polygon, and a dot on each score vertex.
function RadarChart({ units }: { units: RadarUnit[] }) {
  const size = 340;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 110;
  const labelRadius = 148;
  const n = units.length;
  if (n === 0) {
    return <p className="text-sm text-muted-foreground">No units to chart yet.</p>;
  }
  const angleFor = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const point = (r: number, i: number): [number, number] => {
    const a = angleFor(i);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const ringPoints = (level: number) =>
    units
      .map((_, i) => {
        const [x, y] = point((radius * level) / 100, i);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  const scorePoints = units
    .map((u, i) => {
      const clamped = Math.max(0, Math.min(100, u.score));
      const [x, y] = point((radius * clamped) / 100, i);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Competency radar chart across ${n} units`}
      className="max-w-full"
    >
      {[25, 50, 75, 100].map((level) => (
        <polygon
          key={level}
          points={ringPoints(level)}
          fill="none"
          stroke="var(--border)"
          strokeWidth={level === 100 ? 1.5 : 1}
        />
      ))}
      {units.map((u, i) => {
        const [ex, ey] = point(radius, i);
        return <line key={`spoke-${u.id}`} x1={cx} y1={cy} x2={ex} y2={ey} stroke="var(--border)" />;
      })}
      <text x={cx + 4} y={cy - radius - 4} fontSize="9" fill="var(--muted-foreground)">
        100
      </text>
      <polygon
        points={scorePoints}
        fill="var(--primary)"
        fillOpacity={0.25}
        stroke="var(--primary)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {units.map((u, i) => {
        const clamped = Math.max(0, Math.min(100, u.score));
        const [dx, dy] = point((radius * clamped) / 100, i);
        return <circle key={`dot-${u.id}`} cx={dx} cy={dy} r={4} fill="var(--primary)" />;
      })}
      {units.map((u, i) => {
        const [lx, ly] = point(labelRadius, i);
        const short = u.name.length > 20 ? `${u.name.slice(0, 20)}…` : u.name;
        return (
          <g key={`label-${u.id}`}>
            <title>{`${u.name}: ${u.score}/100`}</title>
            <text x={lx} y={ly} textAnchor="middle" fontSize="11" fill="var(--foreground)">
              {short}
            </text>
            <text x={lx} y={ly + 13} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">
              {u.score}/100
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function RplProfilePage() {
  // Dynamic-route params mirror src/app/(rpl)/rpl/assess/[assessmentId]/page.tsx.
  const params = useParams<{ workerId: string }>();
  const workerId = params.workerId;
  // Authoritative page-level guard (worker-own / commander / executive; the
  // global (rpl) layout guard also covers /rpl/profile* for signed-in users
  // but this guard stays authoritative).
  const { user, isLoading } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter();

  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/');
      return;
    }
    const privileged = user.role === 'commander' || user.role === 'executive';
    if (!privileged && user.id !== workerId) {
      router.replace('/');
    }
  }, [user, isLoading, router, workerId]);

  useEffect(() => {
    if (isLoading || !user || !workerId) return;
    const privileged = user.role === 'commander' || user.role === 'executive';
    if (!privileged && user.id !== workerId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const token = await auth.currentUser?.getIdToken().catch(() => null);
        if (!token) {
          if (!cancelled) {
            setError('You are not signed in. Please sign in again.');
            setLoading(false);
          }
          return;
        }
        const res = await fetch(`/api/rpl/profile/${encodeURIComponent(workerId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = (await res.json().catch(() => null)) as (ProfileResponse & {
          error?: string;
        }) | null;
        if (!res.ok || !body?.profile) {
          if (!cancelled) {
            setError(typeof body?.error === 'string' ? body.error : 'Failed to load profile.');
            setLoading(false);
          }
          return;
        }
        if (!cancelled) {
          setData({ profile: body.profile, recommendation: body.recommendation, evidence: body.evidence ?? [] });
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load profile. Please check your connection.');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isLoading, auth, workerId]);

  if (isLoading || loading) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p className="text-sm text-muted-foreground">Loading competency profile…</p>
      </main>
    );
  }

  const privileged = user && (user.role === 'commander' || user.role === 'executive');
  if (!user || (!privileged && user.id !== workerId)) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>You can only view your own competency profile.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile unavailable</CardTitle>
            <CardDescription>{error ?? 'This profile could not be loaded.'}</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const { profile, recommendation } = data;
  const pack = NSQF_PACKS.find((p) => p.id === profile.packId);
  const unitEntries = Object.entries(profile.unitScores ?? {});
  const radarUnits: RadarUnit[] = unitEntries.map(([unitId, u]) => ({
    id: unitId,
    name: u.unitName ?? unitId,
    score: u.score,
  }));
  const gapTraining = Array.isArray(recommendation.requiredGapTraining)
    ? recommendation.requiredGapTraining
    : [];

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <style>{`@media print {
  .rpl-no-print { display: none !important; }
  nav, header, aside, [role="navigation"] { display: none !important; }
  main { padding: 0 !important; }
}`}</style>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Competency profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Worker {profile.workerId} · {pack ? `${pack.title} (NSQF Level ${pack.nsqfLevel})` : profile.packId}
            {typeof profile.nsqfLevelRecommended === 'number'
              ? ` · Recommended level ${profile.nsqfLevelRecommended}`
              : null}
          </p>
        </div>
        <Button className="rpl-no-print" variant="outline" onClick={() => window.print()}>
          Print / Export PDF
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overall competency</CardTitle>
          <CardDescription>Mean of unit scores across the pack</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-2">
          <span className="text-4xl font-bold text-primary">{profile.overallScore ?? 0}/100</span>
          <RadarChart units={radarUnits} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Unit breakdown</CardTitle>
          <CardDescription>Competent ≥ 75 · Partially 50–74 · Not Yet &lt; 50</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {unitEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unit scores yet.</p>
          ) : (
            <ul className="space-y-3">
              {unitEntries.map(([unitId, u]) => (
                <li key={unitId} className="rounded-[12px] border border-input p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{u.unitName ?? unitId}</p>
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{u.score}/100</span>
                      <Badge variant={unitBadgeVariant(u.status)}>{unitBadgeLabel(u.status)}</Badge>
                    </span>
                  </div>
                  {Array.isArray(u.knowledgeGaps) && u.knowledgeGaps.length > 0 ? (
                    <div className="mt-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Knowledge gaps
                      </p>
                      <ul className="mt-1 list-disc space-y-1 pl-5">
                        {u.knowledgeGaps.map((gap) => (
                          <li key={gap} className="text-sm text-muted-foreground">
                            {gap}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">No knowledge gaps.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Work evidence</CardTitle>
          <CardDescription>Site photos grouped by competency unit</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(data.evidence ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No work evidence uploaded yet.</p>
          ) : (
            Object.entries(
              (data.evidence ?? []).reduce<Record<string, EvidenceImageDoc[]>>((acc, ev) => {
                const key = ev.unitId || 'unassigned';
                (acc[key] ??= []).push(ev);
                return acc;
              }, {}),
            ).map(([unitId, imgs]) => (
              <div key={unitId} className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {profile.unitScores?.[unitId]?.unitName ?? unitId} · {imgs.length} image
                  {imgs.length === 1 ? '' : 's'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {imgs.map((ev) => (
                    <img
                      key={ev.imageId}
                      src={ev.dataUrl}
                      alt={`Evidence for ${unitId}`}
                      className="h-20 w-20 rounded-md border border-input object-cover"
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-warning/50">
        <CardHeader>
          <CardTitle>Certification recommendation (draft)</CardTitle>
          <CardDescription>{recommendationLabel(recommendation.status)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Badge variant="warning">Awaiting assessor sign-off</Badge>
            <p className="mt-2 text-sm text-muted-foreground">
              This recommendation is advisory only. No certificate has been issued — final
              certification requires executive sign-off.
            </p>
          </div>
          {recommendation.rationale ? (
            <p className="text-sm text-foreground">{recommendation.rationale}</p>
          ) : null}
          {gapTraining.length > 0 ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Required gap training
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {gapTraining.map((g) => (
                  <li key={g} className="text-sm text-foreground">
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
