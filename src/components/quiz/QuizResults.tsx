'use client';

import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import type { ValidatedQuiz } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Home, Eye, Target, Clock, BarChart3, Award, Medal, Crown } from 'lucide-react';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useAuth } from '@/hooks/useAuth';
import { participantService } from '@/services/participant.service';
import { useFirebase } from '@/firebase';
import { cn } from '@/lib/utils';
import type { ValidatedParticipant } from '@/lib/schemas';
import { QuizReview } from './QuizReview';
import { Celebration } from '@/components/Celebration';
import { MindMapSVG } from '@/components/mindmap/MindMapSVG';
import { Network, Loader2 } from 'lucide-react';

function getMedalIcon(rank: number) {
  if (rank === 1) return <Crown className="w-5 h-5 text-warning" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-muted-foreground" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-warning/70" />;
  return null;
}

export default function QuizResults({ quiz, currentUserId }: { quiz: ValidatedQuiz; currentUserId?: string }) {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const [participants, setParticipants] = useState<ValidatedParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showReview, setShowReview] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [podiumVisible, setPodiumVisible] = useState(0);
  const [mindMapData, setMindMapData] = useState<{ title: string; nodes: Array<{ topic: string; subtopics: string[] }>; connections: Array<{ from: string; to: string; label?: string }> } | null>(null);
  const [mindMapLoading, setMindMapLoading] = useState(false);
  const [mindMapError, setMindMapError] = useState<string | null>(null);
  const firstLoadRef = useRef(true);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    const unsub = participantService.subscribeToParticipants(quiz.id, (parts) => {
      setParticipants(parts);
      setIsLoading(false);
      if (firstLoadRef.current && parts.length > 0 && !reducedMotionRef.current) {
        const teacherId = quiz.created_by || '';
        const students = parts.filter(p => p.user_id !== teacherId);
        const sorted = [...students].sort((a, b) => b.score - a.score);
        const uid = currentUserId || user?.id || '';
        if (sorted.length > 0 && sorted[0].user_id === uid) {
          setShowCelebration(true);
        }
        firstLoadRef.current = false;
      }
    }, () => {
      setIsLoading(false);
    });
    return () => { unsub(); };
  }, [quiz.id, quiz.created_by, currentUserId, user?.id]);

  const uid = currentUserId || user?.id || '';
  const teacherId = quiz.created_by || '';

  const ranked = useMemo(() => {
    if (!participants) return [];
    return [...participants]
      .filter(p => p.user_id !== teacherId)
      .sort((a, b) => b.score - a.score);
  }, [participants, teacherId]);

  const stats = useMemo(() => {
    const scores = ranked.map(p => p.score);
    const total = scores.length;
    if (total === 0) return { total, avgScore: 0, maxScore: 0 };
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / total);
    const maxScore = Math.max(...scores);
    return { total, avgScore, maxScore };
  }, [ranked]);

  const currentRank = useMemo(() => {
    const idx = ranked.findIndex(p => p.user_id === uid);
    return idx >= 0 ? idx + 1 : null;
  }, [ranked, uid]);

  // Stagger top-3 entrance (winner first, then 2nd, then 3rd) — not simultaneous
  useEffect(() => {
    if (isLoading || ranked.length === 0) return;
    if (reducedMotionRef.current) {
      setPodiumVisible(Math.min(3, ranked.length));
      return;
    }
    setPodiumVisible(0);
    const order = [0, 1, 2].filter(i => i < ranked.length);
    const timers: ReturnType<typeof setTimeout>[] = [];
    order.forEach((_, seq) => {
      const delay = 300 + seq * 220;
      timers.push(setTimeout(() => {
        setPodiumVisible(v => Math.max(v, seq + 1));
      }, delay));
    });
    return () => timers.forEach(clearTimeout);
  }, [isLoading, ranked.length]);

  const totalParticipants = ranked.length;

  const generateMindMap = useCallback(async () => {
    if (mindMapData) return;
    setMindMapLoading(true);
    setMindMapError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setMindMapError('Not authenticated');
        return;
      }
      const res = await fetch('/api/quiz/mindmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ quizId: quiz.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMindMapError(data.error || 'Failed to generate mind map');
        return;
      }
      setMindMapData(data);
    } catch {
      setMindMapError('Failed to generate mind map');
    } finally {
      setMindMapLoading(false);
    }
  }, [mindMapData, quiz.id, user]);

  const getParticipantLabel = (p: ValidatedParticipant) => {
    return p.name || p.user_id.slice(0, 8);
  };

  const getParticipantAvatar = (p: ValidatedParticipant) => {
    return p.avatar || '🎮';
  };

  if (isLoading) return <LoadingScreen message="Loading results..." />;

  if (showReview) {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => setShowReview(false)} className="flex items-center gap-2">
          &larr; Back to Results
        </Button>
        <QuizReview quizId={quiz.id} questionStartAt={quiz.question_start_at} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-screen p-4 md:p-6 bg-background animate-in safe-top safe-bottom">
      <Celebration show={showCelebration} onComplete={() => setShowCelebration(false)} />
      <Card className="w-full max-w-3xl card-hover">
        <CardHeader className="text-center space-y-3 pb-0">
          <CardTitle className="text-display font-headline text-foreground tracking-tight">Results</CardTitle>
          <CardDescription className="text-base text-muted-foreground max-w-md mx-auto">&ldquo;{quiz.title}&rdquo;</CardDescription>
          {currentRank && (
            <div className="inline-flex items-center gap-2 mt-2 bg-primary/10 px-4 py-2 rounded-full text-sm font-medium text-primary ring-1 ring-primary/20">
              {currentRank === 1 ? <Crown className="w-4 h-4" /> : <Award className="w-4 h-4" />}
              <span>#{currentRank} of {totalParticipants}</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-6 py-6">
          <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
            <div className="flex flex-col items-center p-3 rounded-[12px] bg-muted/50 ring-1 ring-border/20">
              <Target className="w-4 h-4 text-muted-foreground mb-1" />
              <span className="text-lg font-bold font-mono text-foreground">{uid ? (ranked.find(p => p.user_id === uid)?.score ?? '—') : '—'}</span>
              <span className="text-[10px] text-muted-foreground">Score</span>
            </div>
            <div className="flex flex-col items-center p-3 rounded-[12px] bg-muted/50 ring-1 ring-border/20">
              <BarChart3 className="w-4 h-4 text-muted-foreground mb-1" />
              <span className="text-lg font-bold font-mono text-foreground">{stats.avgScore}</span>
              <span className="text-[10px] text-muted-foreground">Avg Score</span>
            </div>
            <div className="flex flex-col items-center p-3 rounded-[12px] bg-muted/50 ring-1 ring-border/20">
              <Clock className="w-4 h-4 text-muted-foreground mb-1" />
              <span className="text-lg font-bold font-mono text-foreground">{stats.maxScore}</span>
              <span className="text-[10px] text-muted-foreground">Best</span>
            </div>
          </div>

          {uid && (
            <div className="flex justify-center text-sm">
              <div className="inline-flex items-center gap-1.5 bg-muted/50 px-3 py-1.5 rounded-full ring-1 ring-border/20">
                {(() => {
                  const myScore = ranked.find(p => p.user_id === uid);
                  return myScore ? <><Award className="w-3.5 h-3.5 text-primary" /> {myScore.score} pts &middot; #{currentRank}</> : 'Spectator';
                })()}
              </div>
            </div>
          )}

          {ranked.length > 0 && (
            <div className="space-y-1 pt-4 border-t border-border/50">
              {ranked.slice(0, 3).length > 0 && (
                <div className="flex items-center justify-center gap-4 md:gap-8 pb-6 mb-4 border-b border-border/30">
                  {ranked.length >= 2 && (
                    <div className={cn('flex flex-col items-center gap-2 text-center group transition-all duration-500 ease-out', podiumVisible >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4')}>
                      <Avatar className="h-14 w-14 md:h-16 md:w-16 ring-2 ring-muted-foreground/30 ring-offset-2 ring-offset-card transition-all duration-300 group-hover:scale-105 group-hover:shadow-elevation-small">
                        <AvatarFallback className="text-xl bg-secondary">{getParticipantAvatar(ranked[1])}</AvatarFallback>
                      </Avatar>
                      <Medal className="w-5 h-5 text-muted-foreground" />
                      <span className="text-xs font-medium max-w-16 truncate">{getParticipantLabel(ranked[1])}</span>
                      <span className="font-mono text-sm font-bold tabular-nums">{ranked[1].score}</span>
                    </div>
                  )}
                  {ranked.length >= 1 && (
                    <div className={cn('flex flex-col items-center gap-2 text-center -mt-4 group transition-all duration-500 ease-out', podiumVisible >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4')}>
                      <div className="relative">
                        {/* neo-roman winner glow — tasteful, not cartoonish */}
                        <div className={cn('absolute -inset-3 rounded-full bg-gradient-to-br from-warning/20 via-accent/15 to-primary/10 blur-xl transition-opacity duration-700', podiumVisible >= 1 ? 'opacity-100 animate-glow-pulse' : 'opacity-0')} aria-hidden="true" />
                        <Avatar className={cn('relative h-16 w-16 md:h-20 md:w-20 ring-2 ring-warning/40 ring-offset-2 ring-offset-card transition-all duration-500', podiumVisible >= 1 ? 'scale-100 shadow-elevation-medium' : 'scale-90', 'group-hover:scale-105 group-hover:shadow-elevation-medium')}>
                          <AvatarFallback className="text-2xl bg-secondary">{getParticipantAvatar(ranked[0])}</AvatarFallback>
                        </Avatar>
                      </div>
                      <Crown className={cn('w-6 h-6 text-warning transition-all duration-500', podiumVisible >= 1 ? 'scale-100' : 'scale-0')} />
                      <span className="text-sm font-semibold max-w-20 truncate">{getParticipantLabel(ranked[0])}</span>
                      <span className="font-mono text-base font-bold text-warning tabular-nums">{ranked[0].score}</span>
                    </div>
                  )}
                  {ranked.length >= 3 && (
                    <div className={cn('flex flex-col items-center gap-2 text-center group transition-all duration-500 ease-out', podiumVisible >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4')}>
                      <Avatar className="h-14 w-14 md:h-16 md:w-16 ring-2 ring-warning/30 ring-offset-2 ring-offset-card transition-all duration-300 group-hover:scale-105 group-hover:shadow-elevation-small">
                        <AvatarFallback className="text-xl bg-secondary">{getParticipantAvatar(ranked[2])}</AvatarFallback>
                      </Avatar>
                      <Medal className="w-5 h-5 text-warning/70" />
                      <span className="text-xs font-medium max-w-16 truncate">{getParticipantLabel(ranked[2])}</span>
                      <span className="font-mono text-sm font-bold tabular-nums">{ranked[2].score}</span>
                    </div>
                  )}
                </div>
              )}
              {ranked.map((p, idx) => (
                <div key={p.user_id} className={cn(
                  "flex justify-between items-center p-3 md:p-4 rounded-[12px] transition-all duration-300 border",
                  p.user_id === uid ? "bg-primary/5 border-primary/10 shadow-elevation-small" : "border-transparent hover:bg-muted/30 hover:shadow-elevation-small"
                )}>
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "font-mono text-sm w-6 text-center flex items-center justify-center",
                      idx === 0 ? "text-warning font-bold" : idx === 1 ? "text-muted-foreground font-bold" : idx === 2 ? "text-warning/70 font-bold" : "text-muted-foreground"
                    )}>
                      {idx < 3 ? getMedalIcon(idx) : idx + 1}
                    </span>
                    <Avatar className="h-9 w-9"><AvatarFallback className="text-xs bg-secondary">{getParticipantAvatar(p)}</AvatarFallback></Avatar>
                    <div>
                      <span className="font-medium text-sm">{getParticipantLabel(p)}</span>
                      {p.user_id === uid && <span className="ml-2 text-[10px] font-semibold text-primary uppercase bg-primary/10 px-1.5 py-0.5 rounded">You</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-base text-foreground font-bold">{p.score}</span>
                    <span className="text-xs ml-1 text-muted-foreground">pts</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {ranked.length === 0 && <p className="text-center text-muted-foreground py-8 text-sm">No participants remained in the arena.</p>}

          <div className="flex justify-center gap-3 pt-2">
            {uid && (
              <Button variant="outline" size="lg" onClick={() => setShowReview(true)}>
                <Eye className="mr-2 h-4 w-4" /> Review Answers
              </Button>
            )}
            {uid && (
              <Button variant="outline" size="lg" onClick={generateMindMap} disabled={mindMapLoading}>
                {mindMapLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Network className="mr-2 h-4 w-4" />}
                {mindMapData ? 'Mind Map' : 'Generate Mind Map'}
              </Button>
            )}
            <Link href={user?.role === 'commander' || user?.role === 'executive' ? `/${user.role}/dashboard` : user ? '/gladiator/dashboard' : '/'}>
              <Button size="lg">
                <Home className="mr-2 h-4 w-4" />
                Dashboard
              </Button>
            </Link>
          </div>

          {mindMapError && (
            <div className="text-center text-sm text-destructive bg-destructive/5 p-3 rounded-xl border border-destructive/10">
              {mindMapError}
            </div>
          )}

          {mindMapData && mindMapData.nodes.length > 0 && (
            <div className="pt-4 border-t border-border/50 space-y-3">
              <h3 className="text-sm font-medium text-center text-muted-foreground">Topic Mind Map</h3>
              <MindMapSVG data={mindMapData} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
