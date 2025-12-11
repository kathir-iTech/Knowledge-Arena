
"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Room, Quiz, BattleResult } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Crown, Home, Loader2 } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

interface QuizResultsProps {
  room: Room;
  quiz: Quiz;
}

const QuizResults: React.FC<QuizResultsProps> = ({ room, quiz }) => {
  const [rankedPlayers, setRankedPlayers] = useState<BattleResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const firestore = useFirestore();

  useEffect(() => {
    const fetchResults = async () => {
      if (!firestore || !room.battleResultIds || room.battleResultIds.length === 0) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const resultsQuery = query(
          collection(firestore, 'battleResults'),
          where('battleRoomId', '==', room.id),
          orderBy('score', 'desc')
        );
        const snapshot = await getDocs(resultsQuery);
        const results = snapshot.docs.map(doc => doc.data() as BattleResult);
        setRankedPlayers(results);
      } catch (error) {
        console.error("Error fetching results: ", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchResults();
  }, [firestore, room.id, room.battleResultIds]);


  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-6 h-6 text-yellow-400" />;
    if (rank === 2) return <Crown className="w-6 h-6 text-slate-400" />;
    if (rank === 3) return <Crown className="w-6 h-6 text-yellow-600" />;
    return <span className="text-sm font-bold">{rank}</span>;
  };

  if (isLoading) {
      return (
          <div className="flex flex-col items-center justify-center h-screen p-4">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <h1 className="text-2xl font-headline text-primary mt-4">Calculating Results...</h1>
          </div>
      );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 md:p-8">
      <Card className="w-full max-w-4xl border-primary/50 shadow-lg shadow-primary/10">
        <CardHeader className="text-center">
          <CardTitle className="text-4xl font-headline text-primary">Battle Over!</CardTitle>
          <CardDescription>The results are in for "{quiz.topic}".</CardDescription>
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
                    <span className="font-mono text-primary">{player.score} pts</span>
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
                      <TableCell className="text-right font-mono text-primary">{player.score}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          ) : (
             <p className="text-center text-muted-foreground py-8">No results to display for this battle.</p>
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

export default QuizResults;
