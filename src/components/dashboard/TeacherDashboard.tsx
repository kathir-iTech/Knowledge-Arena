
"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, BarChart, Users, History, ChevronDown, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import type { Quiz, Room, BattleResult } from '@/lib/types';
import { Skeleton } from '../ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';


const BattleRoomResults: React.FC<{ room: Room }> = ({ room }) => {
  const firestore = useFirestore();
  const [results, setResults] = useState<BattleResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  React.useEffect(() => {
    const fetchResults = async () => {
      // Defensive check for battleResultIds
      if (!firestore || !room.battleResultIds || room.battleResultIds.length === 0) {
        setIsLoading(false);
        return;
      }
      const resultsQuery = query(
        collection(firestore, 'battleResults'),
        where('__name__', 'in', room.battleResultIds),
        orderBy('score', 'desc')
      );
      const resultsSnapshot = await getDocs(resultsQuery);
      const resultsData = resultsSnapshot.docs.map(doc => doc.data() as BattleResult);
      setResults(resultsData);
      setIsLoading(false);
    };

    fetchResults();
  }, [firestore, room.battleResultIds]);

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (results.length === 0) {
    return <p className="text-sm text-muted-foreground p-4 text-center">No results yet for this battle.</p>;
  }

  return (
    <div className="p-4 bg-background rounded-md">
       <h4 className="font-semibold mb-2">Battle Results (Room: {room.id})</h4>
       <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rank</TableHead>
              <TableHead>Student</TableHead>
              <TableHead className="text-right">Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((result, index) => (
               <TableRow key={result.studentId}>
                  <TableCell className="font-bold">{index + 1}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                       <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-muted text-sm">{result.studentAvatar}</AvatarFallback>
                       </Avatar>
                       <span>{result.studentName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-primary">{result.score}</TableCell>
               </TableRow>
            ))}
          </TableBody>
       </Table>
    </div>
  );
};


const PastQuizItem: React.FC<{ quiz: Quiz }> = ({ quiz }) => {
  const firestore = useFirestore();
  const [battleRooms, setBattleRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const fetchBattleRooms = async () => {
    if (!firestore) return;
    setIsLoading(true);
    const roomsQuery = query(
      collection(firestore, 'battleRooms'),
      where('quizId', '==', quiz.id),
      where('teacherId', '==', quiz.teacherId)
    );
    const roomsSnapshot = await getDocs(roomsQuery);
    const roomsData = roomsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Room));
    setBattleRooms(roomsData);
    setIsLoading(false);
  };

  return (
    <AccordionItem value={quiz.id}>
      <AccordionTrigger onClick={fetchBattleRooms}>
        <div className="flex justify-between items-center w-full pr-4">
            <span className="font-medium">{quiz.topic}</span>
            <span className="text-sm text-muted-foreground">{quiz.questions.length} questions</span>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        {isLoading && <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>}
        {!isLoading && battleRooms.length === 0 && <p className="text-sm text-muted-foreground p-4">No battle rooms found for this quiz.</p>}
        {!isLoading && battleRooms.length > 0 && (
           <Accordion type="single" collapsible className="w-full space-y-2">
             {battleRooms.map(room => (
               <AccordionItem key={room.id} value={room.id} className="bg-secondary/50 rounded-md px-4">
                  <AccordionTrigger>
                      <div className="w-full flex justify-between items-center pr-4">
                        <div>Room Code: <span className="font-mono text-primary">{room.id}</span></div>
                        <div className="text-sm text-muted-foreground">{room.studentIds.length} participant(s)</div>
                      </div>
                  </AccordionTrigger>
                  <AccordionContent>
                      <BattleRoomResults room={room} />
                  </AccordionContent>
               </AccordionItem>
             ))}
           </Accordion>
        )}
      </AccordionContent>
    </AccordionItem>
  );
};


const TeacherDashboard = () => {
  const { user } = useAuth();
  const firestore = useFirestore();

  const quizzesQuery = useMemoFirebase(
    () => (user && firestore ? query(collection(firestore, `users/${user.id}/quizzes`)) : null),
    [user, firestore]
  );
  const { data: quizzes, isLoading: isLoadingQuizzes } = useCollection<Quiz>(quizzesQuery);

  return (
    <div className="p-4 md:p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-headline tracking-tight">Welcome, Gladiator <span className="text-primary">{user?.name}</span></h1>
        <p className="text-muted-foreground">Ready to forge the next challenge for your students?</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-primary/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total XP</CardTitle>
            <BarChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{user?.xp || 0}</div>
            <p className="text-xs text-muted-foreground">Your experience points</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quizzes Created</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingQuizzes ? <Skeleton className="h-8 w-1/4 mt-1" /> : <div className="text-2xl font-bold">{quizzes?.length || 0}</div> }
            <p className="text-xs text-muted-foreground">Number of quizzes you have created</p>
          </CardContent>
        </Card>
      </div>

       <Card className="bg-gradient-to-br from-secondary to-background border-accent">
        <CardHeader>
          <CardTitle className="font-headline text-2xl">Create a New Battle</CardTitle>
          <CardDescription>Design a new quiz and generate a battle room for your students to join.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/create-quiz" passHref>
            <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground">
              <PlusCircle className="mr-2 h-5 w-5" />
              Create New Quiz
            </Button>
          </Link>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
            <CardTitle className="font-headline text-2xl flex items-center gap-2"><History /> Past Quizzes</CardTitle>
            <CardDescription>Review the quizzes you've created and their battle results.</CardDescription>
        </CardHeader>
        <CardContent>
            {isLoadingQuizzes && (
                <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            )}
             {quizzes && quizzes.length > 0 ? (
               <Accordion type="single" collapsible className="w-full">
                {quizzes.map(quiz => (
                  <PastQuizItem key={quiz.id} quiz={quiz} />
                ))}
              </Accordion>
            ) : (
                !isLoadingQuizzes && <p className="text-muted-foreground text-center py-8">You haven't created any quizzes yet.</p>
            )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeacherDashboard;
