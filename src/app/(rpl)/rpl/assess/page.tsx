'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NSQF_PACKS } from '@/lib/rpl/nsqf-packs';
import type { RPLAssessmentDoc } from '@/lib/rpl/types';

type AssessmentRow = Partial<RPLAssessmentDoc> & { id: string };

function packTitle(packId: string | undefined): string {
  if (!packId) return '—';
  return NSQF_PACKS.find((p) => p.id === packId)?.title ?? packId;
}

export default function RplAssessListPage() {
  // Authoritative page-level guard (commander-or-executive; the global (rpl)
  // layout guard also covers /rpl/assess* but this guard stays authoritative).
  const { user, isLoading } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter();

  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/');
      return;
    }
    if (user.role !== 'commander' && user.role !== 'executive') {
      router.replace('/');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (isLoading || !user) return;
    if (user.role !== 'commander' && user.role !== 'executive') return;
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
        const res = await fetch('/api/rpl/assess', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = (await res.json().catch(() => null)) as {
          assessments?: AssessmentRow[];
          error?: string;
        } | null;
        if (!res.ok || !body || !Array.isArray(body.assessments)) {
          if (!cancelled) {
            setError(typeof body?.error === 'string' ? body.error : 'Failed to load assessments.');
            setLoading(false);
          }
          return;
        }
        if (!cancelled) {
          setAssessments(body.assessments);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load assessments. Please check your connection.');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isLoading, auth]);

  const sorted = useMemo(() => {
    // Pending (draft) first, then submitted; newest first within each group.
    return [...assessments].sort((a, b) => {
      const aRank = a.status === 'draft' ? 0 : 1;
      const bRank = b.status === 'draft' ? 0 : 1;
      if (aRank !== bRank) return aRank - bRank;
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });
  }, [assessments]);

  if (isLoading || loading) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p className="text-sm text-muted-foreground">Loading assessments…</p>
      </main>
    );
  }
  const role = user?.role;
  if (!user || (role !== 'commander' && role !== 'executive')) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>Only commanders and executives can view assessments.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }
  const isExecutive = role === 'executive';

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Pending assessments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isExecutive
            ? 'All assessor queues. Draft assessments need scoring; submitted ones await review.'
            : 'Your assessor queue. Draft assessments need scoring; submitted ones await review.'}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {sorted.length === 0 && !error ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">No assessments in the queue yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-base font-medium text-foreground">
                    {a.workerName || 'Unknown worker'}
                    {a.referenceCode ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {a.referenceCode}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {packTitle(typeof a.packId === 'string' ? a.packId : undefined)}
                    {typeof a.packId === 'string' && a.packId ? (
                      <span className="ml-2 text-xs">({a.packId})</span>
                    ) : null}
                  </p>
                  {isExecutive && a.assessorId ? (
                    <p className="text-xs text-muted-foreground">Assessor: {a.assessorId}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge variant={a.status === 'draft' ? 'warning' : 'success'}>
                    {a.status === 'draft' ? 'draft' : 'submitted'}
                  </Badge>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/rpl/assess/${encodeURIComponent(a.id)}`}>Open scoring</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
