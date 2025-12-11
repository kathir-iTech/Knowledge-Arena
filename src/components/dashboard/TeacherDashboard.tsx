
"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, BarChart, Users, History, Loader2, Trash2, Copy } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useFirestore, useCollectionSafe, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, where, getDocs, orderBy, doc } from 'firebase/firestore';
import type { Quiz, Room, BattleResult } from '@/lib/types';
import { Skeleton } from '../ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useToast } from '@/hooks/use-toast';


const BattleRoomResults: React.FC<{ room: Room }> = ({ room }) => {
  const firestore = useFirestore();
  const [results, setResults] = useState<BattleResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  React.useEffect(() => {
    const fetchResults = async () => {
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
       <h4 className="font-semibold mb-2">Battle Results</h4>
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


const PastBattleRoomItem: React.FC<{ room: Room, onDelete: (roomId: string) => void }> = ({ room, onDelete }) => {
  const { toast } = useToast();
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: 'Copied!', description: `Room code ${text} copied to your clipboard.` });
    });
  };

  return (
    <AccordionItem value={room.id} className="bg-secondary/50 rounded-md px-4 border-b-0">
        <div className="flex items-center w-full">
            <AccordionTrigger className="w-full flex-grow py-4">
                <div className="w-full flex justify-between items-center pr-4">
                  <div className="flex flex-col items-start text-left">
                    <span className="font-medium">{room.quiz.topic}</span>
                     <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        Room Code: <span className="font-mono text-primary">{room.id}</span>
                      </div>
                  </div>
                  <div className="text-sm text-muted-foreground">{room.studentIds.length} participant(s)</div>
                </div>
            </AccordionTrigger>
            
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); copyToClipboard(room.id)}}>
                <Copy className="h-4 w-4" />
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="ml-2 shrink-0 h-8 w-8">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the battle room
                      and all associated results.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => onDelete(room.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
        </div>
        <AccordionContent>
            <BattleRoomResults room={room} />
        </AccordionContent>
    </AccordionItem>
  );
};


const TeacherDashboard = () => {
  const { user } = useAuth();
  const firestore = useFirestore();

  const battleRoomsQuery = useMemoFirebase(
    () => (user && firestore ? query(collection(firestore, `battleRooms`), where('teacherId', '==', user.id), orderBy('startTime', 'desc')) : null),
    [user, firestore]
  );
  
  const { data: rooms, isLoading: isLoadingRooms } = useCollectionSafe(battleRoomsQuery);
  const [optimisticRooms, setOptimisticRooms] = useState<Room[] | null>(null);

  React.useEffect(() => {
    if (rooms) {
      setOptimisticRooms(rooms);
    }
  }, [rooms]);
  
  const handleDeleteRoom = (roomId: string) => {
    if (!firestore) return;
    const roomRef = doc(firestore, 'battleRooms', roomId);
    deleteDocumentNonBlocking(roomRef);
    setOptimisticRooms(prev => prev ? prev.filter(room => room.id !== roomId) : null);
  }

  const displayedRooms = optimisticRooms ?? rooms;


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
            <CardTitle className="text-sm font-medium">Battles Hosted</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingRooms ? <Skeleton className="h-8 w-1/4 mt-1" /> : <div className="text-2xl font-bold">{displayedRooms?.length || 0}</div> }
            <p className="text-xs text-muted-foreground">Number of battles you have hosted</p>
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
            <CardTitle className="font-headline text-2xl flex items-center gap-2"><History /> Past Battles</CardTitle>
            <CardDescription>Review the battles you've created and their results.</CardDescription>
        </CardHeader>
        <CardContent>
            {isLoadingRooms && (
                <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                </div>
            )}
             {displayedRooms && displayedRooms.length > 0 ? (
               <Accordion type="single" collapsible className="w-full space-y-2">
                {displayedRooms.map(room => (
                  <PastBattleRoomItem key={room.id} room={room} onDelete={handleDeleteRoom} />
                ))}
              </Accordion>
            ) : (
                !isLoadingRooms && <p className="text-muted-foreground text-center py-8">You haven't created any battles yet.</p>
            )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeacherDashboard;
