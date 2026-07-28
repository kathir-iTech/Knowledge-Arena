'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageError } from '@/components/ui/page-error';
import { EmptyState } from '@/components/ui/empty-state';
import { useRouter } from 'next/navigation';
import {
  Users, Shield, User, BookOpen, Swords, MessageSquare,
  Inbox, Activity, Database, Wifi, BrainCircuit,
  CheckCircle2, AlertTriangle, AlertCircle, Clock, TrendingUp,
  Calendar, Star, Award, Zap, PlayCircle, Bell, BellOff,
  Plus, Settings, ChevronRight, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SystemHealth {
  [key: string]: { status: 'healthy' | 'warning' | 'offline'; latency?: number };
}

interface RecentBattle {
  id: string;
  title: string;
  commanderName: string;
  status: string;
  participantCount: number;
  createdAt: number;
  difficulty: string;
}

interface ActiveCommander {
  uid: string;
  name: string;
  arenaCount: number;
  disabled: boolean;
  lastActive: number | null;
}

interface RecentRequest {
  id: string;
  title: string;
  commanderName: string;
  status: string;
  createdAt: number;
  type: string;
}

interface WorkspaceStats {
  executives: number;
  commanders: number;
  activeCommanders: number;
  disabledCommanders: number;
  gladiators: number;
  activeGladiators: number;
  totalUsers: number;
  questionBank: number;
  battles: number;
  completedBattles: number;
  activeBattles: number;
  waitingBattles: number;
  battlesToday: number;
  battlesThisWeek: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  questionsImported: number;
  aiGeneratedQuestions: number;
  mostActiveCommander: { uid: string; name: string; arenaCount: number } | null;
  averageBattleScore: number;
  averageBattleDuration: number;
  messages: number;
  conversations: number;
  announcements: number;
  unreadRequests: number;
  recentBattles: RecentBattle[];
  activeCommandersList: ActiveCommander[];
  recentRequests: RecentRequest[];
  recentActivity: Array<{
    id: string;
    timestamp: number;
    actor: string;
    actorRole: string;
    action: string;
    target: string;
    metadata: Record<string, unknown>;
  }>;
  systemHealth: SystemHealth;
}

function AnimatedValue({ value, suffix = '' }: { value: string | number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
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

  return <span ref={ref}>{display}{suffix}</span>;
}

const actionLabels: Record<string, string> = {
  commander_created: 'Created Commander',
  commander_deleted: 'Deleted Commander',
  commander_disabled: 'Disabled Commander',
  commander_enabled: 'Enabled Commander',
  password_reset: 'Password Reset',
  question_added: 'Added Question',
  question_edited: 'Edited Question',
  question_deleted: 'Deleted Question',
  question_imported: 'Imported Questions',
  arena_created: 'Created Arena',
  arena_started: 'Started Arena',
  arena_ended: 'Ended Arena',
  arena_reset: 'Reset Arena',
  student_joined: 'Student Joined',
  student_kicked: 'Student Kicked',
  student_unblocked: 'Student Unblocked',
  message_sent: 'Message Sent',
  announcement_sent: 'Announcement Sent',
  settings_changed: 'Settings Changed',
  request_created: 'Request Created',
  request_handled: 'Request Handled',
  conversation_created: 'Conversation Created',
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

const systemIcons: Record<string, React.ElementType> = {
  auth: Shield,
  firestore: Database,
  messaging: MessageSquare,
  ai: BrainCircuit,
  storage: Activity,
};

const systemLabels: Record<string, string> = {
  auth: 'Authentication',
  firestore: 'Firestore',
  messaging: 'Messaging',
  ai: 'AI Services',
  storage: 'Storage',
};

const systemStatusConfig = {
  healthy: { icon: CheckCircle2, className: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800', label: 'Healthy' },
  warning: { icon: AlertTriangle, className: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800', label: 'Warning' },
  offline: { icon: AlertCircle, className: 'text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800', label: 'Offline' },
};

const quickActions = [
  { label: 'Create Arena', icon: Swords, href: '/create-quiz', color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/20' },
  { label: 'Add Question', icon: Plus, href: '/executive/question-bank', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20' },
  { label: 'View Requests', icon: Inbox, href: '/executive/requests', color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/20' },
  { label: 'Commanders', icon: Shield, href: '/executive/commanders', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/20' },
  { label: 'Settings', icon: Settings, href: '/executive/settings', color: 'text-slate-600 bg-slate-50 dark:bg-slate-950/20' },
];

export default function ExecutiveWorkspacePage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [recentNotifications, setRecentNotifications] = useState<Array<{ id: string; type: string; title: string; createdAt: number }>>([]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(false);
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/executive/workspace', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotifs = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/executive/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRecentNotifications((data.notifications || []).slice(0, 5));
      }
    } catch {}
  };

  useEffect(() => {
    if (!user) return;
    fetchStats();
    fetchNotifs();
    const interval = setInterval(() => {
      fetchStats();
      fetchNotifs();
    }, 30000);
    return () => clearInterval(interval);
  }, [user, auth]);

  if (loading) {
    return (
      <div className="page-container animate-in space-y-6">
        <div className="space-y-1.5">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-32" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <PageError title="Failed to Load Dashboard" message="Could not fetch workspace data. Check your connection and try again." onRetry={fetchStats} />;
  }

  return (
    <div className="page-container animate-in space-y-6 safe-bottom">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-page-title font-headline tracking-tight">Control Center</h1>
          <p className="text-base text-muted-foreground">Platform overview, quick actions, and real-time metrics.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchStats} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        {quickActions.map(action => (
          <button
            key={action.label}
            onClick={() => router.push(action.href)}
            className="group flex items-center gap-2 px-4 py-3 rounded-[12px] border border-border/60 hover:border-primary/30 hover:bg-accent/30 hover:shadow-elevation-hover transition-all duration-200 text-sm font-medium"
          >
            <div className={cn('w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110', action.color)}>
              <action.icon className="w-4 h-4" />
            </div>
            {action.label}
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>

      {/* Primary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-live="polite" aria-label="Platform statistics">
        <StatCard icon={Users} label="Total Users" value={stats?.totalUsers ?? 0} sub={`${stats?.executives ?? 0} exec, ${stats?.commanders ?? 0} cmd, ${stats?.gladiators ?? 0} glad`} color="text-blue-600" />
        <StatCard icon={BookOpen} label="Question Bank" value={stats?.questionBank ?? 0} sub={`${stats?.questionsImported ?? 0} AI-imported`} color="text-amber-600" />
        <StatCard icon={Swords} label="Total Battles" value={stats?.battles ?? 0} sub={`${stats?.completedBattles ?? 0} completed, ${stats?.activeBattles ?? 0} active`} color="text-rose-600" />
        <StatCard icon={Inbox} label="Pending Requests" value={stats?.unreadRequests ?? 0} color="text-orange-600" />
      </div>

      {/* Analytics Mini Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <MiniStat icon={Calendar} label="Battles Today" value={stats?.battlesToday ?? 0} />
        <MiniStat icon={TrendingUp} label="This Week" value={stats?.battlesThisWeek ?? 0} />
        <MiniStat icon={User} label="New Today" value={stats?.newUsersToday ?? 0} />
        <MiniStat icon={Users} label="New Week" value={stats?.newUsersThisWeek ?? 0} />
        <MiniStat icon={Zap} label="AI Questions" value={stats?.aiGeneratedQuestions ?? 0} />
        <MiniStat icon={Award} label="Avg Score" value={stats?.averageBattleScore ?? 0} />
        <MiniStat icon={Clock} label="Avg Duration" value={`${stats?.averageBattleDuration ?? 0}m`} />
        <MiniStat icon={PlayCircle} label="Active Cmdrs" value={stats?.activeCommanders ?? 0} />
      </div>

      {/* Three-column middle section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Battles */}
        <Card className="card-hover">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/30 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Swords className="w-4 h-4 text-primary" />
              Recent Battles
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => router.push('/create-quiz')}>
              <Plus className="w-3.5 h-3.5 mr-1" /> New
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            {stats?.recentBattles && stats.recentBattles.length > 0 ? (
              <div className="space-y-1">
                {stats.recentBattles.map(battle => (
                  <div key={battle.id} onClick={() => router.push(`/commander/edit-arena/${battle.id}`)} className="group flex items-center justify-between p-3 rounded-[12px] bg-muted/30 hover:bg-muted/50 hover:shadow-elevation-small transition-all duration-200 cursor-pointer border border-transparent hover:border-border/50">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{battle.title}</p>
                      <p className="text-xs text-muted-foreground">{battle.commanderName} · {battle.participantCount} participants</p>
                    </div>
                    <Badge variant="outline" className={cn(
                      'text-[10px] ml-2',
                      battle.status === 'live' && 'border-emerald-300 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20',
                      battle.status === 'finished' && 'border-slate-300 text-slate-600',
                      battle.status === 'waiting' && 'border-amber-300 text-amber-600 bg-amber-50 dark:bg-amber-950/20',
                    )}>
                      {battle.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Swords} title="No Battles Yet" description="Create your first arena to get started." action={<Button size="sm" onClick={() => router.push('/create-quiz')}><Plus className="w-3.5 h-3.5 mr-1" /> Create Arena</Button>} />
            )}
          </CardContent>
        </Card>

        {/* Recent Requests */}
        <Card className="card-hover">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/30 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Inbox className="w-4 h-4 text-primary" />
              Recent Requests
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => router.push('/executive/requests')}>
              View All <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            {stats?.recentRequests && stats.recentRequests.length > 0 ? (
              <div className="space-y-1">
                {stats.recentRequests.map(req => (
                  <div key={req.id} onClick={() => router.push('/executive/requests')} className="group flex items-center justify-between p-3 rounded-[12px] bg-muted/30 hover:bg-muted/50 hover:shadow-elevation-small transition-all duration-200 cursor-pointer border border-transparent hover:border-border/50">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{req.title}</p>
                      <p className="text-xs text-muted-foreground">{req.commanderName} · {formatDate(req.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <div className={cn(
                        'w-1.5 h-1.5 rounded-full',
                        req.status === 'pending' && 'bg-amber-500',
                        req.status === 'approved' && 'bg-emerald-500',
                        req.status === 'completed' && 'bg-slate-400',
                        req.status === 'rejected' && 'bg-red-500',
                      )} />
                      <span className={cn(
                        'text-[10px] font-medium',
                        req.status === 'pending' && 'text-amber-600',
                        req.status === 'approved' && 'text-emerald-600',
                        req.status === 'completed' && 'text-slate-600',
                        req.status === 'rejected' && 'text-red-600',
                      )}>{req.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Inbox} title="No Requests" description="Requests from commanders will appear here." />
            )}
          </CardContent>
        </Card>

        {/* Recent Notifications */}
        <Card className="card-hover">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/30 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              Recent Notifications
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => router.push('/executive/notifications')}>
              View All <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            {recentNotifications.length > 0 ? (
              <div className="space-y-1">
                {recentNotifications.map(n => (
                  <div key={n.id} onClick={() => router.push('/executive/notifications')} className="group flex items-start gap-3 p-2.5 rounded-[10px] hover:bg-muted/30 hover:shadow-elevation-small transition-all duration-200 cursor-pointer border border-transparent hover:border-border/50">
                    <div className="shrink-0 w-8 h-8 rounded-[10px] bg-primary/10 flex items-center justify-center">
                      <Bell className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate group-hover:text-primary transition-colors">{n.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(n.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={BellOff} title="No Notifications" description="You're all caught up." />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom two-column section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Active Commander + Active Commanders List */}
        <div className="space-y-6">
          {/* Active Commanders */}
          <Card className="card-hover">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/30 pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Active Commanders
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => router.push('/executive/commanders')}>
                Manage <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              {stats?.activeCommandersList && stats.activeCommandersList.length > 0 ? (
                <div className="space-y-1">
                  {stats.activeCommandersList.slice(0, 5).map(cmd => (
                    <div key={cmd.uid} onClick={() => router.push('/executive/commanders')} className="group flex items-center justify-between p-2.5 rounded-[10px] hover:bg-muted/30 hover:shadow-elevation-small transition-all duration-200 cursor-pointer border border-transparent hover:border-border/50">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                          <Shield className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium group-hover:text-primary transition-colors">{cmd.name}</p>
                          <p className="text-xs text-muted-foreground">{cmd.arenaCount} arenas created</p>
                        </div>
                      </div>
                      {cmd.disabled && <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive bg-destructive/5">Disabled</Badge>}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Shield} title="No Active Commanders" description="Commanders will appear here once they create arenas." />
              )}
            </CardContent>
          </Card>

          {/* Most Active Commander Highlight */}
          {stats?.mostActiveCommander && (
            <Card className="card-hover border-amber-200/50 dark:border-amber-800/30">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="shrink-0 w-12 h-12 rounded-[14px] bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-elevation-small">
                  <Star className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Most Active Commander</p>
                  <p className="font-semibold text-lg">{stats.mostActiveCommander.name}</p>
                  <p className="text-sm text-muted-foreground">{stats.mostActiveCommander.arenaCount} arenas created</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: Recent Activity + System Health */}
        <div className="space-y-6">
          {/* Recent Activity */}
          <Card className="card-hover">
            <CardHeader className="border-b border-border/30 pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {stats?.recentActivity && stats.recentActivity.length > 0 ? (
                <div className="space-y-0 max-h-[360px] overflow-y-auto custom-scrollbar -mx-1 px-1">
                  {stats.recentActivity.slice(0, 15).map(activity => {
                    const roleColors: Record<string, string> = {
                      executive: 'bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300 border-purple-200 dark:border-purple-800',
                      commander: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                      gladiator: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                    };
                    return (
                      <div key={activity.id} className="group flex items-start gap-3 py-2.5 border-b border-border/20 last:border-0 hover:bg-muted/20 -mx-1 px-1 rounded-[8px] transition-colors duration-150">
                        <div className="shrink-0 w-8 h-8 rounded-[10px] bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                          <Activity className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {formatDate(activity.timestamp)}
                            </span>
                            <span className={cn(
                              'inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider',
                              roleColors[activity.actorRole] || 'bg-muted text-muted-foreground border-border'
                            )}>
                              {activity.actorRole}
                            </span>
                          </div>
                          <p className="text-sm mt-0.5 group-hover:text-foreground transition-colors">
                            <span className="font-medium capitalize">{activity.actorRole || 'User'}</span>
                            {' '}{actionLabels[activity.action] || activity.action.replace(/_/g, ' ')}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState icon={Activity} title="No Recent Activity" description="Platform activity will be logged here." />
              )}
            </CardContent>
          </Card>

          {/* System Health */}
          <Card className="card-hover">
            <CardHeader className="border-b border-border/30 pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Wifi className="w-4 h-4 text-primary" />
                System Health
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(stats?.systemHealth || {}).map(([key, health]) => {
                  const Icon = systemIcons[key] || Activity;
                  const cfg = systemStatusConfig[health.status] || systemStatusConfig.offline;
                  const StatusIcon = cfg.icon;
                  return (
                    <div key={key} className="group flex items-center justify-between p-3 rounded-[12px] bg-muted/30 hover:bg-muted/50 hover:shadow-elevation-small transition-all duration-200 border border-transparent hover:border-border/50">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-[8px] bg-background flex items-center justify-center">
                          <Icon className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                        </div>
                        <span className="text-sm font-medium">{systemLabels[key] || key}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {health.latency !== undefined && (
                          <span className="text-[10px] text-muted-foreground font-mono">{health.latency}ms</span>
                        )}
                        <Badge variant="outline" className={cn("gap-1 text-[10px] px-2 py-0.5", cfg.className)}>
                          <StatusIcon className="w-3 h-3" />
                          {cfg.label}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Database Overview */}
          <Card className="card-hover">
            <CardHeader className="border-b border-border/30 pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="w-4 h-4 text-primary" />
                Database Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-3">
                <DbStat label="Users" value={stats?.totalUsers ?? 0} />
                <DbStat label="Questions" value={stats?.questionBank ?? 0} />
                <DbStat label="Battles" value={stats?.battles ?? 0} />
                <DbStat label="Messages" value={stats?.messages ?? 0} />
                <DbStat label="Announcements" value={stats?.announcements ?? 0} />
                <DbStat label="Conversations" value={stats?.conversations ?? 0} />
                <DbStat label="Requests" value={(stats?.unreadRequests ?? 0)} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  const bgClass = color ? `${color.replace('text-', 'bg-').replace('600', '100')} dark:${color.replace('text-', 'bg-').replace('600', '950/20')} group-hover:${color.replace('text-', 'bg-').replace('600', '200')} dark:group-hover:${color.replace('text-', 'bg-').replace('600', '950/30')}` : 'bg-muted';
  return (
    <Card className="group/card card-hover shadow-elevation-small hover:shadow-elevation-medium">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-2xl font-bold tabular-nums"><AnimatedValue value={value} /></p>
            <p className="text-sm text-muted-foreground">{label}</p>
            {sub && <p className="text-xs text-muted-foreground/70">{sub}</p>}
          </div>
          <div className={cn("w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 transition-all duration-200 group-hover/card:scale-110 group-hover/card:shadow-sm", bgClass)}>
            <Icon className={cn("w-5 h-5", color || 'text-muted-foreground')} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ icon: Icon, label, value }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
}) {
  return (
    <Card className="card-hover shadow-elevation-small hover:shadow-elevation-medium">
      <CardContent className="p-3 flex items-center gap-2">
        <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight tabular-nums"><AnimatedValue value={value} /></p>
          <p className="text-[10px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DbStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="group flex items-center justify-between p-2.5 rounded-[10px] bg-muted/30 hover:bg-muted/50 border border-transparent hover:border-border/50 transition-all duration-200">
      <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
      <span className="text-sm font-semibold tabular-nums"><AnimatedValue value={value} /></span>
    </div>
  );
}
