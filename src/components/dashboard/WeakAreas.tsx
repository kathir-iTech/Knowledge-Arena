'use client';

import React, { useEffect, useState } from 'react';
import { useFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Target, TrendingDown } from 'lucide-react';

interface WeakArea {
  label: string;
  total: number;
  wrong: number;
  wrongRate: number;
}

export function WeakAreas() {
  const { auth } = useFirebase();
  const [areas, setAreas] = useState<WeakArea[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;
    const fetchAreas = async () => {
      try {
        const token = await auth.currentUser!.getIdToken();
        const res = await fetch('/api/gladiator/personalization', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        setAreas(data.weakAreas || []);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchAreas();
  }, [auth]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Target className="w-4 h-4 text-primary" /> Your Weak Areas</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <CardContent className="py-6 text-center">
          <AlertTriangle className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Could not load weak areas.</p>
        </CardContent>
      </Card>
    );
  }
  if (!areas || areas.length === 0) {
    return (
      <Card className="card-hover">
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Target className="w-4 h-4 text-success" /> Your Weak Areas</CardTitle></CardHeader>
        <CardContent>
          <div className="p-4 rounded-[12px] bg-success/5 border border-success/20 text-center">
            <p className="text-sm font-medium text-success">No weak areas detected — keep it up!</p>
            <p className="text-xs text-muted-foreground mt-1">You’re performing consistently across battles.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-hover">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="w-4 h-4 text-warning" /> Your Weak Areas
          <Badge variant="outline" className="text-[10px] ml-auto">{areas.length} detected</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {areas.map((a, i) => (
          <div key={i} className="flex items-center justify-between p-3 rounded-[10px] bg-warning/5 border border-warning/20">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{a.label}</p>
              <p className="text-xs text-muted-foreground">{a.wrong}/{a.total} wrong — {a.wrongRate}% incorrect</p>
            </div>
            <div className="flex items-center gap-1.5 text-warning ml-3">
              <TrendingDown className="w-4 h-4" />
              <span className="text-sm font-bold">{a.wrongRate}%</span>
            </div>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground">Based on your submission history — pull from existing battle data.</p>
      </CardContent>
    </Card>
  );
}
