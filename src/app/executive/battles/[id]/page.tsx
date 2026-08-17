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
  Swords, Trophy, Users, CheckCircle2, XCircle, Timer, Target,
  Shield, ChevronRight, AlertTriangle, RefreshCw, Activity, Clock,
  BarChart3, Award, Crown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BattleParticipant {
  userId: string;
  name: string | null;
  avatar?: string | null;
  status?: string;
  score?: number;
  violationsCount?: number;
  reconnects?: number;
  finishedAt?: number | null;
  correctCount?: number;
  answeredCount?: number;
  submissions?: Array<{ questionId: string | null; selectedOption: number | null; submittedAt: number | null }>;
}

interface BattleData {
  id: string;
  title: string;
  status: string;
  mode?: string;
  difficulty?: string;
  createdAt?: number;
  startedAt?: number;
  endedAt?: number;
  pausedAt?: number | null;
  currentQuestionIndex?: number | null;
  questionCount?: number;
  participantCount?: number;
  archived?: boolean;
  commanderId?: string | null;
  commander?: { name: string; email: string | null } | null;
  config?: Record<string, unknown>;
  questions?: Array<{
    id: string;
    text?: string;
    options?: string[];
    timer?: number | null;
    sortIndex?: number | null;
    scored?: boolean | null;
    correctAnswerIndex?: number | null;
  }>;
  participants?: BattleParticipant[];
  leaderboard?: BattleParticipant[];
  timeline?: Array<{ id: string; event?: string; actor?: string | null; actorRole?: string | null; timestamp?: number | null; metadata?: Record<string, unknown> }>;
  stats?: {
    participantCount?: number;
    finishedCount?: number;
    averageScore?: number;
    accuracy?: number | null;
    questionsAnswered?: number;
    questionsCorrect?: number;
    completionRate?: number;
  };
  winner?: BattleParticipant | null;
}

const statusBadge: Record<string, string> = {
  live: 'border-success/30 text-success bg-success/10 dark:bg-success/20',
  finished: 'border-border/60 text-muted-foreground bg-muted/30',
  waiting: 'border-warning/30 text-warning bg-warning/10 dark:bg-warning/20',
  ready: 'border-warning/30 text-warning bg-warning/10 dark:bg-warning/20',
  starting: 'border-warning/30 text-warning bg-warning/10 dark:bg-warning/20',
  paused: 'border-border/60 text-muted-foreground bg-muted/40',
  cancelled: 'border-destructive/30 text-destructive bg-destructive/10 dark:bg-destructive/20',
};

function formatDate(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

export default function ExecutiveBattleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter();
  const [battle, setBattle] = useState<BattleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    params.then(p => setId(p.id));
  }, [params]);

  const fetchBattle = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`/api/executive/battles/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBattle(data.battle || null);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to load battle details.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [auth, id]);

  useEffect(() => {
    if (!user || !id) return;
    fetchBattle();
  }, [user, id, fetchBattle]);

  if (loading) {
    return (
      <div className="page-container animate-in space-y-6">
        <div className="space-y-1.5">
          <Skeleton className="h-10 w-72 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (error || !battle) {
    return (
      <div className="page-container animate-in space-y-4 safe-bottom">
        <Card className="border-destructive/40">
          <CardContent className="py-16 text-center">
            <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-4" />
            <p className="text-base font-medium mb-1">Failed to load battle</p>
            <p className="text-sm text-muted-foreground mb-4">{error || 'Battle not found.'}</p>
            <Button onClick={fetchBattle}><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const questions = battle.questions || [];
  const participants = battle.participants || [];
  const leaderboard = (battle.leaderboard || []).map(lb => {
    const full = participants.find(p => p.userId === lb.userId);
    return full || lb;
  });

  // Per-question answer matrix
  const questionAnswers = questions.map(q => {
    const rows = participants.map(p => {
      const sub = (p.submissions || []).find(s => s.questionId === q.id);
      const correct = sub && q.correctAnswerIndex !== null && q.correctAnswerIndex !== undefined
        ? sub.selectedOption === q.correctAnswerIndex
        : null;
      return { participant: p, selected: sub?.selectedOption ?? null, correct };
    });
    const answered = rows.filter(r => r.selected !== null).length;
    const correctCount = rows.filter(r => r.correct === true).length;
    return { question: q, rows, answered, correctCount };
  });

  return (
    <div className="page-container animate-in space-y-6 safe-bottom">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-page-title font-headline tracking-tight truncate">{battle.title}</h1>
            <Badge variant="outline" className={cn('text-[10px] h-5 capitalize', statusBadge[battle.status] || '')}>
              {battle.status}
            </Badge>
            {battle.archived && <Badge variant="outline" className="text-[10px]">Archived</Badge>}
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" />
              {battle.commander ? (
                <button className="underline underline-offset-2 hover:text-primary" onClick={() => router.push(`/executive/commanders/${battle.commanderId}`)}>
                  {battle.commander.name}
                </button>
              ) : 'Unknown Commander'}
            </span>
            {battle.mode && <span>Mode: {battle.mode.replace(/_/g, ' ')}</span>}
            <span>Difficulty: {battle.difficulty || 'medium'}</span>
            <span className="font-mono text-xs">Code: {battle.id}</span>
          </p>
        </div>
        <Button variant="outline" onClick={fetchBattle} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatTile icon={Users} label="Participants" value={battle.stats?.participantCount ?? participants.length} />
        <StatTile icon={CheckCircle2} label="Finished" value={battle.stats?.finishedCount ?? 0} />
        <StatTile icon={Award} label="Avg Score" value={battle.stats?.averageScore ?? 0} />
        <StatTile icon={Target} label="Accuracy" value={battle.stats?.accuracy != null ? `${battle.stats.accuracy}%` : '—'} />
        <StatTile icon={BarChart3} label="Answered" value={battle.stats?.questionsAnswered ?? 0} />
        <StatTile icon={Timer} label="Completion" value={battle.stats?.completionRate != null ? `${battle.stats.completionRate}%` : '—'} />
      </div>

      {/* Timeline */}
      <Card className="card-hover">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/30 pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" /> Timeline
          </CardTitle>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
            <span>Created {formatDate(battle.createdAt)}</span>
            <span>Started {formatDate(battle.startedAt)}</span>
            <span>Ended {formatDate(battle.endedAt)}</span>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {battle.timeline && battle.timeline.length > 0 ? (
            <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
              {battle.timeline.slice(0, 50).map(entry => (
                <div key={entry.id} className="flex items-start gap-3 py-1.5 border-b border-border/10 last:border-0">
                  <Activity className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs">
                      <span className="font-medium">{(entry.event || 'event').replace(/_/g, ' ')}</span>
                      {entry.actor && <span className="text-muted-foreground"> by {entry.actor}</span>}
                      {entry.actorRole && <span className="text-muted-foreground"> ({entry.actorRole})</span>}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">{formatDate(entry.timestamp)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Clock} title="No Timeline Events" description="No battle events recorded." />
          )}
        </CardContent>
      </Card>

      {/* Leaderboard */}
      <Card className="card-hover">
        <CardHeader className="border-b border-border/30 pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" /> Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {leaderboard.length > 0 ? (
            <div className="space-y-1">
              {leaderboard.slice(0, 50).map((p, idx) => (
                <div key={p.userId} className={cn(
                  'flex items-center gap-3 p-3 rounded-[12px] transition-all duration-300 ease-out',
                  idx === 0 && p.score ? 'bg-warning/10 border border-warning/25 dark:bg-warning/15' : 'bg-muted/30 hover:bg-muted/50'
                )}>
                  <div className={cn(
                    'w-7 h-7 rounded-[8px] flex items-center justify-center text-xs font-bold shrink-0',
                    idx === 0 ? 'bg-warning text-background' : idx === 1 ? 'bg-muted-foreground/30 text-background' : idx === 2 ? 'bg-accent/60 text-background' : 'bg-background text-muted-foreground'
                  )}>
                    {idx + 1}
                  </div>
                  <button
                    onClick={() => router.push(`/executive/${p.userId === battle.commanderId ? 'commanders' : 'students'}/${p.userId}`)}
                    className="min-w-0 flex-1 text-left group rounded-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors duration-300">
                      {p.name || p.userId.slice(0, 12)}
                      {p.userId === battle.commanderId && <span className="ml-1.5 text-[10px] text-muted-foreground">(commander)</span>}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {p.correctCount ?? 0}/{p.answeredCount ?? 0} correct
                      {(p.violationsCount ?? 0) > 0 && <span className="text-destructive ml-2">{p.violationsCount} violations</span>}
                      {(p.reconnects ?? 0) > 0 && <span className="ml-2">{p.reconnects} reconnects</span>}
                    </p>
                  </button>
                  <Badge variant="outline" className="text-[10px] capitalize shrink-0">{p.status || 'unknown'}</Badge>
                  <span className="text-base font-bold tabular-nums w-12 text-right shrink-0">{p.score ?? 0}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Trophy} title="No Participants" description="No participants recorded for this battle." />
          )}
        </CardContent>
      </Card>

      {/* Questions */}
      <Card className="card-hover">
        <CardHeader className="border-b border-border/30 pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" /> Questions &amp; Answers ({questions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {questions.length > 0 ? (
            <div className="space-y-2">
              {questionAnswers.map(({ question: q, rows, answered, correctCount }, qi) => {
                const expanded = expandedQuestion === q.id;
                return (
                  <div key={q.id} className="border border-border/50 rounded-[12px] overflow-hidden">
                    <button
                      onClick={() => setExpandedQuestion(expanded ? null : q.id)}
                      aria-expanded={expanded}
                      className="w-full text-left p-3.5 hover:bg-muted/30 transition-all duration-300 ease-out flex items-start gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <span className="text-xs font-bold text-muted-foreground shrink-0 mt-0.5">Q{qi + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium line-clamp-2">{q.text || 'Untitled question'}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {answered} answered · {correctCount} correct
                          {q.correctAnswerIndex != null && <span className="ml-2 text-success">Key: option {q.correctAnswerIndex + 1}</span>}
                        </p>
                      </div>
                      <ChevronRight className={cn('w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-300 ease-out', expanded && 'rotate-90')} />
                    </button>
                    {expanded && (
                      <div className="border-t border-border/40 p-3.5 bg-muted/20 space-y-3">
                        <div className="space-y-1">
                          {(q.options || []).map((opt, oi) => (
                            <div key={oi} className={cn(
                              'flex items-start gap-2 p-2 rounded-[8px] text-xs',
                              q.correctAnswerIndex === oi
                                ? 'bg-success/10 border border-success/25 dark:bg-success/20'
                                : 'bg-background border border-border/40'
                            )}>
                              <span className={cn(
                                'shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold',
                                q.correctAnswerIndex === oi ? 'bg-success text-background' : 'bg-muted text-muted-foreground'
                              )}>{String.fromCharCode(65 + oi)}</span>
                              <span className="min-w-0 flex-1">{opt}</span>
                              {q.correctAnswerIndex === oi && <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />}
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 max-h-64 overflow-y-auto custom-scrollbar">
                          {rows.map(r => (
                            <div key={r.participant.userId} className={cn(
                              'flex items-center gap-2 p-2 rounded-[8px] text-[10px] bg-background border',
                              r.correct === true ? 'border-success/30 dark:border-success/40' : r.correct === false ? 'border-destructive/30 dark:border-destructive/40' : 'border-border/40'
                            )}>
                              {r.correct === true
                                ? <CheckCircle2 className="w-3 h-3 text-success shrink-0" />
                                : r.correct === false
                                  ? <XCircle className="w-3 h-3 text-destructive shrink-0" />
                                  : <span className="w-3 h-3 shrink-0 rounded-full bg-muted" />}
                              <span className="truncate">{r.participant.name || r.participant.userId.slice(0, 8)}</span>
                              <span className="ml-auto font-mono text-muted-foreground shrink-0">
                                {r.selected !== null ? (r.selected + 1) : '—'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={Target} title="No Questions" description="No questions recorded for this battle." />
          )}
        </CardContent>
      </Card>

      {/* Config */}
      {battle.config && Object.keys(battle.config).some(k => battle.config?.[k] != null) && (
        <Card className="card-hover">
          <CardHeader className="border-b border-border/30 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Crown className="w-4 h-4 text-primary" /> Battle Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {Object.entries(battle.config).map(([key, val]) => (
                <div key={key} className="p-2.5 rounded-[10px] bg-muted/30">
                  <p className="text-[10px] text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                  <p className="text-sm font-semibold truncate">{String(val ?? '—')}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatTile({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number | string }) {
  return (
    <Card className="card-hover">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight tabular-nums">{value}</p>
          <p className="text-[10px] text-muted-foreground truncate">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
