
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

  const ranked = useMemo(() => participants ? [...participants].filter(p => p.role === 'student').sort((a,b) => b.score - a.score) : [], [participants]);

  if (isLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin h-12 w-12" /></div>;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <Card className="w-full max-w-4xl border-primary/30">
        <CardHeader className="text-center">
          <CardTitle className="text-4xl font-headline text-primary">Battle Over!</CardTitle>
          <CardDescription>Final standings for {quiz.title}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="flex justify-center items-end gap-4 h-64">
            {ranked[1] && (
              <div className="flex flex-col items-center gap-2 bg-secondary/50 p-4 rounded-t-lg w-32 h-40">
                <Avatar className="h-16 w-16 border-4 border-slate-400"><AvatarFallback>{ranked[1].avatar}</AvatarFallback></Avatar>
                <span className="font-bold truncate w-full text-center">{ranked[1].name}</span>
                <span className="text-primary font-mono">{ranked[1].score}</span>
                <span className="text-2xl">🥈</span>
              </div>
            )}
            {ranked[0] && (
              <div className="flex flex-col items-center gap-2 bg-primary/10 p-4 rounded-t-lg w-40 h-56 border-x-2 border-t-2 border-primary/20">
                <Crown className="w-8 h-8 text-yellow-400 animate-bounce" />
                <Avatar className="h-20 w-20 border-4 border-yellow-400"><AvatarFallback>{ranked[0].avatar}</AvatarFallback></Avatar>
                <span className="font-bold truncate w-full text-center">{ranked[0].name}</span>
                <span className="text-primary font-mono text-xl">{ranked[0].score}</span>
                <span className="text-3xl">🥇</span>
              </div>
            )}
            {ranked[2] && (
              <div className="flex flex-col items-center gap-2 bg-secondary/30 p-4 rounded-t-lg w-32 h-32">
                <Avatar className="h-16 w-16 border-4 border-amber-600"><AvatarFallback>{ranked[2].avatar}</AvatarFallback></Avatar>
                <span className="font-bold truncate w-full text-center">{ranked[2].name}</span>
                <span className="text-primary font-mono">{ranked[2].score}</span>
                <span className="text-2xl">🥉</span>
              </div>
            )}
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {ranked.slice(3).map((p, i) => (
              <div key={p.id} className="flex justify-between items-center p-3 bg-secondary/20 rounded-md">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-muted-foreground">{i + 4}</span>
                  <Avatar className="h-8 w-8"><AvatarFallback>{p.avatar}</AvatarFallback></Avatar>
                  <span className="font-medium">{p.name}</span>
                </div>
                <span className="font-mono text-primary">{p.score} pts</span>
              </div>
            ))}
          </div>

          <div className="flex justify-center pt-6">
            <Link href={user?.role === 'Teacher' ? '/teacher/dashboard' : '/student/dashboard'}>
              <Button size="lg"><Home className="mr-2" />Return Home</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
