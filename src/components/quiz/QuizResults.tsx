
'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import type { BattleRoom, BattleParticipation } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Crown, Home, Loader2 } from 'lucide-react';
import { useCollection, useFirestore } from '@/firebase';
import { collection } from 'firebase/firestore';

interface QuizResultsProps {
  room: BattleRoom;
  isTeacher: boolean;
}

export default function QuizResults({ room, isTeacher }: QuizResultsProps) {
  const firestore = useFirestore();

  // All users (students and teachers) need to see the results.
  // The security rules should be updated to allow this.
  const participantsRef = useMemo(() => {
    if (!firestore) return null;
    return collection(firestore, `battleRooms/${room.id}/participants`);
  }, [firestore, room.id]);

  const { data: participants, isLoading } = useCollection<BattleParticipation>(participantsRef);

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

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 md:p-8">
      <Card className="w-full max-w-4xl border-primary/50 shadow-lg shadow-primary/10">
        <CardHeader className="text-center">
          <CardTitle className="text-4xl font-headline text-primary">Battle Over!</CardTitle>
          <CardDescription>The results are in for "{room.quiz.title}".</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {rankedPlayers.length > 0 ? (
            <>
            <div className="flex justify-center items-end gap-4 md:gap-8">
                {rankedPlayers.slice(0, 3).map((player, index) => {
                    const rank = index + 1;
                    let orderClass = '';
                    let scaleClass = '';
                    if (rank === 1) {
                        orderClass = 'order-2';
                        scaleClass = 'scale-110';
                    } else if (rank === 2) {
                        orderClass = 'order-1';
                    } else {
                        orderClass = 'order-3';
                    }
                  return (
                  <div
                    key={player.studentId}
                    className={`flex flex-col items-center gap-2 p-4 rounded-lg bg-secondary ${orderClass} ${scaleClass}`}
                  >
                    {getRankIcon(rank)}
                    <Avatar className="h-20 w-20 border-4 border-primary">
                      <AvatarFallback className="text-4xl bg-muted">{player.studentAvatar}</AvatarFallback>
                    </Avatar>
                    <span className="font-bold text-lg text-center">{player.studentName}</span>
                    <span className="font-mono text-primary">{player.totalScore} pts</span>
                  </div>
                )})}
              </div>
              
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px] text-center">Rank</TableHead>
                    <TableHead>Gladiator</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankedPlayers.map((player, index) => (
                    <TableRow key={player.studentId} className={index < 3 ? 'bg-secondary/50' : ''}>
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
            </>
          ) : (
             <p className="text-center text-muted-foreground py-8">No participants were recorded for this battle.</p>
          )}

          <div className="text-center pt-4">
            <Link href="/" passHref>
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
