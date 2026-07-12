'use client';

import React, { useMemo, useEffect, useState } from 'react';
import Link from 'next/link';
import type { ValidatedQuiz } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Crown, Home, Trophy, Medal, User, Eye } from 'lucide-react';
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
          ← Back to Results
        </Button>
        <QuizReview quizId={quiz.id} questionStartAt={quiz.question_start_at} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background animate-in">
      <Card className="w-full max-w-5xl border-primary/20 shadow-2xl bg-card/40 backdrop-blur-lg">
        <CardHeader className="text-center space-y-2 pb-0">
          <div className="flex justify-center mb-4">
             <Trophy className="w-14 h-14 text-yellow-400" />
          </div>
          <CardTitle className="text-4xl md:text-5xl font-headline text-primary tracking-tight">Gladiator Victory</CardTitle>
          <CardDescription className="text-base text-muted-foreground">The battle for &ldquo;{quiz.title}&rdquo; has been decided.</CardDescription>
          {currentRank && (
            <div className="inline-flex items-center gap-2 mt-2 bg-primary/10 px-4 py-1.5 rounded-full text-xs font-medium text-primary">
              <User className="w-3.5 h-3.5" />
              <span>You placed #{currentRank} of {totalParticipants}</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-10 py-8">
          {/* Podium */}
          <div className="flex justify-center items-end gap-2 md:gap-8 h-56 md:h-72 mt-4 md:mt-8">
            {/* 2nd Place */}
            {ranked[1] && (
              <div className={cn(
                "flex flex-col items-center gap-2 md:gap-3 p-3 md:p-6 rounded-t-2xl w-24 md:w-44 h-36 md:h-48 border-t-4 border-slate-500/40 shadow-lg relative group transition-all duration-200 hover:bg-secondary/40",
                ranked[1].user_id === uid ? "bg-primary/15 ring-2 ring-primary" : "bg-secondary/30"
              )}>
                <Medal className="w-7 h-7 text-slate-400 absolute -top-8" />
                <Avatar className="h-14 w-14 md:h-20 md:w-20 border-2 border-slate-400/50 shadow-lg group-hover:scale-105 transition-transform"><AvatarFallback className="text-2xl">{getParticipantAvatar(ranked[1])}</AvatarFallback></Avatar>
                <div className="text-center">
                  <p className="font-semibold text-xs truncate w-20 md:w-32">{getParticipantLabel(ranked[1])}</p>
                  <p className="text-primary font-mono font-bold text-base md:text-lg">{ranked[1].score}</p>
                  <span className="text-2xl mt-0.5 block">🥈</span>
                </div>
              </div>
            )}
            
            {/* 1st Place */}
            {ranked[0] && (
              <div className={cn(
                "flex flex-col items-center gap-2 md:gap-3 p-3 md:p-6 rounded-t-2xl w-28 md:w-56 h-44 md:h-60 border-t-4 border-yellow-500 shadow-xl shadow-yellow-500/5 relative group transition-all duration-200 hover:bg-primary/15",
                ranked[0].user_id === uid ? "bg-primary/20 ring-2 ring-primary" : "bg-primary/10"
              )}>
                <Crown className="w-10 h-10 text-yellow-500 absolute -top-11" />
                <Avatar className="h-20 w-20 md:h-28 md:w-28 border-2 border-yellow-500 shadow-xl group-hover:scale-105 transition-transform"><AvatarFallback className="text-4xl">{getParticipantAvatar(ranked[0])}</AvatarFallback></Avatar>
                <div className="text-center mt-1">
                  <p className="font-bold text-sm md:text-lg truncate w-24 md:w-48">{getParticipantLabel(ranked[0])}</p>
                  <p className="text-primary font-mono text-xl md:text-2xl font-bold">{ranked[0].score}</p>
                  <span className="text-3xl md:text-4xl mt-1 block">🥇</span>
                </div>
              </div>
            )}
            
            {/* 3rd Place */}
            {ranked[2] && (
              <div className={cn(
                "flex flex-col items-center gap-2 md:gap-3 p-3 md:p-6 rounded-t-2xl w-24 md:w-40 h-32 md:h-40 border-t-4 border-amber-700/40 shadow-lg relative group transition-all duration-200 hover:bg-secondary/30",
                ranked[2].user_id === uid ? "bg-primary/15 ring-2 ring-primary" : "bg-secondary/20"
              )}>
                <Medal className="w-7 h-7 text-amber-700 absolute -top-8" />
                <Avatar className="h-12 w-12 md:h-16 md:w-16 border-2 border-amber-700/50 shadow-lg group-hover:scale-105 transition-transform"><AvatarFallback className="text-xl">{getParticipantAvatar(ranked[2])}</AvatarFallback></Avatar>
                <div className="text-center">
                  <p className="font-semibold text-xs truncate w-20 md:w-32">{getParticipantLabel(ranked[2])}</p>
                  <p className="text-primary font-mono font-bold text-sm md:text-base">{ranked[2].score}</p>
                  <span className="text-2xl mt-0.5 block">🥉</span>
                </div>
              </div>
            )}
          </div>

          {/* Rest of the leaderboard */}
          <div className="space-y-2 max-h-72 overflow-y-auto pr-2 custom-scrollbar border-t border-border/30 pt-6">
            <h3 className="text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground mb-3">Honorary Mentions</h3>
            {ranked.slice(3).map((p, i) => (
              <div key={p.user_id} className={cn(
                "flex justify-between items-center p-4 rounded-xl border border-border/20 transition-all duration-150 group",
                p.user_id === uid ? "bg-primary/10 border-primary/30" : "bg-secondary/10 hover:bg-secondary/20 hover:border-border/40"
              )}>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-base text-muted-foreground w-6 group-hover:text-primary transition-colors">{i + 4}</span>
                  <Avatar className="h-10 w-10 border border-border/40"><AvatarFallback className="bg-background text-sm">{getParticipantAvatar(p)}</AvatarFallback></Avatar>
                  <span className="font-semibold text-sm">{getParticipantLabel(p)}</span>
                  {p.user_id === uid && <span className="text-[9px] font-semibold text-primary uppercase bg-primary/10 px-1.5 py-0.5 rounded">You</span>}
                </div>
                <div className="text-right">
                    <span className="font-mono text-xl text-primary font-bold">{p.score}</span>
                    <span className="text-[9px] ml-1.5 text-muted-foreground uppercase font-semibold tracking-wider">pts</span>
                </div>
              </div>
            ))}
            {ranked.length === 0 && <p className="text-center text-muted-foreground py-8 text-sm">No gladiators remained in the arena.</p>}
          </div>

          <div className="flex justify-center gap-3 pt-4">
            {uid && (
              <Button variant="outline" size="lg" className="h-12 px-6 text-sm rounded-xl" onClick={() => setShowReview(true)}>
                <Eye className="mr-2 h-4 w-4" /> Review Answers
              </Button>
            )}
            <Link href={user?.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard'}>
              <Button size="lg" className="h-12 px-6 text-sm rounded-xl shadow-glow-primary">
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
