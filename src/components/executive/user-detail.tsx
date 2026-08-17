'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useRouter } from 'next/navigation';
import {
  Shield, Users, ShieldAlert, Bell, BrainCircuit, Activity,
  ChevronRight, Swords, Inbox, Mail, Calendar, AlertTriangle,
  RefreshCw, Gamepad2, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface UserDetailProfile {
  uid: string;
  name: string;
  email: string | null;
  avatar: string | null;
  role: string;
  disabled?: boolean;
  deleted?: boolean;
  createdAt?: number | null;
  lastActive?: number | null;
  authDisabled?: boolean;
  authExists?: boolean;
  lastLoginAt?: string | null;
  auditTrail: Array<{ id: string; timestamp?: number; actor?: string; actorRole?: string; action?: string; target?: string; metadata?: Record<string, unknown> }>;
  securityEvents: Array<{ id: string; event?: string; actor?: string; target?: string | null; detail?: string | null; timestamp?: number | null }>;
  notifications: Array<{ id: string; type?: string; title?: string; description?: string; read?: boolean; createdAt?: number | null; link?: string | null }>;
  aiLogs: Array<{ id: string; model?: string; success?: boolean; questionCount?: number; createdAt?: number | null; error?: string | null }>;
  battleLogs: Array<{ id: string; quizId?: string; event?: string; timestamp?: number | null; metadata?: Record<string, unknown> }>;
  conversations: Array<{ id: string; participants?: string[]; lastMessage?: string | null; messageCount?: number; lastActivity?: number | null }>;
  arenas?: Array<{ id: string; title?: string; status?: string; createdAt?: number; finishedAt?: number; participantCount?: number; questionCount?: number; difficulty?: string }>;
  arenaStats?: { total?: number; active?: number; waiting?: number; paused?: number; finished?: number; totalParticipants?: number };
  requests?: Array<{ id: string; title?: string; type?: string; status?: string; createdAt?: number }>;
  questionCount?: number | null;
  battles?: Array<{ id: string; title?: string; status?: string; difficulty?: string; score?: number; participantStatus?: string; finishedAt?: number; createdAt?: number; createdBy?: string | null }>;
  battleStats?: { battlesPlayed?: number; bestScore?: number; averageScore?: number; accuracy?: number | null; answersRecorded?: number };
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

function formatDate(ts?: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

const roleColors: Record<string, string> = {
  executive: 'bg-primary/10 text-primary border-primary/25 dark:bg-primary/20',
  commander: 'bg-accent/15 text-accent border-accent/30 dark:bg-accent/20',
  gladiator: 'bg-success/10 text-success border-success/25 dark:bg-success/20',
};

const arenaStatusBadge: Record<string, string> = {
  live: 'border-success/30 text-success bg-success/10 dark:bg-success/20',
  finished: 'border-border/60 text-muted-foreground bg-muted/30',
  waiting: 'border-warning/30 text-warning bg-warning/10 dark:bg-warning/20',
  ready: 'border-warning/30 text-warning bg-warning/10 dark:bg-warning/20',
  starting: 'border-warning/30 text-warning bg-warning/10 dark:bg-warning/20',
  paused: 'border-border/60 text-muted-foreground bg-muted/40',
};

export default function UserDetail({ uid, expectedRole }: { uid: string; expectedRole?: string }) {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter();
  const [profile, setProfile] = useState<UserDetailProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`/api/executive/users/${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile || null);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to load user profile.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [auth, uid]);

  useEffect(() => {
    if (!user) return;
    fetchProfile();
  }, [user, fetchProfile]);

  if (loading) {
    return (
      <div className="page-container animate-in space-y-6">
        <div className="space-y-1.5">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="page-container animate-in space-y-4 safe-bottom">
        <Card className="border-destructive/40">
          <CardContent className="py-16 text-center">
            <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-4" />
            <p className="text-base font-medium mb-1">Failed to load user</p>
            <p className="text-sm text-muted-foreground mb-4">{error || 'User not found.'}</p>
            <Button onClick={fetchProfile}><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const role = profile.role || 'unknown';
  const isCommander = role === 'commander';
  const isGladiator = role === 'gladiator';

  return (
    <div className="page-container animate-in space-y-6 safe-bottom">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {profile.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar} alt={profile.name} className="w-12 h-12 rounded-[14px] object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-[14px] bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
              {isCommander ? <Shield className="w-6 h-6 text-primary" /> : isGladiator ? <Users className="w-6 h-6 text-primary" /> : <User className="w-6 h-6 text-primary" />}
            </div>
          )}
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-page-title font-headline tracking-tight">{profile.name}</h1>
              <Badge variant="outline" className={cn('text-[10px] h-5 font-normal capitalize', roleColors[role])}>
                {role}
              </Badge>
              {profile.deleted && <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive bg-destructive/5">Deleted</Badge>}
              {(profile.disabled || profile.authDisabled) && <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive bg-destructive/5">Disabled</Badge>}
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              {profile.email && <><Mail className="w-3.5 h-3.5" />{profile.email}</>}
              {!profile.authExists && profile.authExists !== undefined && (
                <span className="text-warning flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> no auth record</span>
              )}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={fetchProfile} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Meta strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetaTile icon={Calendar} label="Joined" value={formatDate(typeof profile.createdAt === 'number' ? profile.createdAt : profile.createdAt as unknown as number)} />
        <MetaTile icon={Activity} label="Last Active" value={formatDate(typeof profile.lastActive === 'number' ? profile.lastActive : profile.lastActive as unknown as number)} />
        <MetaTile icon={Shield} label="Last Login" value={profile.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString() : '—'} />
        <MetaTile icon={Bell} label="Notifications" value={String(profile.notifications?.length ?? 0)} />
      </div>

      {isCommander && (
        <>
          {/* Commander stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatTile label="Arenas" value={profile.arenaStats?.total ?? 0} />
            <StatTile label="Active" value={profile.arenaStats?.active ?? 0} />
            <StatTile label="Waiting" value={profile.arenaStats?.waiting ?? 0} />
            <StatTile label="Finished" value={profile.arenaStats?.finished ?? 0} />
            <StatTile label="Paused" value={profile.arenaStats?.paused ?? 0} />
            <StatTile label="Total Participants" value={profile.arenaStats?.totalParticipants ?? 0} />
          </div>

          {/* Arenas */}
          <Card className="card-hover">
            <CardHeader className="border-b border-border/30 pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Swords className="w-4 h-4 text-primary" /> Arenas Created
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {profile.arenas && profile.arenas.length > 0 ? (
                <div className="space-y-1">
                  {profile.arenas.slice(0, 30).map(arena => (
                    <button key={arena.id} type="button" onClick={() => router.push(`/executive/battles/${arena.id}`)} className="group w-full flex items-center justify-between p-3 rounded-[12px] bg-muted/30 hover:bg-muted/50 hover:shadow-elevation-small transition-all duration-300 ease-out cursor-pointer border border-transparent hover:border-border/50 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors duration-300">{arena.title || 'Untitled Battle'}</p>
                        <p className="text-xs text-muted-foreground">
                          {arena.participantCount ?? 0} participants · {arena.questionCount ?? 0} questions · {arena.difficulty || 'medium'} · created {formatDate(arena.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <Badge variant="outline" className={cn('text-[10px]', arenaStatusBadge[arena.status || ''])}>{arena.status || 'unknown'}</Badge>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Swords} title="No Arenas" description="This commander has not created any arenas." />
              )}
            </CardContent>
          </Card>

          {/* Requests */}
          <Card className="card-hover">
            <CardHeader className="border-b border-border/30 pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Inbox className="w-4 h-4 text-primary" /> Requests Submitted
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {profile.requests && profile.requests.length > 0 ? (
                <div className="space-y-1">
                  {profile.requests.slice(0, 20).map(req => (
                    <button key={req.id} type="button" onClick={() => router.push('/executive/requests')} className="group w-full flex items-center justify-between p-3 rounded-[12px] bg-muted/30 hover:bg-muted/50 transition-all duration-300 ease-out cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{req.title || 'Untitled Request'}</p>
                        <p className="text-xs text-muted-foreground">{req.type?.replace(/_/g, ' ')} · {formatDate(req.createdAt)}</p>
                      </div>
                      <span className="text-[10px] font-medium capitalize text-muted-foreground ml-2">{req.status || 'pending'}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Inbox} title="No Requests" description="This commander has not submitted any requests." />
              )}
            </CardContent>
          </Card>
        </>
      )}

      {isGladiator && (
        <>
          {/* Gladiator stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <StatTile label="Battles Played" value={profile.battleStats?.battlesPlayed ?? 0} />
            <StatTile label="Best Score" value={profile.battleStats?.bestScore ?? 0} />
            <StatTile label="Average Score" value={profile.battleStats?.averageScore ?? 0} />
            <StatTile label="Accuracy" value={profile.battleStats?.accuracy != null ? `${profile.battleStats.accuracy}%` : '—'} />
            <StatTile label="Answers Recorded" value={profile.battleStats?.answersRecorded ?? 0} />
          </div>

          {/* Battle history */}
          <Card className="card-hover">
            <CardHeader className="border-b border-border/30 pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-primary" /> Battle History
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {profile.battles && profile.battles.length > 0 ? (
                <div className="space-y-1">
                  {profile.battles.slice(0, 30).map(battle => (
                    <button key={battle.id} type="button" onClick={() => router.push(`/executive/battles/${battle.id}`)} className="group w-full flex items-center justify-between p-3 rounded-[12px] bg-muted/30 hover:bg-muted/50 hover:shadow-elevation-small transition-all duration-300 ease-out cursor-pointer border border-transparent hover:border-border/50 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors duration-300">{battle.title || 'Untitled Battle'}</p>
                        <p className="text-xs text-muted-foreground">
                          {battle.difficulty || 'medium'} · {formatDate(battle.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-sm font-bold tabular-nums">{battle.score ?? 0}</span>
                        <Badge variant="outline" className={cn('text-[10px]', arenaStatusBadge[battle.status || ''])}>{battle.status || 'unknown'}</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Gamepad2} title="No Battles Played" description="This gladiator has not played any battles." />
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Logs grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Audit trail */}
        <Card className="card-hover">
          <CardHeader className="border-b border-border/30 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Audit Trail
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {profile.auditTrail.length > 0 ? (
              <div className="space-y-1 max-h-80 overflow-y-auto custom-scrollbar -mx-1 px-1">
                {profile.auditTrail.slice(0, 30).map(entry => (
                  <div key={entry.id} className="group flex items-start gap-3 py-2 border-b border-border/20 last:border-0">
                    <div className="shrink-0 w-8 h-8 rounded-[10px] bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                      <Activity className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium capitalize">{entry.actorRole || 'user'}</span>
                        {' '}{actionLabels[entry.action || ''] || (entry.action || 'action').replace(/_/g, ' ')}
                        {entry.target && <span className="text-muted-foreground"> → {entry.target}</span>}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono">{formatDate(entry.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Activity} title="No Audit Entries" description="No audit entries for this user yet." />
            )}
          </CardContent>
        </Card>

        {/* Security + AI + battle logs */}
        <div className="space-y-6">
          <Card className="card-hover">
            <CardHeader className="border-b border-border/30 pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-primary" /> Security Events
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {profile.securityEvents.length > 0 ? (
                <div className="space-y-1">
                  {profile.securityEvents.slice(0, 10).map(evt => (
                    <div key={evt.id} className="flex items-start gap-2 p-2.5 rounded-[10px] bg-muted/30">
                      <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium">{evt.event?.replace(/_/g, ' ') || 'Event'}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {evt.detail || evt.target || '—'} · {formatDate(evt.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={ShieldAlert} title="No Security Events" description="No security events recorded for this user." />
              )}
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader className="border-b border-border/30 pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-primary" /> AI Requests
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {profile.aiLogs.length > 0 ? (
                <div className="space-y-1">
                  {profile.aiLogs.slice(0, 10).map(log => (
                    <div key={log.id} className="flex items-start gap-2 p-2.5 rounded-[10px] bg-muted/30">
                      <BrainCircuit className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium">{log.model || 'AI'} · <span className={log.success ? 'text-success' : 'text-destructive'}>{log.success ? 'success' : 'failed'}</span></p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {log.questionCount ? `${log.questionCount} questions · ` : ''}{formatDate(log.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={BrainCircuit} title="No AI Requests" description="No AI requests by this user." />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetaTile({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <Card className="card-hover">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-semibold truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="card-hover">
      <CardContent className="p-4 text-center">
        <p className="text-xl font-bold tabular-nums">{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}
