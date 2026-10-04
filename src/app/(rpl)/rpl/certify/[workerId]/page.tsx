'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { NSQF_PACKS } from '@/lib/rpl/nsqf-packs';
import type {
  CompetencyProfile,
  RPLCertificationDoc,
  RPLCertificationRecommendation,
  UnitMastery,
} from '@/lib/rpl/types';

interface ProfileResponse {
  profile: CompetencyProfile;
  recommendation: RPLCertificationRecommendation & { requiresHumanSignoff?: boolean };
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

function draftLabel(status: RPLCertificationRecommendation['status']): string {
  if (status === 'recommend_certification') return 'Draft: recommend certification';
  if (status === 'recommend_gap_training') return 'Draft: recommend gap training';
  if (status === 'recommend_reassessment') return 'Draft: recommend reassessment';
  return 'Draft: pending human sign-off';
}

export default function RplCertifyPage() {
  // Dynamic-route params mirror src/app/(rpl)/rpl/assess/[assessmentId]/page.tsx.
  const params = useParams<{ workerId: string }>();
  const workerId = params.workerId;
  // Authoritative page-level guard: EXECUTIVE ONLY (the global (rpl) layout
  // guard also covers /rpl/certify* but this guard stays authoritative).
  const { user, isLoading } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter();

  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assessorNotes, setAssessorNotes] = useState('');
  const [submitting, setSubmitting] = useState<'idle' | 'certify' | 'reassess'>('idle');
  const [result, setResult] = useState<RPLCertificationDoc | null>(null);

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

  useEffect(() => {
    if (isLoading || !user || user.role !== 'executive' || !workerId) return;
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
          setData({ profile: body.profile, recommendation: body.recommendation });
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

  async function submitDecision(decision: 'certify' | 'reassess') {
    if (!data) return;
    setError(null);
    setResult(null);
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    if (!token) {
      setError('You are not signed in. Please sign in again.');
      return;
    }
    setSubmitting(decision);
    try {
      const res = await fetch('/api/rpl/certify', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerId,
          packId: data.profile.packId,
          assessorNotes: assessorNotes.trim(),
          decision,
        }),
      });
      const body = (await res.json().catch(() => null)) as (Partial<RPLCertificationDoc> & {
        error?: string;
      }) | null;
      if (!res.ok || !body || typeof body.status !== 'string') {
        setError(typeof body?.error === 'string' ? body.error : 'Certification request failed.');
        return;
      }
      setResult(body as RPLCertificationDoc);
    } catch {
      setError('Certification request failed. Please check your connection.');
    } finally {
      setSubmitting('idle');
    }
  }

  if (isLoading || loading) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p className="text-sm text-muted-foreground">Loading certification review…</p>
      </main>
    );
  }

  if (!user || user.role !== 'executive') {
    return null;
  }

  if (error && !data) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Certification review unavailable</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-muted-foreground">No profile yet.</p>
      </main>
    );
  }

  const { profile, recommendation } = data;
  const pack = NSQF_PACKS.find((p) => p.id === profile.packId);
  const unitEntries = Object.entries(profile.unitScores ?? {});
  const gapTraining = Array.isArray(recommendation.requiredGapTraining)
    ? recommendation.requiredGapTraining
    : [];

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Certification review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Worker {profile.workerId} · {pack ? `${pack.title} (NSQF Level ${pack.nsqfLevel})` : profile.packId}
          {' '}· Overall {profile.overallScore ?? 0}/100
          {typeof profile.nsqfLevelRecommended === 'number'
            ? ` · Recommended level ${profile.nsqfLevelRecommended}`
            : null}
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Full competency profile</CardTitle>
          <CardDescription>Recomputed server-side at signing time</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {unitEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unit scores yet.</p>
          ) : (
            <ul className="space-y-2">
              {unitEntries.map(([unitId, u]) => (
                <li
                  key={unitId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-input px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{u.unitName ?? unitId}</p>
                    {Array.isArray(u.knowledgeGaps) && u.knowledgeGaps.length > 0 ? (
                      <p className="truncate text-xs text-muted-foreground">
                        Gaps: {u.knowledgeGaps.join('; ')}
                      </p>
                    ) : null}
                  </div>
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{u.score}/100</span>
                    <Badge variant={unitBadgeVariant(u.status)}>{unitBadgeLabel(u.status)}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-warning/50">
        <CardHeader>
          <CardTitle>Draft recommendation</CardTitle>
          <CardDescription>{draftLabel(recommendation.status)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Badge variant="warning">Awaiting assessor sign-off</Badge>
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

      <Card>
        <CardHeader>
          <CardTitle>Assessor notes</CardTitle>
          <CardDescription>Recorded on the signed certification (max 2000 chars).</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={assessorNotes}
            maxLength={2000}
            placeholder="Assessment summary, conditions, caveats…"
            onChange={(e) => setAssessorNotes(e.target.value)}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button disabled={submitting !== 'idle'} onClick={() => submitDecision('certify')}>
          {submitting === 'certify' ? 'Signing…' : 'Issue Certification Recommendation'}
        </Button>
        <Button
          variant="outline"
          disabled={submitting !== 'idle'}
          onClick={() => submitDecision('reassess')}
        >
          {submitting === 'reassess' ? 'Requesting…' : 'Request Reassessment'}
        </Button>
      </div>

      {result ? (
        <Card className="border-success/50">
          <CardHeader>
            <CardTitle>Signed recommendation recorded</CardTitle>
            <CardDescription>
              Status {result.status} · Level {result.recommendedLevel ?? '—'} · Signed{' '}
              {typeof result.signedAt === 'number' ? new Date(result.signedAt).toLocaleString() : '—'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {result.rationale ? <p className="text-sm text-foreground">{result.rationale}</p> : null}
            {Array.isArray(result.requiredGapTraining) && result.requiredGapTraining.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5">
                {result.requiredGapTraining.map((g) => (
                  <li key={g} className="text-sm text-foreground">
                    {g}
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
