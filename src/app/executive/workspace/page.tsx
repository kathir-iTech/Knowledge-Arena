'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users, Shield, User, BookOpen, Layers, Swords, MessageSquare,
  Megaphone, Inbox, Activity, Database, Wifi, BrainCircuit,
  CheckCircle2, AlertTriangle, AlertCircle, Clock, TrendingUp,
  Calendar, Star, Award, Zap, PlayCircle, FlaskConical, Bell, BellOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SystemHealth {
  [key: string]: { status: 'healthy' | 'warning' | 'offline'; latency?: number };
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
  questionSets: number;
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
  mostUsedQuestionSet: { id: string; name: string; usageCount: number } | null;
  averageBattleScore: number;
  averageBattleDuration: number;
  messages: number;
  conversations: number;
  announcements: number;
  unreadRequests: number;
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
  question_set_created: 'Created Question Set',
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

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

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

export default function ExecutiveWorkspacePage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const { toast } = useToast();
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [recentNotifications, setRecentNotifications] = useState<Array<{ id: string; type: string; title: string; createdAt: number }>>([]);

  const fetchStats = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/executive/workspace', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchStats();
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
    fetchNotifs();
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container animate-in space-y-6 safe-bottom">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-page-title font-headline tracking-tight">Workspace</h1>
          <p className="text-base text-muted-foreground">Platform overview, analytics, and system health.</p>
        </div>
        <Button variant="outline" onClick={handleGenerateDemo} disabled={generating}>
          <FlaskConical className="w-4 h-4 mr-2" />
          {generating ? 'Generating...' : 'Generate Demo Workspace'}
        </Button>
      </div>

      {/* Primary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total Users" value={stats?.totalUsers ?? 0} sub={`${stats?.executives ?? 0} exec, ${stats?.commanders ?? 0} cmd, ${stats?.gladiators ?? 0} glad`} color="text-blue-600" />
        <StatCard icon={BookOpen} label="Question Bank" value={stats?.questionBank ?? 0} sub={`${stats?.questionsImported ?? 0} AI-imported`} color="text-amber-600" />
        <StatCard icon={Swords} label="Total Battles" value={stats?.battles ?? 0} sub={`${stats?.completedBattles ?? 0} completed, ${stats?.activeBattles ?? 0} active`} color="text-rose-600" />
        <StatCard icon={Inbox} label="Pending Requests" value={stats?.unreadRequests ?? 0} color="text-orange-600" />
      </div>

      {/* Analytics Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniStat icon={Calendar} label="Battles Today" value={stats?.battlesToday ?? 0} />
        <MiniStat icon={TrendingUp} label="Battles This Week" value={stats?.battlesThisWeek ?? 0} />
        <MiniStat icon={User} label="New Users Today" value={stats?.newUsersToday ?? 0} />
        <MiniStat icon={Users} label="New Users This Week" value={stats?.newUsersThisWeek ?? 0} />
        <MiniStat icon={Zap} label="AI Questions" value={stats?.aiGeneratedQuestions ?? 0} />
        <MiniStat icon={Award} label="Avg Battle Score" value={stats?.averageBattleScore ?? 0} />
        <MiniStat icon={Clock} label="Avg Duration" value={`${stats?.averageBattleDuration ?? 0}m`} />
        <MiniStat icon={PlayCircle} label="Active Commanders" value={stats?.activeCommanders ?? 0} />
      </div>

      {/* Most Active / Most Used */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <Star className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Most Active Commander</p>
              <p className="font-semibold">{stats?.mostActiveCommander?.name || 'N/A'}</p>
              {stats?.mostActiveCommander && (
                <p className="text-xs text-muted-foreground">{stats.mostActiveCommander.arenaCount} arenas created</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <Layers className="w-5 h-5 text-indigo-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Most Used Question Set</p>
              <p className="font-semibold">{stats?.mostUsedQuestionSet?.name || 'N/A'}</p>
              {stats?.mostUsedQuestionSet && (
                <p className="text-xs text-muted-foreground">Used in {stats.mostUsedQuestionSet.usageCount} battles</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              <div className="space-y-0 max-h-[400px] overflow-y-auto">
                {stats.recentActivity.slice(0, 20).map(activity => (
                  <div key={activity.id} className="flex items-start gap-3 py-2.5 border-b border-border/30 last:border-0">
                    <div className="shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground font-mono">
                          {formatTimestamp(activity.timestamp)}
                        </span>
                        <Badge variant="outline" className="text-[10px] h-5">
                          {activity.actorRole}
                        </Badge>
                      </div>
                      <p className="text-sm mt-0.5">
                        <span className="font-medium">{activity.actor?.slice(0, 16)}</span>
                        {' '}{actionLabels[activity.action] || activity.action.replace(/_/g, ' ')}
                      </p>
                      {activity.target && (
                        <p className="text-xs text-muted-foreground truncate">{activity.target}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{formatDate(activity.timestamp)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No recent activity recorded.</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Recent Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Recent Notifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentNotifications.length > 0 ? (
                <div className="space-y-2">
                  {recentNotifications.map(n => (
                    <div key={n.id} className="flex items-start gap-2 text-sm">
                      <Bell className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm truncate">{n.title}</p>
                        <p className="text-[10px] text-muted-foreground">{formatDate(n.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-4 text-muted-foreground">
                  <BellOff className="w-6 h-6" />
                  <p className="text-sm">No notifications</p>
                </div>
              )}
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
                <DbStat label="Question Sets" value={stats?.questionSets ?? 0} />
                <DbStat label="Battles" value={stats?.battles ?? 0} />
                <DbStat label="Messages" value={stats?.messages ?? 0} />
                <DbStat label="Announcements" value={stats?.announcements ?? 0} />
                <DbStat label="Conversations" value={stats?.conversations ?? 0} />
                <DbStat label="Requests" value={(stats?.unreadRequests ?? 0)} />
              </div>
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
              <div className="space-y-3">
                {Object.entries(stats?.systemHealth || {}).map(([key, health]) => {
                  const Icon = systemIcons[key] || Activity;
                  const cfg = systemStatusConfig[health.status] || systemStatusConfig.offline;
                  const StatusIcon = cfg.icon;
                  return (
                    <div key={key} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{systemLabels[key] || key}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {health.latency !== undefined && (
                          <span className="text-[10px] text-muted-foreground font-mono">{health.latency}ms</span>
                        )}
                        <Badge variant="outline" className={cn("gap-1", cfg.className)}>
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
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-[8px] bg-muted flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-lg font-bold leading-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
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
