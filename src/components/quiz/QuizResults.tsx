'use client';

import React, { useMemo, useEffect, useState } from 'react';
import Link from 'next/link';
import type { ValidatedQuiz } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Crown, Home, Trophy, User, Eye, BarChart3, Target, Users } from 'lucide-react';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { participantService } from '@/services/participant.service';
import { cn } from '@/lib/utils';
import type { ValidatedParticipant } from '@/lib/schemas';
import { QuizReview } from './QuizReview';

export default function QuizResults({ quiz, currentUserId }: { quiz: ValidatedQuiz; currentUserId?: string }) {
  const { user } = useAuth();
  const [participants, setParticipants] = useState<ValidatedParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showReview, setShowReview] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    setIsLoading(true);
    participantService.getAllParticipants(quiz.id)
      .then(setParticipants)
      .catch(() => toast({ variant: 'destructive', title: 'Error', description: 'Failed to load results.' }))
      .finally(() => setIsLoading(false));
  }, [quiz.id, toast]);

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
    if (total === 0) return { total, avgScore: 0, maxScore: 0, passCount: 0, passRate: '0%' };
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / total);
    const maxScore = Math.max(...scores);
    const passCount = scores.filter(s => s >= avgScore).length;
    const passRate = Math.round((passCount / total) * 100) + '%';
    return { total, avgScore, maxScore, passCount, passRate };
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
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background animate-in safe-top safe-bottom">
      <Card className="w-full max-w-5xl">
        <CardHeader className="text-center space-y-3 pb-0">
          <div className="flex justify-center mb-4">
                <div className="flex items-center justify-center w-16 h-16 rounded-[18px] bg-warning/10 mx-auto">
                  <Trophy className="w-8 h-8 text-warning" />
                </div>
          </div>
          <CardTitle className="text-display font-headline text-foreground tracking-tight">Results</CardTitle>
          <CardDescription className="text-base text-muted-foreground max-w-md mx-auto">The battle for &ldquo;{quiz.title}&rdquo; has been decided.</CardDescription>
          {currentRank && (
            <div className="inline-flex items-center gap-2 mt-2 bg-primary/10 px-4 py-2 rounded-full text-sm font-medium text-primary">
              <User className="w-4 h-4" />
              <span>You placed #{currentRank} of {totalParticipants}</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-8 py-8">
          {/* Statistics */}
          <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
            <div className="flex flex-col items-center p-4 rounded-[12px] bg-muted/50">
              <Users className="w-4 h-4 text-muted-foreground mb-1.5" />
              <span className="text-2xl font-bold font-mono text-foreground">{stats.total}</span>
              <span className="text-xs text-muted-foreground">Total</span>
            </div>
            <div className="flex flex-col items-center p-4 rounded-[12px] bg-muted/50">
              <Target className="w-4 h-4 text-muted-foreground mb-1.5" />
              <span className="text-2xl font-bold font-mono text-foreground">{stats.avgScore}</span>
              <span className="text-xs text-muted-foreground">Avg Score</span>
            </div>
            <div className="flex flex-col items-center p-4 rounded-[12px] bg-muted/50">
              <BarChart3 className="w-4 h-4 text-muted-foreground mb-1.5" />
              <span className="text-2xl font-bold font-mono text-foreground">{stats.maxScore}</span>
              <span className="text-xs text-muted-foreground">Best</span>
            </div>
          </div>

          {/* Podium */}
          <div className="flex justify-center items-end gap-2 md:gap-8 h-40 md:h-72 mt-4 md:mt-8">
            {/* 2nd Place */}
            {ranked[1] && (
              <div className={cn(
                "flex flex-col items-center gap-1 md:gap-3 p-2 md:p-6 rounded-t-[18px] w-20 md:w-44 h-28 md:h-48 border border-border/50 relative group transition-all duration-150",
                ranked[1].user_id === uid ? "bg-primary/5 ring-1 ring-primary/20" : "bg-card"
              )}>
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-muted text-muted-foreground text-xs font-bold absolute -top-3 left-1/2 -translate-x-1/2">2</div>
                <Avatar className="h-12 w-12 md:h-16 md:w-16 mt-4"><AvatarFallback className="text-xl bg-secondary">{getParticipantAvatar(ranked[1])}</AvatarFallback></Avatar>
                <div className="text-center">
                  <p className="font-semibold text-xs truncate w-20 md:w-32">{getParticipantLabel(ranked[1])}</p>
                  <p className="text-primary font-mono font-bold text-sm md:text-lg">{ranked[1].score} pts</p>
                </div>
              </div>
            )}
            
            {/* 1st Place */}
            {ranked[0] && (
              <div className={cn(
                "flex flex-col items-center gap-1 md:gap-3 p-2 md:p-6 rounded-t-[18px] w-24 md:w-56 h-36 md:h-60 border-2 border-warning/30 relative group transition-all duration-150",
                ranked[0].user_id === uid ? "bg-warning/5 ring-2 ring-warning/20" : "bg-warning/[0.02]"
              )}>
                <Crown className="w-8 h-8 text-warning absolute -top-5" />
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-warning/20 text-warning text-xs font-bold absolute -top-3 left-1/2 -translate-x-1/2">1</div>
                <Avatar className="h-16 w-16 md:h-20 md:w-20 mt-4 ring-2 ring-warning/20"><AvatarFallback className="text-3xl bg-secondary">{getParticipantAvatar(ranked[0])}</AvatarFallback></Avatar>
                <div className="text-center mt-1">
                  <p className="font-bold text-sm md:text-lg truncate w-24 md:w-48">{getParticipantLabel(ranked[0])}</p>
                  <p className="text-warning font-mono text-xl md:text-2xl font-bold">{ranked[0].score} pts</p>
                </div>
              </div>
            )}
            
            {/* 3rd Place */}
            {ranked[2] && (
              <div className={cn(
                "flex flex-col items-center gap-1 md:gap-3 p-2 md:p-6 rounded-t-[18px] w-20 md:w-40 h-24 md:h-40 border border-border/50 relative group transition-all duration-150",
                ranked[2].user_id === uid ? "bg-primary/5 ring-1 ring-primary/20" : "bg-card"
              )}>
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-muted text-muted-foreground text-xs font-bold absolute -top-3 left-1/2 -translate-x-1/2">3</div>
                <Avatar className="h-10 w-10 md:h-14 md:w-14 mt-4"><AvatarFallback className="text-lg bg-secondary">{getParticipantAvatar(ranked[2])}</AvatarFallback></Avatar>
                <div className="text-center">
                  <p className="font-semibold text-xs truncate w-20 md:w-32">{getParticipantLabel(ranked[2])}</p>
                  <p className="text-primary font-mono font-bold text-sm md:text-base">{ranked[2].score} pts</p>
                </div>
              </div>
            )}
          </div>

          {/* Full ranking table */}
          <div className="space-y-1.5 pt-6 border-t border-border/50">
            {ranked.map((p, idx) => (
              <div key={p.user_id} className={cn(
                "flex justify-between items-center p-3 md:p-4 rounded-[12px] transition-all duration-150 border border-transparent",
                p.user_id === uid ? "bg-primary/5 border-primary/10" : "hover:bg-muted/30"
              )}>
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "font-mono text-sm w-6 text-center",
                    idx === 0 ? "text-warning font-bold" : idx === 1 ? "text-muted-foreground font-bold" : idx === 2 ? "text-amber-700 font-bold" : "text-muted-foreground"
                  )}>{idx + 1}</span>
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
            {ranked.length === 0 && <p className="text-center text-muted-foreground py-8 text-sm">No participants remained in the arena.</p>}
          </div>

          <div className="flex justify-center gap-3 pt-2">
            {uid && (
              <Button variant="outline" size="lg" onClick={() => setShowReview(true)}>
                <Eye className="mr-2 h-4 w-4" /> Review Answers
              </Button>
            )}
            <Link href={user?.role === 'teacher' ? '/commander/dashboard' : '/gladiator/dashboard'}>
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
