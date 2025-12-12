'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import type { BattleRoom, BattleResult } from '@/lib/types';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, orderBy, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Loader2, Trash2, Users, Trophy } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from '../ui/avatar';
import { useToast } from '@/hooks/use-toast';


const PastBattleRoomItem = ({ room }: { room: BattleRoom }) => {
    const [results, setResults] = useState<BattleResult[]>([]);
    const [isLoadingResults, setIsLoadingResults] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const firestore = useFirestore();
    const { toast } = useToast();

    const fetchResults = async () => {
        if (!firestore || !room.battleResultIds || room.battleResultIds.length === 0) return;
        setIsLoadingResults(true);
        try {
            const resultsQuery = query(
                collection(firestore, 'battleResults'),
                where('battleRoomId', '==', room.id),
                orderBy('score', 'desc')
            );
            const snapshot = await getDocs(resultsQuery);
            const battleResults = snapshot.docs.map(doc => doc.data() as BattleResult);
            setResults(battleResults);
        } catch (error) {
            console.error("Error fetching results: ", error);
        } finally {
            setIsLoadingResults(false);
        }
    };

    const handleDelete = async () => {
        if (!firestore) return;
        setIsDeleting(true);
        try {
            const batch = writeBatch(firestore);

            // Delete all associated results
            if (room.battleResultIds && room.battleResultIds.length > 0) {
                 const resultsQuery = query(collection(firestore, 'battleResults'), where('battleRoomId', '==', room.id));
                 const resultsSnapshot = await getDocs(resultsQuery);
                 resultsSnapshot.forEach(doc => batch.delete(doc.ref));
            }
            
            // Delete the battle room itself
            const roomRef = doc(firestore, 'battleRooms', room.id);
            batch.delete(roomRef);
            
            await batch.commit();

            toast({ title: "Battle Deleted", description: `Battle room ${room.id} and all its results have been removed.` });
             // Note: The parent component will refetch and this item will disappear.
        } catch (error) {
             console.error("Error deleting battle room:", error);
             toast({ variant: "destructive", title: "Deletion Failed", description: "Could not delete the battle room." });
             setIsDeleting(false);
        }
    }

    const participantCount = room.studentIds?.length || 0;

    return (
        <Card className="bg-secondary/50">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="text-xl font-headline">
                        {room.quiz?.topic || 'Untitled Battle'}
                    </CardTitle>
                    <CardDescription>Room Code: <span className="font-mono text-primary">{room.id}</span></CardDescription>
                </div>
                <div className="flex items-center gap-4">
                     <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="w-5 h-5"/>
                        <span>{participantCount}</span>
                    </div>
                   <Button variant="destructive" size="icon" onClick={handleDelete} disabled={isDeleting}>
                     {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                   </Button>
                </div>
            </CardHeader>
             {participantCount > 0 && (
                 <CardContent>
                    <Accordion type="single" collapsible onValueChange={() => { if(results.length === 0) fetchResults() }}>
                        <AccordionItem value="item-1">
                            <AccordionTrigger>View Leaderboard</AccordionTrigger>
                            <AccordionContent>
                                {isLoadingResults ? <Loader2 className="mx-auto my-4 animate-spin" /> : (
                                    <div className="space-y-2">
                                        {results.length > 0 ? results.map((result, index) => (
                                           <div key={result.studentId} className="flex items-center justify-between p-2 rounded-md bg-background/50">
                                               <div className="flex items-center gap-3">
                                                  <span className="font-bold w-6 text-center">{index + 1}</span>
                                                  <Avatar className="h-8 w-8">
                                                    <AvatarFallback className="text-lg bg-muted">{result.studentAvatar}</AvatarFallback>
                                                  </Avatar>
                                                  <span>{result.studentName}</span>
                                               </div>
                                               <div className="flex items-center gap-2 font-mono text-primary">
                                                  <Trophy className="w-4 h-4 text-yellow-400" />
                                                  {result.score} pts
                                               </div>
                                           </div>
                                        )) : <p className="text-center text-muted-foreground">No results recorded for this battle.</p>}
                                    </div>
                                )}
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                 </CardContent>
            )}
        </Card>
    );
}

export default function TeacherDashboard() {
  const { user } = useAuth();
  const firestore = useFirestore();
  const [battleRooms, setBattleRooms] = useState<BattleRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!firestore || !user) return;

    const fetchRooms = async () => {
      setIsLoading(true);
      try {
        const roomsQuery = query(
          collection(firestore, 'battleRooms'),
          where('teacherId', '==', user.id),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(roomsQuery);
        const rooms = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as BattleRoom));
        setBattleRooms(rooms);
      } catch (error) {
        console.error("Error fetching battle rooms: ", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRooms();
  }, [firestore, user]);


  if (!user) {
    return <Loader2 className="w-16 h-16 animate-spin text-primary" />;
  }
  

  return (
    <div className="p-4 md:p-8 space-y-8">
      <header>
        <h1 className="text-4xl font-headline tracking-tight text-primary">Teacher Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {user.name}. Manage your battles and create new challenges.</p>
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Past Battles</CardTitle>
                    <CardDescription>Review the results of your previously hosted battles.</CardDescription>
                </div>
                 <Link href="/create-quiz" passHref>
                    <Button>
                        <PlusCircle className="mr-2" />
                        Create New Quiz
                    </Button>
                </Link>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center items-center h-40">
                        <Loader2 className="w-8 h-8 animate-spin" />
                    </div>
                ) : battleRooms.length > 0 ? (
                    <div className="space-y-4">
                        {battleRooms.map(room => <PastBattleRoomItem key={room.id} room={room} />)}
                    </div>
                ) : (
                    <div className="text-center py-10 border-2 border-dashed border-border rounded-lg">
                        <p className="text-muted-foreground">You haven't hosted any battles yet.</p>
                        <Link href="/create-quiz" passHref>
                            <Button variant="link" className="mt-2">Create your first quiz</Button>
                        </Link>
                    </div>
                )}
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                 <div className="flex justify-between items-center p-4 bg-secondary rounded-lg">
                    <span className="font-medium">Battles Hosted</span>
                    <span className="font-bold text-2xl text-primary">{battleRooms.length}</span>
                </div>
                 <div className="flex justify-between items-center p-4 bg-secondary rounded-lg">
                    <span className="font-medium">Total Participants</span>
                    <span className="font-bold text-2xl text-primary">
                        {battleRooms.reduce((acc, room) => acc + (room.studentIds?.length || 0), 0)}
                    </span>
                </div>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
