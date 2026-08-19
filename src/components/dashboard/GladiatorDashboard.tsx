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
import { QuizRecommendations } from '@/components/dashboard/QuizRecommendations';
import { Loader2, Swords, UserCircle, History, ExternalLink, Trophy, Star, TrendingUp, Zap, Bell, ChevronRight, Play, Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'warning'> = {
  finished: 'default',
  live: 'success',
  waiting: 'warning',
};

function AnimatedValue({ value, suffix = '' }: { value: string | number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const num = typeof value === 'string' ? parseFloat(value) || 0 : value;
  useEffect(() => {
    if (!num) { setDisplay(0); return; }
    const duration = Math.min(1000, Math.max(400, num * 20));
    const start = performance.now();
    let frame: number;
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * num));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [num]);
  return <span>{display}{suffix}</span>;
}

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
        if (quiz.status === 'live') throw new Error('This battle has already started. Late joining is not permitted.');
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
        const denied = (err as { code?: string })?.code === 'permission-denied';
        toast({ variant: 'destructive', title: 'Join Failed', description: denied ? 'Arena not found' : (err instanceof Error ? err.message : 'Unknown error') });
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
      const denied = (err as { code?: string })?.code === 'permission-denied';
      toast({ variant: 'destructive', title: 'Join Failed', description: denied ? 'Arena not found' : (err instanceof Error ? err.message : "Unknown error") });
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container animate-in space-y-6" aria-busy="true" aria-label="Loading dashboard">
        <div className="page-section space-y-1.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[14px] bg-muted animate-pulse" />
            <div className="h-8 w-48 bg-muted rounded-lg animate-pulse" />
          </div>
          <div className="h-4 w-64 bg-muted rounded-lg animate-pulse ml-[3.25rem]" />
        </div>
        <div className="page-section grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
        </div>
        <div className="page-section">
          <div className="h-32 bg-muted rounded-xl animate-pulse" />
        </div>
        <span className="sr-only">Dashboard is loading...</span>
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
            <StatCard icon={Swords} label="Battles" value={stats.totalBattles} iconClass="text-primary" iconBgClass="bg-primary/10 group-hover/card:bg-primary/15" />
            <StatCard icon={Trophy} label="Wins" value={stats.wins} iconClass="text-warning" iconBgClass="bg-warning/10 group-hover/card:bg-warning/15" />
            <StatCard icon={Star} label="Avg Score" value={stats.averageScore} iconClass="text-accent" iconBgClass="bg-accent/10 group-hover/card:bg-accent/15" />
            <StatCard icon={Zap} label="Accuracy" value={`${stats.accuracy}%`} iconClass="text-success" iconBgClass="bg-success/10 group-hover/card:bg-success/15" />
          </div>
        </section>
      )}

      {/* No Battles Yet */}
      {stats && stats.totalBattles === 0 && !dashboardData?.activeBattle && (
        <section className="page-section">
          <Card className="border-primary/10 overflow-hidden">
            <CardContent className="p-6 md:p-8">
              <div className="flex flex-col md:flex-row md:items-center gap-5">
                <div className="relative shrink-0">
                  <div className="absolute -inset-2 rounded-[20px] bg-gradient-to-br from-primary/15 via-transparent to-accent/15 blur-xl animate-glow-pulse" aria-hidden="true" />
                  <div className="relative w-14 h-14 rounded-[16px] bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
                    <Swords className="w-6 h-6 text-primary" />
                  </div>
                </div>
                <div className="flex-1 space-y-1">
                  <h2 className="text-card-title font-headline">No Battles Yet</h2>
                  <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
                    Your story starts when you join one. Enter the 6-digit room code your Commander shares below, or check back after the next arena opens.
                  </p>
                </div>
                <Sparkles className="hidden md:block w-5 h-5 text-warning/50" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Active Battle Alert */}
      {dashboardData?.activeBattle && (
        <section className="page-section">
          <Link href={`/battle/${dashboardData.activeBattle.id}`} className="group block p-5 rounded-[14px] bg-gradient-to-r from-success/10 to-success/5 border border-success/25 hover:shadow-elevation-medium transition-all duration-300">
            <div className="flex items-center gap-4">
              <span className="relative flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />
                <span className="relative inline-flex rounded-full h-4 w-4 bg-success" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-success">Active Battle</p>
                <p className="text-sm text-success/80 font-medium">{dashboardData.activeBattle.title}</p>
                <p className="text-xs text-success/60 mt-0.5">Tap to rejoin</p>
              </div>
              <div className="flex items-center gap-2 text-success/80 text-sm font-medium group-hover:gap-3 transition-all duration-300">
                <span className="hidden sm:inline">Rejoin</span>
                <ChevronRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* Join Arena */}
      <section className="page-section">
        <Card className="card-hover border-primary/10 hover:border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex items-center justify-center w-10 h-10 rounded-[12px] bg-gradient-to-br from-primary/20 to-primary/5 shrink-0">
                <Swords className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Join Arena</h2>
                <p className="text-sm text-muted-foreground">Enter the 6-digit room code to join a battle.</p>
              </div>
            </div>
            <form onSubmit={handleJoin} className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Input
                  value={roomCode}
                  onChange={e => setRoomCode(e.target.value)}
                  className="text-center text-xl font-mono tracking-[0.3em] uppercase flex-1 h-14 rounded-[12px] border-2 focus-visible:border-primary shadow-elevation-small"
                  maxLength={6}
                  placeholder="000000"
                  aria-label="Room code"
                />
                {roomCode.length > 0 && roomCode.length < 6 && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-mono">{roomCode.length}/6</span>
                )}
              </div>
              <Button type="submit" size="lg" className="shrink-0 h-14 px-8 text-base font-semibold shadow-elevation-small hover:shadow-elevation-hover transition-all duration-300" disabled={isLoading || roomCode.length < 6}>
                {isLoading ? <Loader2 className="animate-spin mr-2 h-5 w-5" /> : <Swords className="mr-2 h-5 w-5" />}
                {isLoading ? 'Joining...' : 'Join Battle'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      {/* AI Recommendations */}
      <QuizRecommendations />

      {/* Recent Results + Notifications */}
      <div className="page-section grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Results */}
        <Card className="card-hover">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/30 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Recent Results
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/gladiator/history">View All <ChevronRight className="w-3.5 h-3.5 ml-1" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            {dashboardData?.recentBattles && dashboardData.recentBattles.length > 0 ? (
              <div className="space-y-1">
                {dashboardData.recentBattles.slice(0, 8).map((h: any) => {
                  return (
                    <Link key={h.quizId} href={`/battle/${h.quizId}`} className="group block">
                      <div className="flex items-center gap-3 p-2.5 rounded-[10px] hover:bg-muted/30 hover:shadow-elevation-small transition-all duration-300 border border-transparent hover:border-border/50">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{h.title}</p>
                          <p className="text-[11px] text-muted-foreground">{new Date(h.created_at).toLocaleDateString()}</p>
                        </div>
                        <Badge variant={STATUS_VARIANT[h.status] || 'secondary'} className="h-5 text-[10px] shrink-0 transition-colors">
                          {h.status === 'finished' ? 'DONE' : h.status === 'live' ? 'LIVE' : 'WAITING'}
                        </Badge>
                        <span className="text-sm font-bold font-mono text-primary tabular-nums shrink-0">{h.score}<span className="text-[10px] text-muted-foreground font-normal ml-0.5">pts</span></span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={TrendingUp} title="No Results Yet" description="Join a battle to see your results here." action={<Button size="sm" variant="outline" asChild><Link href="/gladiator/history">View Full History</Link></Button>} />
            )}
          </CardContent>
        </Card>

        {/* Profile Summary */}
        <Card className="card-hover">
          <CardHeader className="border-b border-border/30 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <UserCircle className="w-4 h-4 text-primary" />
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-[14px] bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-2xl shrink-0 shadow-elevation-small">
                {user?.avatar || '🎮'}
              </div>
              <div>
                <p className="text-base font-semibold">{user?.name || 'Anonymous'}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {stats && (
                <>
                  <div className="p-2.5 rounded-[10px] bg-muted/30 text-center">
                    <p className="text-lg font-bold tabular-nums text-primary"><AnimatedValue value={stats.totalBattles} /></p>
                    <p className="text-[10px] text-muted-foreground">Total Battles</p>
                  </div>
                  <div className="p-2.5 rounded-[10px] bg-muted/30 text-center">
                    <p className="text-lg font-bold tabular-nums text-warning"><AnimatedValue value={stats.wins} /></p>
                    <p className="text-[10px] text-muted-foreground">Wins</p>
                  </div>
                </>
              )}
            </div>
            <Button variant="outline" size="sm" className="w-full group" onClick={() => router.push('/gladiator/profile')}>
              <UserCircle className="w-3.5 h-3.5 mr-2" /> Edit Profile
              <ChevronRight className="w-3.5 h-3.5 ml-auto transition-transform duration-200 group-hover:translate-x-0.5" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Full Battle History Link */}
      <section className="page-section">
        <Card className="card-hover border-primary/10 hover:border-primary/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-[12px] bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center shrink-0">
                  <History className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Battle History</p>
                  <p className="text-xs text-muted-foreground">View all your past battles and results</p>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild className="group">
                <Link href="/gladiator/history">View <ChevronRight className="w-3.5 h-3.5 ml-1 transition-transform duration-200 group-hover:translate-x-0.5" /></Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

const StatCard = React.memo(function StatCard({ icon: Icon, label, value, iconClass, iconBgClass }: { icon: React.ElementType; label: string; value: string | number; iconClass?: string; iconBgClass?: string }) {
  return (
    <Card className="group/card card-hover shadow-elevation-small hover:shadow-elevation-medium">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 transition-all duration-300 group-hover/card:scale-110 group-hover/card:shadow-sm", iconBgClass || 'bg-muted')}>
          <Icon className={cn("w-4 h-4", iconClass || 'text-muted-foreground')} />
        </div>
        <div>
          <p className="text-lg font-bold leading-tight tabular-nums"><AnimatedValue value={value} /></p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
});
