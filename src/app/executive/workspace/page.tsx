'use client';

import React, { useState, useEffect } from 'react';
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
  Calendar, Star, Award, Zap, PlayCircle, FlaskConical, Bell, BellOff,
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
  const [generating, setGenerating] = useState(false);
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

  const handleGenerateDemo = async () => {
    setGenerating(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/executive/demo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Generation failed' }));
        toast({ variant: 'destructive', title: 'Error', description: err.error });
        return;
      }
      toast({ variant: 'success', title: 'Demo Workspace Generated', description: 'Sample data has been created. Refreshing...' });
      fetchStats();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to generate demo data.' });
    } finally {
      setGenerating(false);
    }
  };

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
          <Button variant="outline" onClick={handleGenerateDemo} disabled={generating}>
            <FlaskConical className="w-4 h-4 mr-2" />
            {generating ? 'Generating...' : 'Generate Demo'}
          </Button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        {quickActions.map(action => (
          <button
            key={action.label}
            onClick={() => router.push(action.href)}
            className="flex items-center gap-2 px-4 py-3 rounded-[10px] border border-border hover:border-primary/30 hover:bg-accent/30 transition-colors text-sm font-medium"
          >
            <div className={cn('w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0', action.color)}>
              <action.icon className="w-4 h-4" />
            </div>
            {action.label}
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        ))}
      </div>

      {/* Primary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Swords className="w-4 h-4" />
              Recent Battles
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => router.push('/create-quiz')}>
              <Plus className="w-3.5 h-3.5 mr-1" /> New
            </Button>
          </CardHeader>
          <CardContent>
            {stats?.recentBattles && stats.recentBattles.length > 0 ? (
              <div className="space-y-2">
                {stats.recentBattles.map(battle => (
                  <div key={battle.id} onClick={() => router.push(`/commander/edit-arena/${battle.id}`)} className="flex items-center justify-between p-3 rounded-[10px] bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{battle.title}</p>
                      <p className="text-xs text-muted-foreground">{battle.commanderName} · {battle.participantCount} participants</p>
                    </div>
                    <Badge variant="outline" className={cn(
                      'text-[10px] ml-2',
                      battle.status === 'live' && 'border-emerald-300 text-emerald-600',
                      battle.status === 'finished' && 'border-slate-300 text-slate-600',
                      battle.status === 'waiting' && 'border-amber-300 text-amber-600',
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Inbox className="w-4 h-4" />
              Recent Requests
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => router.push('/executive/requests')}>
              View All <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {stats?.recentRequests && stats.recentRequests.length > 0 ? (
              <div className="space-y-2">
                {stats.recentRequests.map(req => (
                  <div key={req.id} onClick={() => router.push('/executive/requests')} className="flex items-center justify-between p-3 rounded-[10px] bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{req.title}</p>
                      <p className="text-xs text-muted-foreground">{req.commanderName} · {formatDate(req.createdAt)}</p>
                    </div>
                    <Badge variant="outline" className={cn(
                      'text-[10px] ml-2',
                      req.status === 'pending' && 'border-amber-300 text-amber-600',
                      req.status === 'approved' && 'border-emerald-300 text-emerald-600',
                      req.status === 'completed' && 'border-slate-300 text-slate-600',
                      req.status === 'rejected' && 'border-red-300 text-red-600',
                    )}>
                      {req.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Inbox} title="No Requests" description="Requests from commanders will appear here." />
            )}
          </CardContent>
        </Card>

        {/* Recent Notifications */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Recent Notifications
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => router.push('/executive/notifications')}>
              View All <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentNotifications.length > 0 ? (
              <div className="space-y-2">
                {recentNotifications.map(n => (
                  <div key={n.id} onClick={() => router.push('/executive/notifications')} className="flex items-start gap-3 p-2 rounded-[8px] hover:bg-muted/30 transition-colors cursor-pointer">
                    <Bell className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm truncate">{n.title}</p>
                      <p className="text-[10px] text-muted-foreground">{formatDate(n.createdAt)}</p>
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Active Commanders
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => router.push('/executive/commanders')}>
                Manage <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </CardHeader>
            <CardContent>
              {stats?.activeCommandersList && stats.activeCommandersList.length > 0 ? (
                <div className="space-y-2">
                  {stats.activeCommandersList.slice(0, 5).map(cmd => (
                    <div key={cmd.uid} onClick={() => router.push('/executive/commanders')} className="flex items-center justify-between p-2 rounded-[8px] hover:bg-muted/30 transition-colors cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                          <Shield className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{cmd.name}</p>
                          <p className="text-xs text-muted-foreground">{cmd.arenaCount} arenas created</p>
                        </div>
                      </div>
                      {cmd.disabled && <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">Disabled</Badge>}
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
            <Card>
              <CardContent className="p-5 flex items-center gap-3">
                <Star className="w-6 h-6 text-amber-500 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Most Active Commander</p>
                  <p className="font-semibold">{stats.mostActiveCommander.name}</p>
                  <p className="text-xs text-muted-foreground">{stats.mostActiveCommander.arenaCount} arenas created</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: Recent Activity + System Health */}
        <div className="space-y-6">
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.recentActivity && stats.recentActivity.length > 0 ? (
                <div className="space-y-0 max-h-[320px] overflow-y-auto">
                  {stats.recentActivity.slice(0, 15).map(activity => (
                    <div key={activity.id} className="flex items-start gap-3 py-2.5 border-b border-border/30 last:border-0">
                      <div className="shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {formatDate(activity.timestamp)}
                          </span>
                          <Badge variant="outline" className="text-[10px] h-5">
                            {activity.actorRole}
                          </Badge>
                        </div>
                        <p className="text-sm mt-0.5">
                          <span className="font-medium">{activity.actor?.slice(0, 16)}</span>
                          {' '}{actionLabels[activity.action] || activity.action.replace(/_/g, ' ')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Activity} title="No Recent Activity" description="Platform activity will be logged here." />
              )}
            </CardContent>
          </Card>

          {/* System Health */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wifi className="w-4 h-4" />
                System Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(stats?.systemHealth || {}).map(([key, health]) => {
                  const Icon = systemIcons[key] || Activity;
                  const cfg = systemStatusConfig[health.status] || systemStatusConfig.offline;
                  const StatusIcon = cfg.icon;
                  return (
                    <div key={key} className="flex items-center justify-between p-3 rounded-[10px] bg-muted/30">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{systemLabels[key] || key}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {health.latency !== undefined && (
                          <span className="text-[10px] text-muted-foreground font-mono">{health.latency}ms</span>
                        )}
                        <Badge variant="outline" className={cn("gap-1 text-[10px]", cfg.className)}>
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
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="w-4 h-4" />
                Database Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
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
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className={cn("w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0", color ? `${color.replace('text-', 'bg-').replace('600', '100')} dark:${color.replace('text-', 'bg-').replace('600', '950/20')}` : 'bg-muted')}>
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
    <Card>
      <CardContent className="p-3 flex items-center gap-2">
        <div className="w-8 h-8 rounded-[8px] bg-muted flex items-center justify-center shrink-0">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight">{value}</p>
          <p className="text-[10px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DbStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-[8px] bg-muted/30">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}
