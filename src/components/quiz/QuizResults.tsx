
'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import type { Battle, BattleParticipant } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Crown, Home, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCollection, useFirestore } from '@/firebase';
import { collection } from 'firebase/firestore';
import { cn } from '@/lib/utils';

interface QuizResultsProps {
  battle: Battle;
}

export default function QuizResults({ battle }: QuizResultsProps) {
  const { user } = useAuth();
  const firestore = useFirestore();

  const participantsRef = useMemo(() => 
    collection(firestore, 'battles', battle.id, 'participants'), 
    [firestore, battle.id]
  );
  
  const { data: participants, isLoading } = useCollection<BattleParticipant>(participantsRef);

  const rankedPlayers = useMemo(() => {
    if (!participants) return [];
    return [...participants]
      .filter(p => p.role === 'student')
      .sort((a, b) => b.score - a.score);
  }, [participants]);

  if (isLoading) {
     return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Calculating Final Results...</p>
      </div>
    );
  }

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-6 h-6 text-yellow-400" />;
    if (rank === 2) return <Crown className="w-6 h-6 text-slate-400" />;
    if (rank === 3) return <Crown className="w-6 h-6 text-yellow-600" />;
    return <span className="text-sm font-bold">{rank}</span>;
  };

  const dashboardLink = user?.role === 'Teacher' ? "/teacher/dashboard" : "/student/dashboard";

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 md:p-8">
      <Card className="w-full max-w-4xl border-primary/50 shadow-lg shadow-primary/10">
        <CardHeader className="text-center">
          <CardTitle className="text-4xl font-headline text-primary">
            Battle Over!
          </CardTitle>
          <CardDescription>
            The final results are in for "{battle.title}".
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {rankedPlayers.length > 0 ? (
            <>
            <div className="flex justify-center items-end gap-2 md:gap-4 p-4">
                {/* 2nd Place */}
                {rankedPlayers.slice(1, 2).map((player) => (
                  <div key={player.id} className="flex flex-col items-center gap-2 p-2 md:p-4 rounded-lg bg-secondary order-2 md:order-1">
                    {getRankIcon(2)}
                    <Avatar className="h-16 w-16 md:h-20 md:w-20 border-4 border-slate-400">
                      <AvatarFallback className="text-3xl md:text-4xl bg-muted">{player.avatar}</AvatarFallback>
                    </Avatar>
                    <span className="font-bold text-sm md:text-lg text-center max-w-20 truncate">{player.name}</span>
                    <span className="font-mono text-primary text-xs md:text-base">{player.score} pts</span>
                  </div>
                ))}
                {/* 1st Place */}
                {rankedPlayers.slice(0, 1).map((player) => (
                    <div key={player.id} className="flex flex-col items-center gap-2 p-3 md:p-6 rounded-lg bg-secondary order-1 md:order-2 scale-110">
                        {getRankIcon(1)}
                        <Avatar className="h-20 w-20 md:h-24 md:w-24 border-4 border-yellow-400">
                            <AvatarFallback className="text-4xl md:text-5xl bg-muted">{player.avatar}</AvatarFallback>
                        </Avatar>
                        <span className="font-bold text-base md:text-xl text-center max-w-24 truncate">{player.name}</span>
                        <span className="font-mono text-primary text-sm md:text-lg">{player.score} pts</span>
                    </div>
                ))}
                {/* 3rd Place */}
                {rankedPlayers.slice(2, 3).map((player) => (
                    <div key={player.id} className="flex flex-col items-center gap-2 p-2 md:p-4 rounded-lg bg-secondary order-3">
                        {getRankIcon(3)}
                        <Avatar className="h-16 w-16 md:h-20 md:w-20 border-4 border-yellow-600">
                            <AvatarFallback className="text-3xl md:text-4xl bg-muted">{player.avatar}</AvatarFallback>
                        </Avatar>
                        <span className="font-bold text-sm md:text-lg text-center max-w-20 truncate">{player.name}</span>
                        <span className="font-mono text-primary text-xs md:text-base">{player.score} pts</span>
                    </div>
                ))}
            </div>
              
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px] text-center">Rank</TableHead>
                    <TableHead>Gladiator</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankedPlayers.map((player, index) => (
                    <TableRow key={player.id} className={cn(user && player.id === user.id ? 'bg-primary/10' : '', index < 3 && 'bg-secondary/50')}>
                      <TableCell className="text-center font-bold">{index + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-lg bg-muted">{player.avatar}</AvatarFallback>
                          </Avatar>
                          {player.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-primary">{player.score}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          ) : (
             <p className="text-center text-muted-foreground py-8">No students participated in this battle.</p>
          )}

          <div className="text-center pt-4">
            <Link href={dashboardLink} passHref>
              <Button size="lg">
                <Home className="mr-2 h-5 w-5" />
                Return to Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
