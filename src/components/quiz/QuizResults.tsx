
'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import type { Quiz, QuizParticipant } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Crown, Home, Loader2, Trophy } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCollection, useFirestore } from '@/firebase';
import { collection } from 'firebase/firestore';
import { cn } from '@/lib/utils';

export default function QuizResults({ quiz }: { quiz: Quiz }) {
  const { user } = useAuth();
  const firestore = useFirestore();
  const participantsRef = useMemo(() => firestore ? collection(firestore, 'quizzes', quiz.id, 'participants') : null, [firestore, quiz.id]);
  const { data: participants, isLoading } = useCollection<QuizParticipant>(participantsRef);

  const ranked = useMemo(() => {
    if (!participants) return [];
    return [...participants]
      .filter(p => p.role === 'student')
      .sort((a, b) => b.score - a.score);
  }, [participants]);

  if (isLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin h-12 w-12" /></div>;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <Card className="w-full max-w-4xl border-primary/30 shadow-2xl">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-5xl font-headline text-primary uppercase tracking-tighter">Gladiator Standings</CardTitle>
          <CardDescription className="text-lg">The battle for "{quiz.title}" has concluded.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-12">
          {/* Podium */}
          <div className="flex justify-center items-end gap-2 md:gap-8 h-80 pt-10">
            {/* 2nd Place */}
            {ranked[1] && (
              <div className="flex flex-col items-center gap-3 bg-secondary/20 p-6 rounded-t-2xl w-32 md:w-40 h-48 border-t-4 border-slate-400">
                <Avatar className="h-16 w-16 md:h-20 md:w-20 border-2 border-slate-400 shadow-lg"><AvatarFallback className="text-2xl">{ranked[1].avatar}</AvatarFallback></Avatar>
                <div className="text-center">
                  <p className="font-bold text-sm truncate w-24 md:w-32">{ranked[1].name}</p>
                  <p className="text-primary font-mono font-bold">{ranked[1].score}</p>
                  <span className="text-3xl mt-1 block">🥈</span>
                </div>
              </div>
            )}
            
            {/* 1st Place */}
            {ranked[0] && (
              <div className="flex flex-col items-center gap-3 bg-primary/10 p-6 rounded-t-2xl w-40 md:w-52 h-64 border-t-8 border-yellow-400 relative">
                <Crown className="w-10 h-10 text-yellow-400 absolute -top-12 animate-bounce" />
                <Avatar className="h-24 w-24 md:h-28 md:w-28 border-4 border-yellow-400 shadow-2xl shadow-yellow-400/20"><AvatarFallback className="text-4xl">{ranked[0].avatar}</AvatarFallback></Avatar>
                <div className="text-center">
                  <p className="font-bold text-lg truncate w-32 md:w-44">{ranked[0].name}</p>
                  <p className="text-primary font-mono text-2xl font-black">{ranked[0].score}</p>
                  <span className="text-5xl mt-1 block">🥇</span>
                </div>
              </div>
            )}
            
            {/* 3rd Place */}
            {ranked[2] && (
              <div className="flex flex-col items-center gap-3 bg-secondary/10 p-6 rounded-t-2xl w-32 md:w-40 h-40 border-t-4 border-amber-700">
                <Avatar className="h-16 w-16 md:h-20 md:w-20 border-2 border-amber-700 shadow-lg"><AvatarFallback className="text-2xl">{ranked[2].avatar}</AvatarFallback></Avatar>
                <div className="text-center">
                  <p className="font-bold text-sm truncate w-24 md:w-32">{ranked[2].name}</p>
                  <p className="text-primary font-mono font-bold">{ranked[2].score}</p>
                  <span className="text-3xl mt-1 block">🥉</span>
                </div>
              </div>
            )}
          </div>

          {/* Rest of the leaderboard */}
          <div className="space-y-3 max-h-72 overflow-y-auto pr-2 custom-scrollbar">
            {ranked.slice(3).map((p, i) => (
              <div key={p.id} className="flex justify-between items-center p-4 bg-secondary/20 rounded-xl border border-border/50 hover:bg-secondary/30 transition-colors">
                <div className="flex items-center gap-6">
                  <span className="font-mono text-xl text-muted-foreground w-6">{i + 4}</span>
                  <Avatar className="h-10 w-10 border border-border"><AvatarFallback>{p.avatar}</AvatarFallback></Avatar>
                  <span className="font-bold text-lg">{p.name}</span>
                </div>
                <div className="text-right">
                    <span className="font-mono text-2xl text-primary font-bold">{p.score}</span>
                    <span className="text-xs ml-1 text-muted-foreground uppercase font-bold">pts</span>
                </div>
              </div>
            ))}
            {ranked.length === 0 && <p className="text-center text-muted-foreground italic">No student gladiators participated in this battle.</p>}
          </div>

          <div className="flex justify-center pt-8">
            <Link href={user?.role === 'Teacher' ? '/teacher/dashboard' : '/student/dashboard'}>
              <Button size="lg" className="h-16 px-10 text-xl font-bold rounded-full shadow-lg hover:scale-105 transition-transform">
                <Home className="mr-3 h-6 w-6" />
                Return to Command Center
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
