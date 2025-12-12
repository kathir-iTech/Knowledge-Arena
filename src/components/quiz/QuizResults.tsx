
'use client';

import React from 'react';
import Link from 'next/link';
import type { BattleRoom, BattleParticipation } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Crown, Home, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface QuizResultsProps {
  room: BattleRoom;
  isTeacher: boolean;
  participants: BattleParticipation[];
  isLoading: boolean;
}

export default function QuizResults({ room, isTeacher, participants, isLoading }: QuizResultsProps) {
  const { user } = useAuth();
  
  if (isLoading) {
     return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Calculating Results...</p>
      </div>
    );
  }

  const rankedPlayers = participants ? [...participants].sort((a, b) => b.totalScore - a.totalScore) : [];

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-6 h-6 text-yellow-400" />;
    if (rank === 2) return <Crown className="w-6 h-6 text-slate-400" />;
    if (rank === 3) return <Crown className="w-6 h-6 text-yellow-600" />;
    return <span className="text-sm font-bold">{rank}</span>;
  };

  const isPodiumPlayer = (player: BattleParticipation) => {
    const rank = rankedPlayers.findIndex(p => p.id === player.id);
    return rank >= 0 && rank < 3;
  };

  const isFullLeaderboard = room.status === 'finished' || isTeacher;


  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 md:p-8">
      <Card className="w-full max-w-4xl border-primary/50 shadow-lg shadow-primary/10">
        <CardHeader className="text-center">
          <CardTitle className="text-4xl font-headline text-primary">
            {isFullLeaderboard ? 'Battle Over!' : 'You Finished!'}
          </CardTitle>
          <CardDescription>
            {isFullLeaderboard 
              ? `The results are in for "${room.quiz.title}".`
              : 'Waiting for other gladiators to complete the challenge.'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {rankedPlayers.length > 0 ? (
            <>
            <div className="flex justify-center items-end gap-2 md:gap-4 p-4">
                {rankedPlayers.slice(1, 2).map((player) => (
                  <div key={player.studentId} className="flex flex-col items-center gap-2 p-2 md:p-4 rounded-lg bg-secondary order-2 md:order-1">
                    {getRankIcon(2)}
                    <Avatar className="h-16 w-16 md:h-20 md:w-20 border-4 border-slate-400">
                      <AvatarFallback className="text-3xl md:text-4xl bg-muted">{player.studentAvatar}</AvatarFallback>
                    </Avatar>
                    <span className="font-bold text-sm md:text-lg text-center max-w-20 truncate">{player.studentName}</span>
                    <span className="font-mono text-primary text-xs md:text-base">{player.totalScore} pts</span>
                  </div>
                ))}
                {rankedPlayers.slice(0, 1).map((player) => (
                    <div key={player.studentId} className="flex flex-col items-center gap-2 p-3 md:p-6 rounded-lg bg-secondary order-1 md:order-2 scale-110">
                        {getRankIcon(1)}
                        <Avatar className="h-20 w-20 md:h-24 md:w-24 border-4 border-yellow-400">
                            <AvatarFallback className="text-4xl md:text-5xl bg-muted">{player.studentAvatar}</AvatarFallback>
                        </Avatar>
                        <span className="font-bold text-base md:text-xl text-center max-w-24 truncate">{player.studentName}</span>
                        <span className="font-mono text-primary text-sm md:text-lg">{player.totalScore} pts</span>
                    </div>
                ))}
                {rankedPlayers.slice(2, 3).map((player) => (
                    <div key={player.studentId} className="flex flex-col items-center gap-2 p-2 md:p-4 rounded-lg bg-secondary order-3">
                        {getRankIcon(3)}
                        <Avatar className="h-16 w-16 md:h-20 md:w-20 border-4 border-yellow-600">
                            <AvatarFallback className="text-3xl md:text-4xl bg-muted">{player.studentAvatar}</AvatarFallback>
                        </Avatar>
                        <span className="font-bold text-sm md:text-lg text-center max-w-20 truncate">{player.studentName}</span>
                        <span className="font-mono text-primary text-xs md:text-base">{player.totalScore} pts</span>
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
                    <TableRow key={player.studentId} className={cn(user && player.id === user.id ? 'bg-primary/10' : '', index < 3 && 'bg-secondary/50')}>
                      <TableCell className="text-center font-bold">{index + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-lg bg-muted">{player.studentAvatar}</AvatarFallback>
                          </Avatar>
                          {player.studentName}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-primary">{player.totalScore}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!isFullLeaderboard && (
                <p className="text-center text-xs text-muted-foreground">The leaderboard will update in real-time as other players finish.</p>
              )}
            </>
          ) : (
             <p className="text-center text-muted-foreground py-8">No participants were recorded for this battle.</p>
          )}

          <div className="text-center pt-4">
            <Link href={isTeacher ? "/teacher/dashboard" : "/student/dashboard"} passHref>
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
