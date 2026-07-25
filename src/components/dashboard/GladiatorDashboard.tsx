'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { PageError } from '@/components/ui/page-error';
import { quizService } from '@/services/quiz.service';
import { participantService } from '@/services/participant.service';
import { Loader2, Swords, UserCircle, History, ExternalLink, Trophy, Star, TrendingUp, Zap, Bell, ChevronRight, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashboardStats {
  totalBattles: number;
  finishedCount: number;
  wins: number;
  averageScore: number;
  accuracy: number;
}

export default function GladiatorDashboard({ initialRoomCode }: { initialRoomCode?: string }) {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const codeSource = useRef<'url' | 'session' | 'none'>('none');
  const [roomCode, setRoomCode] = useState(() => {
    if (initialRoomCode) { codeSource.current = 'url'; return initialRoomCode; }
    if (typeof window !== 'undefined') {
      const pending = sessionStorage.getItem('pendingRoomCode');
      if (pending) { sessionStorage.removeItem('pendingRoomCode'); codeSource.current = 'session'; return pending; }
    }
    return '';
  });
  const [isLoading, setIsLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState<{ stats: DashboardStats; recentBattles: any[]; activeBattle: { id: string; title: string } | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const autoJoinTriggered = useRef(false);

  useEffect(() => {
    if (!user) return;
    const fetchDashboard = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch('/api/gladiator/dashboard', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setDashboardData(data);
        } else {
          setError(true);
        }
      } catch { setError(true); }
      finally { setLoading(false); }
    };
    fetchDashboard();
  }, [user, auth]);

  useEffect(() => {
    const code = roomCode.trim().toUpperCase();
    if (!code || autoJoinTriggered.current || !user) return;
    if (codeSource.current === 'none') return;
    autoJoinTriggered.current = true;
    setIsLoading(true);
    quizService.getQuizById(code)
      .then(async (quiz) => {
        if (quiz.status === 'finished') throw new Error('Battle has ended');
        const participants = await participantService.getAllParticipants(code);
        const existing = participants.find(p => p.user_id === user.id);
        if (!existing) {
          await participantService.joinQuiz(code, user.id, user.name);
        } else if (existing.status === 'blocked') {
          throw new Error('You are blocked from this arena');
        }
        router.push(`/battle/${code}`);
      })
      .catch((err) => {
        toast({ variant: 'destructive', title: 'Join Failed', description: err instanceof Error ? err.message : 'Unknown error' });
        setIsLoading(false);
      });
  }, [roomCode, user, toast, router]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!code || !user) return;
    setIsLoading(true);
    try {
      const quiz = await quizService.getQuizById(code);
      if (quiz.status === 'finished') throw new Error('Battle has ended');
      if (quiz.status === 'live') throw new Error('This battle has already started. Late joining is not permitted.');
      const participants = await participantService.getAllParticipants(code);
      const existing = participants.find(p => p.user_id === user.id);
      if (!existing) {
        await participantService.joinQuiz(code, user.id, user.name);
      } else if (existing.status === 'blocked') {
        throw new Error('You are blocked from this arena');
      }
      router.push(`/battle/${code}`);
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Join Failed', description: err instanceof Error ? err.message : "Unknown error" });
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container animate-in space-y-6">
        <div className="page-section space-y-1.5">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-4 w-64 bg-muted animate-pulse rounded" />
        </div>
        <div className="page-section grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-[12px]" />)}
        </div>
      </div>
    );
  }

  if (error) return <PageError title="Failed to Load Dashboard" onRetry={() => window.location.reload()} />;

  const stats = dashboardData?.stats;

  return (
    <div className="page-container safe-bottom animate-in">
      {/* Header */}
      <header className="page-section safe-top">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-page-title font-headline tracking-tight">Hello, {user?.name || 'Gladiator'}.</h1>
            <p className="text-base text-muted-foreground">Ready for your next battle?</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/gladiator/profile"><UserCircle className="mr-2 h-4 w-4" /> Profile</Link>
          </Button>
        </div>
      </header>

      {/* Stats Row */}
      {stats && (
        <section className="page-section">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Swords} label="Battles" value={stats.totalBattles} color="text-blue-600" />
            <StatCard icon={Trophy} label="Wins" value={stats.wins} color="text-amber-600" />
            <StatCard icon={Star} label="Avg Score" value={stats.averageScore} color="text-purple-600" />
            <StatCard icon={Zap} label="Accuracy" value={`${stats.accuracy}%`} color="text-emerald-600" />
          </div>
        </section>
      )}

      {/* Active Battle Alert */}
      {dashboardData?.activeBattle && (
        <section className="page-section">
          <Link href={`/battle/${dashboardData.activeBattle.id}`} className="block p-4 rounded-[14px] bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-950/30 transition-colors">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Active Battle</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400">{dashboardData.activeBattle.title} — tap to rejoin</p>
              </div>
              <ChevronRight className="w-4 h-4 text-emerald-500" />
            </div>
          </Link>
        </section>
      )}

      {/* Join Arena */}
      <section className="page-section">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-9 h-9 rounded-[10px] bg-primary/10 shrink-0">
                <Swords className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">Join Arena</h2>
                <p className="text-xs text-muted-foreground">Enter the 6-digit room code to join a battle.</p>
              </div>
            </div>
            <form onSubmit={handleJoin} className="flex gap-3">
              <Input
                value={roomCode}
                onChange={e => setRoomCode(e.target.value)}
                className="text-center text-lg font-mono tracking-[0.25em] uppercase flex-1 h-12"
                maxLength={6}
                placeholder="000000"
                aria-label="Room code"
              />
              <Button type="submit" className="shrink-0 h-12 px-6" disabled={isLoading || roomCode.length < 6}>
                {isLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Swords className="mr-2 h-4 w-4" />}
                Join
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      {/* Recent Results + Notifications */}
      <div className="page-section grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Results */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Recent Results
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/gladiator/history">View All <ChevronRight className="w-3.5 h-3.5 ml-1" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {dashboardData?.recentBattles && dashboardData.recentBattles.length > 0 ? (
              <div className="space-y-1">
                {dashboardData.recentBattles.slice(0, 8).map((h: any) => (
                  <Link key={h.quizId} href={`/battle/${h.quizId}`} className="block">
                    <div className="flex items-center gap-3 p-2.5 rounded-[8px] hover:bg-muted/30 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{h.title}</p>
                        <p className="text-[11px] text-muted-foreground">{new Date(h.created_at).toLocaleDateString()}</p>
                      </div>
                      <Badge variant={h.status === 'finished' ? 'outline' : 'secondary'} className="h-5 text-[10px] shrink-0">
                        {h.status === 'finished' ? 'DONE' : h.status === 'live' ? 'LIVE' : 'WAITING'}
                      </Badge>
                      <span className="text-sm font-bold font-mono text-primary tabular-nums shrink-0">{h.score}<span className="text-[10px] text-muted-foreground font-normal ml-0.5">pts</span></span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState icon={TrendingUp} title="No Results Yet" description="Join a battle to see your results here." action={<Button size="sm" variant="outline" asChild><Link href="/gladiator/history">View Full History</Link></Button>} />
            )}
          </CardContent>
        </Card>

        {/* Profile Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserCircle className="w-4 h-4" />
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xl shrink-0">
                {user?.avatar || '🎮'}
              </div>
              <div>
                <p className="text-sm font-medium">{user?.name || 'Anonymous'}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => router.push('/gladiator/profile')}>
              <UserCircle className="w-3.5 h-3.5 mr-1" /> Edit Profile
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Full Battle History Link */}
      <section className="page-section">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <History className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Battle History</p>
                  <p className="text-xs text-muted-foreground">View all your past battles and results</p>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/gladiator/history">View <ChevronRight className="w-3.5 h-3.5 ml-1" /></Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string | number; color?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0", color ? `${color.replace('text-', 'bg-').replace('600', '100')} dark:${color.replace('text-', 'bg-').replace('600', '950/20')}` : 'bg-muted')}>
          <Icon className={cn("w-4 h-4", color || 'text-muted-foreground')} />
        </div>
        <div>
          <p className="text-lg font-bold leading-tight">{value}</p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
