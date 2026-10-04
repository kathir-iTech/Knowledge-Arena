'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RPLStatusBadge } from '@/components/rpl/RPLStatusBadge';
import type { RPLStage, StatusResponse } from '@/lib/rpl/types';

/**
 * RPLGladiatorNav — sidebar entry point for the RPL track.
 * Never blank, never throws: loading -> skeleton, 404/failure/unauth -> CTA fallback.
 */
export function RPLGladiatorNav() {
  const { user, isLoading: authLoading } = useAuth();
  const { auth } = useFirebase();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    const rawUid = user?.id;
    if (!rawUid || !rawUid.trim()) {
      setStatus(null);
      setNotFound(true);
      setLoading(false);
      return;
    }
    const workerId: string = rawUid.trim();
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const token = await auth.currentUser?.getIdToken().catch(() => null);
        if (!token) {
          if (!cancelled) {
            setStatus(null);
            setNotFound(true);
            setLoading(false);
          }
          return;
        }
        const res = await fetch(`/api/rpl/status/${encodeURIComponent(workerId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (res.status === 404) {
          setStatus(null);
          setNotFound(true);
        } else if (!res.ok) {
          // Silent CTA fallback on fetch failure.
          setStatus(null);
          setNotFound(true);
        } else {
          const body = (await res.json().catch(() => null)) as StatusResponse | null;
          if (!body || Array.isArray(body) || typeof body.stage !== 'string') {
            setStatus(null);
            setNotFound(true);
          } else {
            setStatus(body);
            setNotFound(false);
          }
        }
      } catch {
        if (!cancelled) {
          setStatus(null);
          setNotFound(true);
        }
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
    return <Skeleton className="h-9 w-full" aria-label="Loading RPL status" />;
  }

  // Silent CTA fallback: no declaration, fetch failure, or signed out.
  if (notFound || !status || !user) {
    return (
      <Link
        href="/rpl"
        className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <span>Get RPL Certified</span>
        <Badge variant="default">New</Badge>
      </Link>
    );
  }

  const stage: RPLStage = status.stage;
  const uid = user.id;

  if (stage === 'declared' || stage === 'assessment_scheduled') {
    return (
      <Link
        href="/rpl/status"
        className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <span>My RPL Status</span>
        <RPLStatusBadge stage={stage} />
      </Link>
    );
  }

  if (stage === 'assessed' || stage === 'profile_ready') {
    return (
      <Link
        href={`/rpl/profile/${encodeURIComponent(uid)}`}
        className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <span>My Competency Profile</span>
      </Link>
    );
  }

  // certified
  return (
    <Link
      href={`/rpl/profile/${encodeURIComponent(uid)}`}
      className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <Check className="h-4 w-4 text-success" aria-hidden="true" />
      <span>My Certificate</span>
    </Link>
  );
}

export default RPLGladiatorNav;
