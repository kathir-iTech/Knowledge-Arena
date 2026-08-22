'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Swords, Clock, ChevronRight, AlertTriangle } from 'lucide-react';

interface UpcomingArena {
  id: string;
  title: string;
  status: string;
  createdAt: number;
  questionCount: number;
}

export function UpcomingArenas() {
  const { auth } = useFirebase();
  const [arenas, setArenas] = useState<UpcomingArena[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;
    const fetchUpcoming = async () => {
      try {
        const token = await auth.currentUser!.getIdToken();
        const res = await fetch('/api/gladiator/personalization', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        setArenas(data.upcomingArenas || []);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchUpcoming();
  }, [auth]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Swords className="w-4 h-4 text-primary" /> Upcoming Arenas</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <CardContent className="py-6 text-center">
          <AlertTriangle className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Could not load upcoming arenas.</p>
        </CardContent>
      </Card>
    );
  }
  if (!arenas || arenas.length === 0) {
    return (
      <Card className="card-hover">
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Swords className="w-4 h-4 text-primary" /> Upcoming Arenas</CardTitle></CardHeader>
        <CardContent>
          <div className="p-4 rounded-[12px] bg-muted/20 border border-border/40 text-center">
            <p className="text-sm text-muted-foreground">No upcoming arenas — check back soon.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Uses status index; does not scan entire collection.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-hover">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Swords className="w-4 h-4 text-warning" /> Upcoming Arenas
          <Badge variant="outline" className="text-[10px] ml-auto">{arenas.length} waiting</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {arenas.map(a => (
          <Link key={a.id} href={`/battle/${a.id}`} className="group flex items-center gap-3 p-3 rounded-[12px] bg-muted/20 border border-border/30 hover:border-warning/30 hover:bg-warning/5 transition-colors">
            <div className="w-9 h-9 rounded-[10px] bg-warning/10 flex items-center justify-center shrink-0">
              <Swords className="w-4 h-4 text-warning" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate group-hover:text-warning transition-colors">{a.title}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> {a.questionCount} questions · {new Date(a.createdAt).toLocaleDateString()}
              </p>
            </div>
            <Badge variant="outline" className="text-[10px] border-warning/30 text-warning bg-warning/10 capitalize">{a.status}</Badge>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-warning transition-colors" />
          </Link>
        ))}
        <Button variant="ghost" size="sm" asChild className="w-full mt-1">
          <Link href="/gladiator/dashboard">Join an arena now <ChevronRight className="w-3.5 h-3.5 ml-1" /></Link>
        </Button>
      </CardContent>
    </Card>
  );
}
