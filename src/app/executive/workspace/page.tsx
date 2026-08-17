'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
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
  Calendar, Award, Zap, PlayCircle, Bell, BellOff,
  Plus, Settings, ChevronRight, RefreshCw, ShieldAlert,
  HardDrive, Archive, BarChart3, Timer, Cpu,
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

interface SecurityEvent {
  id: string;
  event: string;
  actor: string;
  actorRole?: string | null;
  target?: string | null;
  detail?: string | null;
  metadata?: Record<string, unknown>;
  timestamp?: number | null;
}

interface AiFailure {
  id: string;
  model: string;
  error: string | null;
  createdAt: number;
}

interface WorkspaceStats {
  executives: number;
  commanders: number;
  activeCommanders: number;
  disabledCommanders: number;
  gladiators: number;
  activeGladiators: number;
  disabledGladiators: number;
  totalUsers: number;
  questionBank: number;
  questionsImported: number;
  questionsAddedThisWeek: number;
  battles: number;
  completedBattles: number;
  activeBattles: number;
  waitingBattles: number;
  pausedBattles: number;
  battlesToday: number;
  battlesThisWeek: number;
  newUsersToday: number;
  newUsersThisWeek: number;
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
  latestAiFailures: AiFailure[];
  aiSummary: {
    total: number;
    failures: number;
    successRate: number | null;
    avgDurationMs: number;
    topModel: string | null;
  };
  failedLogins24h: number;
  recentSecurityEvents: SecurityEvent[];
  lastBackupAt: number | null;
  realtime: { liveBattles: number; connections: number };
  storage: { configured: boolean; bucket: string | null };
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
  backup_created: 'Created Backup',
  request_deleted: 'Deleted Request',
  announcement_edited: 'Edited Announcement',
  announcement_deleted: 'Deleted Announcement',
  question_bank_deleted: 'Deleted Bank Question',
};

function formatDate(ts: number): string {
  if (!ts) return 'Never';
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
  storage: HardDrive,
};

const systemLabels: Record<string, string> = {
  auth: 'Authentication',
  firestore: 'Firestore',
  messaging: 'Messaging',
  ai: 'AI Services',
  storage: 'Storage',
};

const systemStatusConfig = {
  healthy: { icon: CheckCircle2, className: 'text-success bg-success/10 border-success/25 dark:bg-success/15', label: 'Healthy' },
  warning: { icon: AlertTriangle, className: 'text-warning bg-warning/10 border-warning/25 dark:bg-warning/15', label: 'Warning' },
  offline: { icon: AlertCircle, className: 'text-destructive bg-destructive/10 border-destructive/25 dark:bg-destructive/15', label: 'Offline' },
};

const quickActions = [
  { label: 'Question Bank', icon: BookOpen, href: '/executive/question-bank', color: 'text-accent bg-accent/10 group-hover:bg-accent/20' },
  { label: 'Battles', icon: Swords, href: '/executive/battles', color: 'text-primary bg-primary/10 group-hover:bg-primary/20' },
  { label: 'Requests', icon: Inbox, href: '/executive/requests', color: 'text-warning bg-warning/10 group-hover:bg-warning/20' },
  { label: 'Commanders', icon: Shield, href: '/executive/commanders', color: 'text-success bg-success/10 group-hover:bg-success/20' },
  { label: 'Settings', icon: Settings, href: '/executive/settings', color: 'text-muted-foreground bg-muted/60 group-hover:bg-muted' },
];

const battleStatusConfig: Record<string, { className: string }> = {
  live: { className: 'text-success bg-success/10 border-success/25 dark:bg-success/15' },
  finished: { className: 'text-muted-foreground border-border' },
  waiting: { className: 'text-warning bg-warning/10 border-warning/25 dark:bg-warning/15' },
  ready: { className: 'text-warning bg-warning/10 border-warning/25 dark:bg-warning/15' },
  starting: { className: 'text-warning bg-warning/10 border-warning/25 dark:bg-warning/15' },
  paused: { className: 'text-muted-foreground bg-muted/50 border-border' },
  cancelled: { className: 'text-destructive bg-destructive/10 border-destructive/25 dark:bg-destructive/15' },
};

const requestStatusColor: Record<string, string> = {
  pending: 'bg-warning',
  approved: 'bg-success',
  completed: 'bg-muted-foreground/50',
  rejected: 'bg-destructive',
};

export default function ExecutiveWorkspacePage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter();
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const [recentNotifications, setRecentNotifications] = useState<Array<{ id: string; type: string; title: string; createdAt: number }>>([]);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

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
        setCheckedAt(Date.now());
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

  const totalWarnings = stats
    ? Object.values(stats.systemHealth || {}).filter(h => h.status !== 'healthy').length
    : 0;

  if (loading) {
    return (
      <div className="page-container animate-in space-y-6">
        <div className="space-y-1.5">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-32 rounded-[12px]" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full" />
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
          <div className="flex items-center gap-3">
            <h1 className="text-page-title font-headline tracking-tight">Mission Control</h1>
            {totalWarnings > 0 && (
              <Badge variant="outline" className="gap-1 border-warning/30 text-warning bg-warning/10 dark:bg-warning/15">
                <AlertTriangle className="w-3 h-3" />
                {totalWarnings} issue{totalWarnings > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <p className="text-base text-muted-foreground">
            Real-time platform health, activity, and intelligence.
            {checkedAt && <span className="ml-2 text-xs text-muted-foreground/60">Last checked {formatDate(checkedAt)}</span>}
          </p>
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
            className="group flex items-center gap-2 px-4 py-3 rounded-[12px] border border-border/60 hover:border-primary/30 hover:bg-accent/30 hover:shadow-elevation-hover transition-all duration-300 ease-out text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div className={cn('w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 transition-transform duration-300 ease-out group-hover:scale-110', action.color)}>
              <action.icon className="w-4 h-4" />
            </div>
            {action.label}
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground transition-transform duration-300 ease-out group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>

      {/* Primary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-live="polite" aria-label="Platform statistics">
        <StatCard icon={Users} label="Total Users" value={stats?.totalUsers ?? 0} sub={`${stats?.executives ?? 0} exec, ${stats?.commanders ?? 0} cmd, ${stats?.gladiators ?? 0} glad`} color="text-primary" tileClass="bg-primary/10 group-hover/card:bg-primary/15" />
        <StatCard icon={BookOpen} label="Question Bank" value={stats?.questionBank ?? 0} sub={`${stats?.questionsImported ?? 0} AI-imported · ${stats?.questionsAddedThisWeek ?? 0} this week`} color="text-accent" tileClass="bg-accent/15 group-hover/card:bg-accent/25" />
        <StatCard icon={Swords} label="Total Battles" value={stats?.battles ?? 0} sub={`${stats?.completedBattles ?? 0} completed, ${stats?.activeBattles ?? 0} active`} color="text-success" tileClass="bg-success/10 group-hover/card:bg-success/15" />
        <StatCard icon={Inbox} label="Pending Requests" value={stats?.unreadRequests ?? 0} sub="awaiting executive review" color="text-warning" tileClass="bg-warning/15 group-hover/card:bg-warning/25" />
      </div>

      {/* Realtime strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniStat icon={Activity} label="Live Battles" value={stats?.realtime?.liveBattles ?? 0} />
        <MiniStat icon={Wifi} label="Live Connections" value={stats?.realtime?.connections ?? 0} />
        <MiniStat icon={Award} label="Avg Score" value={stats?.averageBattleScore ?? 0} />
        <MiniStat icon={Timer} label="Avg Duration" value={`${stats?.averageBattleDuration ?? 0}m`} />
      </div>

      {/* Analytics Mini Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
        <MiniStat icon={Calendar} label="Battles Today" value={stats?.battlesToday ?? 0} />
        <MiniStat icon={TrendingUp} label="This Week" value={stats?.battlesThisWeek ?? 0} />
        <MiniStat icon={User} label="New Today" value={stats?.newUsersToday ?? 0} />
        <MiniStat icon={Users} label="New Week" value={stats?.newUsersThisWeek ?? 0} />
        <MiniStat icon={Zap} label="AI Questions" value={stats?.questionsImported ?? 0} />
        <MiniStat icon={Cpu} label="AI Success" value={stats?.aiSummary?.successRate != null ? `${stats.aiSummary.successRate}%` : 'N/A'} />
        <MiniStat icon={PlayCircle} label="Active Cmdrs" value={stats?.activeCommanders ?? 0} />
        <MiniStat icon={BarChart3} label="Failed Logins 24h" value={stats?.failedLogins24h ?? 0} />
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
            <Button variant="ghost" size="sm" onClick={() => router.push('/executive/battles')}>
              View All <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            {stats?.recentBattles && stats.recentBattles.length > 0 ? (
              <div className="space-y-1">
                {stats.recentBattles.map(battle => (
                  <button
                    key={battle.id}
                    type="button"
                    onClick={() => router.push(`/executive/battles/${battle.id}`)}
                    className="group flex items-center justify-between w-full text-left p-3 rounded-[12px] bg-muted/30 hover:bg-muted/50 hover:shadow-elevation-small transition-all duration-300 ease-out cursor-pointer border border-transparent hover:border-border/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors duration-300">{battle.title}</p>
                      <p className="text-xs text-muted-foreground">{battle.commanderName} · {battle.participantCount} participants</p>
                    </div>
                    <Badge variant="outline" className={cn('text-[10px] ml-2', battleStatusConfig[battle.status]?.className)}>
                      {battle.status}
                    </Badge>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState icon={Swords} title="No Battles Yet" description="Battles created by commanders will appear here." />
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
                  <button
                    key={req.id}
                    type="button"
                    onClick={() => router.push('/executive/requests')}
                    className="group flex items-center justify-between w-full text-left p-3 rounded-[12px] bg-muted/30 hover:bg-muted/50 hover:shadow-elevation-small transition-all duration-300 ease-out cursor-pointer border border-transparent hover:border-border/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors duration-300">{req.title}</p>
                      <p className="text-xs text-muted-foreground">{req.commanderName} · {formatDate(req.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <div className={cn('w-1.5 h-1.5 rounded-full', requestStatusColor[req.status] || 'bg-muted-foreground/50')} />
                      <span className="text-[10px] font-medium capitalize text-muted-foreground">{req.status}</span>
                    </div>
                  </button>
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
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => router.push('/executive/notifications')}
                    className="group flex items-start gap-3 w-full text-left p-2.5 rounded-[10px] hover:bg-muted/30 hover:shadow-elevation-small transition-all duration-300 ease-out cursor-pointer border border-transparent hover:border-border/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <div className="shrink-0 w-8 h-8 rounded-[10px] bg-primary/10 flex items-center justify-center">
                      <Bell className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate group-hover:text-primary transition-colors duration-300">{n.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(n.createdAt)}</p>
                    </div>
                  </button>
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
                    <button
                      key={cmd.uid}
                      type="button"
                      onClick={() => router.push(`/executive/commanders/${cmd.uid}`)}
                      className="group flex items-center justify-between w-full text-left p-2.5 rounded-[10px] hover:bg-muted/30 hover:shadow-elevation-small transition-all duration-300 ease-out cursor-pointer border border-transparent hover:border-border/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center group-hover:scale-105 transition-transform duration-300 ease-out">
                          <Shield className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium group-hover:text-primary transition-colors duration-300">{cmd.name}</p>
                          <p className="text-xs text-muted-foreground">{cmd.arenaCount} arenas created</p>
                        </div>
                      </div>
                      {cmd.disabled && <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive bg-destructive/5">Disabled</Badge>}
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Shield} title="No Active Commanders" description="Commanders will appear here once they create arenas." />
              )}
            </CardContent>
          </Card>

          {/* AI Status */}
          <Card className="card-hover">
            <CardHeader className="border-b border-border/30 pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-primary" />
                AI Services
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <DbStat label="Requests (30d)" value={stats?.aiSummary?.total ?? 0} />
                <DbStat label="Success Rate" value={stats?.aiSummary?.successRate != null ? `${stats.aiSummary.successRate}%` : 'N/A'} />
                <DbStat label="Avg Duration" value={stats?.aiSummary?.avgDurationMs ? `${Math.round(stats.aiSummary.avgDurationMs / 1000)}s` : '—'} />
              </div>
              {stats?.aiSummary?.topModel && (
                <p className="text-xs text-muted-foreground">Most used model: <span className="font-mono text-foreground/80">{stats.aiSummary.topModel}</span></p>
              )}
              {stats?.latestAiFailures && stats.latestAiFailures.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Recent failures</p>
                  {stats.latestAiFailures.slice(0, 4).map(f => (
                    <div key={`${f.id}-${f.createdAt}`} className="flex items-start gap-2 p-2.5 rounded-[10px] bg-destructive/5 border border-destructive/20">
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{f.model}</p>
                        {f.error && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{f.error}</p>}
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{formatDate(f.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : stats?.aiSummary && stats.aiSummary.total > 0 ? (
                <EmptyState icon={CheckCircle2} title="No Recent Failures" description="All recent AI requests succeeded." />
              ) : null}
            </CardContent>
          </Card>
        </div>

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
                      executive: 'bg-primary/10 text-primary border-primary/25 dark:bg-primary/20',
                      commander: 'bg-accent/15 text-accent border-accent/30 dark:bg-accent/20',
                      gladiator: 'bg-success/10 text-success border-success/25 dark:bg-success/20',
                    };
                    return (
                      <div key={activity.id} className="group flex items-start gap-3 py-2.5 border-b border-border/20 last:border-0 hover:bg-muted/20 -mx-1 px-1 rounded-[8px] transition-colors duration-300 ease-out">
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
                              roleColors[activity.actorRole] || 'bg-muted/60 text-muted-foreground border-border'
                            )}>
                              {activity.actorRole}
                            </span>
                          </div>
                          <p className="text-sm mt-0.5 group-hover:text-foreground transition-colors duration-300">
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

          {/* Security Status */}
          <Card className="card-hover">
            <CardHeader className="border-b border-border/30 pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-primary" />
                Security
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between p-3 rounded-[12px] bg-muted/30">
                <span className="text-sm font-medium">Failed logins (24h)</span>
                <span className={cn('text-lg font-bold tabular-nums', (stats?.failedLogins24h ?? 0) > 10 ? 'text-destructive' : 'text-success')}>
                  <AnimatedValue value={stats?.failedLogins24h ?? 0} />
                </span>
              </div>
              {stats?.recentSecurityEvents && stats.recentSecurityEvents.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Recent events</p>
                  {stats.recentSecurityEvents.slice(0, 4).map(evt => (
                    <div key={evt.id} className="flex items-start gap-2 p-2.5 rounded-[10px] bg-muted/30 hover:bg-muted/50 transition-colors duration-300 ease-out">
                      {evt.event === 'login_failed'
                        ? <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                        : <ShieldAlert className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium">{evt.event?.replace(/_/g, ' ') || 'Security event'}</p>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                          {evt.actor || evt.target || evt.detail || '—'}
                          {evt.timestamp ? ` · ${formatDate(evt.timestamp)}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={ShieldAlert} title="No Security Events" description="No recent security events recorded." />
              )}
              <Button variant="outline" size="sm" className="w-full" onClick={() => router.push('/executive/security-logs')}>
                View Security Logs <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </CardContent>
          </Card>

          {/* System Health (interactive cards) */}
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
                  const expanded = expandedService === key;
                  return (
                    <div key={key} className="border border-border/50 rounded-[12px] overflow-hidden">
                      <button
                        onClick={() => setExpandedService(expanded ? null : key)}
                        aria-expanded={expanded}
                        className="group flex items-center justify-between w-full p-3 hover:bg-muted/30 transition-all duration-300 ease-out text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-[8px] bg-background flex items-center justify-center">
                            <Icon className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors duration-300" />
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
                          <ChevronRight className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform duration-300 ease-out', expanded && 'rotate-90')} />
                        </div>
                      </button>
                      {expanded && (
                        <div className="px-3 pb-3 pt-1 text-xs text-muted-foreground space-y-1.5 bg-muted/20 border-t border-border/40">
                          <p className="flex justify-between"><span>Status</span><span className="font-medium capitalize">{health.status}</span></p>
                          {health.latency !== undefined && (
                            <p className="flex justify-between"><span>Latency</span><span className="font-mono">{health.latency}ms</span></p>
                          )}
                          <p className="flex justify-between"><span>Checked</span><span className="font-mono">{checkedAt ? formatDate(checkedAt) : '—'}</span></p>
                          <p className="text-[10px] leading-relaxed pt-1">
                            {health.status === 'healthy'
                              ? 'Service is reachable and responding normally.'
                              : health.status === 'warning'
                                ? 'Service is degraded or partially configured. Verify credentials and environment variables.'
                                : 'Service is unreachable. Check the Firestore/Auth configuration and network access.'}
                          </p>
                        </div>
                      )}
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
            <CardContent className="pt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <DbStat label="Users" value={stats?.totalUsers ?? 0} />
                <DbStat label="Questions" value={stats?.questionBank ?? 0} />
                <DbStat label="Battles" value={stats?.battles ?? 0} />
                <DbStat label="Messages" value={stats?.messages ?? 0} />
                <DbStat label="Announcements" value={stats?.announcements ?? 0} />
                <DbStat label="Conversations" value={stats?.conversations ?? 0} />
                <DbStat label="Requests" value={stats?.unreadRequests ?? 0} />
                <DbStat label="AI Requests" value={stats?.aiSummary?.total ?? 0} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-[12px] bg-muted/30">
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Last Backup</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">{stats?.lastBackupAt ? formatDate(stats.lastBackupAt) : 'Never'}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-[12px] bg-muted/30">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Storage</span>
                </div>
                <div className="text-right">
                  {stats?.storage?.configured ? (
                    <>
                      <p className="text-xs font-medium text-success">Configured</p>
                      <p className="text-[10px] font-mono text-muted-foreground max-w-[180px] truncate">{stats.storage.bucket}</p>
                    </>
                  ) : (
                    <p className="text-xs font-medium text-warning">Not configured</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color, tileClass }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  tileClass?: string;
}) {
  return (
    <Card className="group/card card-hover shadow-elevation-small hover:shadow-elevation-medium">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-2xl font-bold tabular-nums"><AnimatedValue value={value} /></p>
            <p className="text-sm text-muted-foreground">{label}</p>
            {sub && <p className="text-xs text-muted-foreground/70">{sub}</p>}
          </div>
          <div className={cn("w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 transition-all duration-300 ease-out group-hover/card:scale-110 group-hover/card:shadow-sm", tileClass || 'bg-muted/60')}>
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
        <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300 ease-out">
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
    <div className="group flex items-center justify-between p-2.5 rounded-[10px] bg-muted/30 hover:bg-muted/50 border border-transparent hover:border-border/50 transition-all duration-300 ease-out">
      <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors duration-300">{label}</span>
      <span className="text-sm font-semibold tabular-nums"><AnimatedValue value={value} /></span>
    </div>
  );
}
