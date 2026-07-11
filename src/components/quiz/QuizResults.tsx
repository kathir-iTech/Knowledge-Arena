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
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <Card className="w-full max-w-5xl border-primary/20 shadow-2xl bg-card/40 backdrop-blur-lg">
        <CardHeader className="text-center space-y-2 pb-0">
          <div className="flex justify-center mb-4">
             <Trophy className="w-16 h-16 text-yellow-400 animate-bounce" />
          </div>
          <CardTitle className="text-5xl md:text-6xl font-headline text-primary uppercase tracking-tighter">Gladiator Victory</CardTitle>
          <CardDescription className="text-lg font-medium text-muted-foreground">The battle for &ldquo;{quiz.title}&rdquo; has been decided.</CardDescription>
          {currentRank && (
            <div className="inline-flex items-center gap-2 mt-2 bg-primary/10 px-4 py-2 rounded-full text-primary">
              <User className="w-4 h-4" />
              <span className="font-bold">You placed #{currentRank} of {totalParticipants}</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-12 py-10">
          {/* Podium */}
          <div className="flex justify-center items-end gap-1 md:gap-8 h-64 md:h-80 mt-6 md:mt-10">
            {/* 2nd Place */}
            {ranked[1] && (
              <div className={cn(
                "flex flex-col items-center gap-2 md:gap-3 p-3 md:p-6 rounded-t-3xl w-24 md:w-44 h-40 md:h-56 border-t-4 border-slate-400/50 shadow-lg relative group transition-all hover:bg-secondary/40",
                ranked[1].user_id === uid ? "bg-primary/20 ring-2 ring-primary" : "bg-secondary/30"
              )}>
                <Medal className="w-8 h-8 text-slate-400 absolute -top-10" />
                {ranked[1].user_id === uid && <User className="w-4 h-4 text-primary absolute top-2 right-2" />}
                <Avatar className="h-16 w-16 md:h-24 md:w-24 border-4 border-slate-400 shadow-xl group-hover:scale-110 transition-transform"><AvatarFallback className="text-3xl">{getParticipantAvatar(ranked[1])}</AvatarFallback></Avatar>
                <div className="text-center">
                  <p className="font-bold text-sm truncate w-24 md:w-36">{getParticipantLabel(ranked[1])}</p>
                  <p className="text-primary font-mono font-bold text-xl">{ranked[1].score}</p>
                  <span className="text-3xl mt-1 block">🥈</span>
                </div>
              </div>
            )}
            
            {/* 1st Place */}
            {ranked[0] && (
              <div className={cn(
                "flex flex-col items-center gap-2 md:gap-3 p-3 md:p-6 rounded-t-3xl w-28 md:w-60 h-52 md:h-72 border-t-8 border-yellow-500 shadow-2xl shadow-yellow-500/10 relative group transition-all hover:bg-primary/20",
                ranked[0].user_id === uid ? "bg-primary/20 ring-2 ring-primary" : "bg-primary/10"
              )}>
                <Crown className="w-12 h-12 text-yellow-500 absolute -top-14 animate-pulse" />
                {ranked[0].user_id === uid && <User className="w-4 h-4 text-primary absolute top-2 right-2" />}
                <Avatar className="h-24 w-24 md:h-32 md:w-32 border-4 border-yellow-500 shadow-2xl shadow-yellow-500/20 group-hover:scale-110 transition-transform"><AvatarFallback className="text-5xl">{getParticipantAvatar(ranked[0])}</AvatarFallback></Avatar>
                <div className="text-center mt-2">
                  <p className="font-black text-xl truncate w-32 md:w-52 uppercase tracking-wide">{getParticipantLabel(ranked[0])}</p>
                  <p className="text-primary font-mono text-3xl font-black">{ranked[0].score}</p>
                  <span className="text-5xl mt-2 block">🥇</span>
                </div>
              </div>
            )}
            
            {/* 3rd Place */}
            {ranked[2] && (
              <div className={cn(
                "flex flex-col items-center gap-2 md:gap-3 p-3 md:p-6 rounded-t-3xl w-24 md:w-40 h-36 md:h-44 border-t-4 border-amber-700/50 shadow-lg relative group transition-all hover:bg-secondary/30",
                ranked[2].user_id === uid ? "bg-primary/20 ring-2 ring-primary" : "bg-secondary/20"
              )}>
                <Medal className="w-8 h-8 text-amber-700 absolute -top-10" />
                {ranked[2].user_id === uid && <User className="w-4 h-4 text-primary absolute top-2 right-2" />}
                <Avatar className="h-14 w-14 md:h-20 md:w-20 border-4 border-amber-700 shadow-xl group-hover:scale-110 transition-transform"><AvatarFallback className="text-2xl">{getParticipantAvatar(ranked[2])}</AvatarFallback></Avatar>
                <div className="text-center">
                  <p className="font-bold text-sm truncate w-24 md:w-32">{getParticipantLabel(ranked[2])}</p>
                  <p className="text-primary font-mono font-bold text-lg">{ranked[2].score}</p>
                  <span className="text-3xl mt-1 block">🥉</span>
                </div>
              </div>
            )}
          </div>

          {/* Rest of the leaderboard */}
          <div className="space-y-3 max-h-72 overflow-y-auto pr-2 custom-scrollbar border-t border-border/50 pt-8">
            <h3 className="text-center text-xs font-black uppercase tracking-[0.4em] text-muted-foreground mb-4">Honorary Mentions</h3>
            {ranked.slice(3).map((p, i) => (
              <div key={p.user_id} className={cn(
                "flex justify-between items-center p-5 rounded-2xl border border-border/30 transition-colors group",
                p.user_id === uid ? "bg-primary/10 border-primary/30 ring-1 ring-primary/20" : "bg-secondary/20 hover:bg-secondary/30"
              )}>
                <div className="flex items-center gap-6">
                  <span className="font-mono text-xl text-muted-foreground w-8 group-hover:text-primary transition-colors">{i + 4}</span>
                  <Avatar className="h-12 w-12 border-2 border-border group-hover:border-primary/50 transition-colors"><AvatarFallback className="bg-background">{getParticipantAvatar(p)}</AvatarFallback></Avatar>
                  <span className="font-bold text-xl">{getParticipantLabel(p)}</span>
                  {p.user_id === uid && <span className="text-[10px] font-bold text-primary uppercase">(You)</span>}
                </div>
                <div className="text-right">
                    <span className="font-mono text-3xl text-primary font-black group-hover:scale-110 transition-transform inline-block">{p.score}</span>
                    <span className="text-xs ml-2 text-muted-foreground uppercase font-black tracking-widest">pts</span>
                </div>
              </div>
            ))}
            {ranked.length === 0 && <p className="text-center text-muted-foreground italic py-10">No gladiators remained in the arena.</p>}
          </div>

          <div className="flex justify-center gap-4 pt-6">
            {uid && (
              <Button variant="outline" size="lg" className="h-16 px-8 text-lg rounded-full" onClick={() => setShowReview(true)}>
                <Eye className="mr-2 h-5 w-5" /> Review Answers
              </Button>
            )}
            <Link href={user?.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard'}>
              <Button size="lg" className="h-16 px-8 text-lg rounded-full shadow-2xl shadow-primary/40 hover:scale-105 transition-transform bg-primary text-primary-foreground">
                <Home className="mr-2 h-5 w-5" />
                Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
