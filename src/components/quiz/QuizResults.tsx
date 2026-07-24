'use client';

import React, { useMemo, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import type { ValidatedQuiz } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Home, Eye, Target, Clock, BarChart3, Award, Medal, Crown } from 'lucide-react';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useAuth } from '@/hooks/useAuth';
import { participantService } from '@/services/participant.service';
import { cn } from '@/lib/utils';
import type { ValidatedParticipant } from '@/lib/schemas';
import { QuizReview } from './QuizReview';
import { Celebration } from '@/components/Celebration';

function getMedalIcon(rank: number) {
  if (rank === 1) return <Crown className="w-5 h-5 text-warning" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-muted-foreground" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-700" />;
  return null;
}

export default function QuizResults({ quiz, currentUserId }: { quiz: ValidatedQuiz; currentUserId?: string }) {
  const { user } = useAuth();
  const [participants, setParticipants] = useState<ValidatedParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showReview, setShowReview] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
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

  const totalParticipants = ranked.length;

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
    <div className="flex flex-col items-center min-h-screen p-4 bg-background animate-in safe-top safe-bottom">
      <Celebration show={showCelebration} onComplete={() => setShowCelebration(false)} />
      <Card className="w-full max-w-3xl">
        <CardHeader className="text-center space-y-3 pb-0">
          <CardTitle className="text-display font-headline text-foreground tracking-tight">Results</CardTitle>
          <CardDescription className="text-base text-muted-foreground max-w-md mx-auto">&ldquo;{quiz.title}&rdquo;</CardDescription>
          {currentRank && (
            <div className="inline-flex items-center gap-2 mt-2 bg-primary/10 px-4 py-2 rounded-full text-sm font-medium text-primary">
              {currentRank === 1 ? <Crown className="w-4 h-4" /> : <Award className="w-4 h-4" />}
              <span>#{currentRank} of {totalParticipants}</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-6 py-6">
          <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
            <div className="flex flex-col items-center p-3 rounded-[12px] bg-muted/50">
              <Target className="w-4 h-4 text-muted-foreground mb-1" />
              <span className="text-lg font-bold font-mono text-foreground">{uid ? (ranked.find(p => p.user_id === uid)?.score ?? '—') : '—'}</span>
              <span className="text-[10px] text-muted-foreground">Score</span>
            </div>
            <div className="flex flex-col items-center p-3 rounded-[12px] bg-muted/50">
              <BarChart3 className="w-4 h-4 text-muted-foreground mb-1" />
              <span className="text-lg font-bold font-mono text-foreground">{stats.avgScore}</span>
              <span className="text-[10px] text-muted-foreground">Avg Score</span>
            </div>
            <div className="flex flex-col items-center p-3 rounded-[12px] bg-muted/50">
              <Clock className="w-4 h-4 text-muted-foreground mb-1" />
              <span className="text-lg font-bold font-mono text-foreground">{stats.maxScore}</span>
              <span className="text-[10px] text-muted-foreground">Best</span>
            </div>
          </div>

          {uid && (
            <div className="flex justify-center text-sm text-muted-foreground">
              {(() => {
                const myScore = ranked.find(p => p.user_id === uid);
                return myScore ? `${myScore.score} pts — #${currentRank}` : 'Spectator';
              })()}
            </div>
          )}

          {ranked.length > 0 && (
            <div className="space-y-1 pt-4 border-t border-border/50">
              {ranked.slice(0, 3).length > 0 && (
                <div className="flex items-center justify-center gap-4 md:gap-8 pb-6 mb-4 border-b border-border/30">
                  {ranked.length >= 2 && (
                    <div className="flex flex-col items-center gap-2 text-center">
                      <Avatar className="h-14 w-14 md:h-16 md:w-16 ring-2 ring-muted-foreground/30 ring-offset-2 ring-offset-card">
                        <AvatarFallback className="text-xl bg-secondary">{getParticipantAvatar(ranked[1])}</AvatarFallback>
                      </Avatar>
                      <Medal className="w-5 h-5 text-muted-foreground" />
                      <span className="text-xs font-medium max-w-16 truncate">{getParticipantLabel(ranked[1])}</span>
                      <span className="font-mono text-sm font-bold">{ranked[1].score}</span>
                    </div>
                  )}
                  {ranked.length >= 1 && (
                    <div className="flex flex-col items-center gap-2 text-center -mt-4">
                      <Avatar className="h-16 w-16 md:h-20 md:w-20 ring-2 ring-warning/40 ring-offset-2 ring-offset-card">
                        <AvatarFallback className="text-2xl bg-secondary">{getParticipantAvatar(ranked[0])}</AvatarFallback>
                      </Avatar>
                      <Crown className="w-6 h-6 text-warning" />
                      <span className="text-sm font-semibold max-w-20 truncate">{getParticipantLabel(ranked[0])}</span>
                      <span className="font-mono text-base font-bold text-warning">{ranked[0].score}</span>
                    </div>
                  )}
                  {ranked.length >= 3 && (
                    <div className="flex flex-col items-center gap-2 text-center">
                      <Avatar className="h-14 w-14 md:h-16 md:w-16 ring-2 ring-amber-700/30 ring-offset-2 ring-offset-card">
                        <AvatarFallback className="text-xl bg-secondary">{getParticipantAvatar(ranked[2])}</AvatarFallback>
                      </Avatar>
                      <Medal className="w-5 h-5 text-amber-700" />
                      <span className="text-xs font-medium max-w-16 truncate">{getParticipantLabel(ranked[2])}</span>
                      <span className="font-mono text-sm font-bold">{ranked[2].score}</span>
                    </div>
                  )}
                </div>
              )}
              {ranked.map((p, idx) => (
                <div key={p.user_id} className={cn(
                  "flex justify-between items-center p-3 md:p-4 rounded-[12px] transition-all duration-150 border border-transparent",
                  p.user_id === uid ? "bg-primary/5 border-primary/10" : "hover:bg-muted/30"
                )}>
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "font-mono text-sm w-6 text-center flex items-center justify-center",
                      idx === 0 ? "text-warning font-bold" : idx === 1 ? "text-muted-foreground font-bold" : idx === 2 ? "text-amber-700 font-bold" : "text-muted-foreground"
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
            <Link href={user?.role === 'commander' || user?.role === 'executive' ? `/${user.role}/dashboard` : user ? '/gladiator/dashboard' : '/'}>
              <Button size="lg">
                <Home className="mr-2 h-4 w-4" />
                Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
