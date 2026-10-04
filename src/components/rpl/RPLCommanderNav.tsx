'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { RPLAssessmentDoc } from '@/lib/rpl/types';

type AssessmentRow = Partial<RPLAssessmentDoc> & { id: string };

interface MyConsistencyPack {
  packId: string;
  packKappa: number | null;
  myPairs: { assessorA: string; assessorB: string; kappa: number }[];
}

interface MyConsistencyResponse {
  packs?: MyConsistencyPack[];
}

/**
 * RPLCommanderNav — sidebar entry for the commander track.
 * Shows own queue count (badge) + own avg kappa chip + red alert dot when any
 * pack kappa < 0.4. Never blank: skeleton while loading, CTA fallback on error.
 * UI only from src/components/ui/* (Badge, Skeleton) + hand-rolled spans.
 */
export function RPLCommanderNav() {
  const { user, isLoading: authLoading } = useAuth();
  const { auth } = useFirebase();
  const [queueCount, setQueueCount] = useState<number | null>(null);
  const [avgKappa, setAvgKappa] = useState<number | null>(null);
  const [hasLow, setHasLow] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user || (user.role !== 'commander' && user.role !== 'executive')) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const token = await auth.currentUser?.getIdToken().catch(() => null);
        if (!token) {
          if (!cancelled) setLoading(false);
          return;
        }
        const [queueRes, consistencyRes] = await Promise.all([
          fetch('/api/rpl/assess', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/rpl/assess/my-consistency', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        let count: number | null = null;
        try {
          const body = (await queueRes.json().catch(() => null)) as {
            assessments?: AssessmentRow[];
          } | null;
          if (queueRes.ok && body && Array.isArray(body.assessments)) {
            count = body.assessments.filter((a) => a.status === 'draft').length;
          }
        } catch {
          count = null;
        }

        let avg: number | null = null;
        let low = false;
        try {
          const body = (await consistencyRes.json().catch(() => null)) as
            | MyConsistencyResponse
            | null;
          if (consistencyRes.ok && body && Array.isArray(body.packs)) {
            const kappas = body.packs
              .map((p) => p.packKappa)
              .filter((k): k is number => typeof k === 'number' && Number.isFinite(k));
            avg = kappas.length > 0 ? kappas.reduce((a, b) => a + b, 0) / kappas.length : null;
            low = body.packs.some(
              (p) => typeof p.packKappa === 'number' && p.packKappa < 0.4,
            );
          }
        } catch {
          avg = null;
        }

        if (!cancelled) {
          setQueueCount(count);
          setAvgKappa(avg);
          setHasLow(low);
        }
      } catch {
        // Silent fallback — never blank, never throws.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [auth, authLoading, user]);

  if (authLoading || loading) {
    return <Skeleton className="h-9 w-full" aria-label="Loading assessor nav" />;
  }

  // Silent fallback for signed-out / wrong role / fetch failure: still a link, never blank.
  if (!user || (user.role !== 'commander' && user.role !== 'executive')) {
    return (
      <Link
        href="/rpl/assessor"
        className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <span>Assessor Home</span>
      </Link>
    );
  }

  return (
    <Link
      href="/rpl/assessor"
      className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <span className="relative flex items-center gap-1.5">
        <span>Assessor Home</span>
        {hasLow ? (
          <span
            className="h-2 w-2 rounded-full bg-destructive"
            aria-label="Low agreement alert"
            title="A pack kappa is below 0.4"
          />
        ) : null}
      </span>
      {typeof queueCount === 'number' && queueCount > 0 ? (
        <Badge variant="default" aria-label={`${queueCount} awaiting assessment`}>
          {queueCount}
        </Badge>
      ) : null}
      {typeof avgKappa === 'number' && Number.isFinite(avgKappa) ? (
        <Badge variant={avgKappa < 0.4 ? 'destructive' : avgKappa < 0.6 ? 'warning' : 'success'}>
          κ {avgKappa.toFixed(2)}
        </Badge>
      ) : null}
    </Link>
  );
}

export default RPLCommanderNav;
