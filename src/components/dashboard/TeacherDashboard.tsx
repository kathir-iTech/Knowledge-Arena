
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import type { BattleRoom, BattleParticipation } from '@/lib/types';
import { useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot, getDocs, doc, updateDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Loader2, Trash2, Users, Trophy, RefreshCw, Rocket } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from '../ui/avatar';
import { useToast } from '@/hooks/use-toast';
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
} from "@/components/ui/alert-dialog";
import { deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Badge } from '@/components/ui/badge';

const PastBattleRoomItem = ({ room }: { room: BattleRoom }) => {
    const [participants, setParticipants] = useState<BattleParticipation[]>([]);
    const [isLoadingParticipants, setIsLoadingParticipants] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const firestore = useFirestore();
    const { toast } = useToast();

    const fetchParticipants = async () => {
        if (!firestore || (participants.length > 0 && room.status === 'finished')) return;
        setIsLoadingParticipants(true);
        try {
            const participantsQuery = query(
                collection(firestore, 'battleRooms', room.id, 'participants'),
            );
            const snapshot = await getDocs(participantsQuery);
            const participantsData = snapshot.docs.map(doc => doc.data() as BattleParticipation);
            participantsData.sort((a,b) => b.totalScore - a.totalScore); // Sort client-side
            setParticipants(participantsData);
        } catch (error) {
            console.error("Error fetching participants: ", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not load participants.' });
        } finally {
            setIsLoadingParticipants(false);
        }
    };
    
    const resetStudentAttempt = (studentId: string) => {
        if (!firestore) return;

        const participantRef = doc(firestore, 'battleRooms', room.id, 'participants', studentId);
        updateDoc(participantRef, {
            isBlocked: false,
            malpracticeCount: 0
        }).then(() => {
            toast({ title: 'Success', description: 'Student attempt has been reset.' });
            // Refresh the participant list to reflect the change
            setParticipants(prev => prev.map(p => p.id === studentId ? { ...p, isBlocked: false, malpracticeCount: 0 } : p));
        }).catch(err => {
            console.error("Error resetting attempt:", err);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not reset student attempt.' });
        });
    };

    const handleDelete = async () => {
        if (!firestore) return;
        setIsDeleting(true);
        try {
            // This can be slow for many participants. Consider a Cloud Function for large-scale deletion.
            const participantsQuery = collection(firestore, 'battleRooms', room.id, 'participants');
            const participantsSnapshot = await getDocs(participantsQuery);
            participantsSnapshot.forEach(pDoc => {
                deleteDocumentNonBlocking(doc(firestore, 'battleRooms', room.id, 'participants', pDoc.id));
            });
            
            const roomRef = doc(firestore, 'battleRooms', room.id);
            deleteDocumentNonBlocking(roomRef);

            toast({ title: "Battle Deletion Initiated", description: `Battle room ${room.id} will be removed.` });
            // The UI will update automatically via the onSnapshot listener on the dashboard
        } catch (error) {
             console.error("Error deleting battle room:", error);
             toast({ variant: "destructive", title: "Deletion Failed", description: "Could not delete the battle room." });
             setIsDeleting(false);
        }
    }
    
    const getStatusVariant = (status: BattleRoom['status']) => {
        switch (status) {
            case 'waiting': return 'secondary';
            case 'in-progress': return 'default';
            case 'finished': return 'outline';
            default: return 'outline';
        }
    }

    return (
        <Card className="bg-secondary/50">
            <CardHeader className="flex flex-row items-start sm:items-center justify-between">
                <div className="flex-1">
                    <CardTitle className="text-xl font-headline">
                        {room.quiz?.title || 'Untitled Battle'}
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                        <CardDescription>Room Code: <span className="font-mono text-primary">{room.id}</span></CardDescription>
                        <Badge variant={getStatusVariant(room.status)}>{room.status}</Badge>
                    </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-4 mt-2 sm:mt-0">
                    {room.status === 'waiting' && (
                        <Link href={`/battle/${room.id}`} passHref>
                             <Button variant="outline">
                                <Rocket className="mr-2" />
                                Start Battle
                            </Button>
                        </Link>
                    )}
                     <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="w-5 h-5"/>
                        <span>{participants.length || room.participantCount || 0}</span>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="icon" disabled={isDeleting}>
                           <Trash2 />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the battle room
                             and all associated participant data.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
                            {isDeleting ? <Loader2 className="animate-spin" /> : "Delete"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                </div>
            </CardHeader>
             {room.status !== 'waiting' && (
                 <CardContent>
                    <Accordion type="single" collapsible onValueChange={() => { if(!participants.length) fetchParticipants() }}>
                        <AccordionItem value="item-1">
                            <AccordionTrigger>View Leaderboard & Attempts</AccordionTrigger>
                            <AccordionContent>
                                {isLoadingParticipants ? <Loader2 className="mx-auto my-4 animate-spin" /> : (
                                    <div className="space-y-2">
                                        {participants.length > 0 ? participants.map((p, index) => (
                                        <div key={p.id} className="flex items-center justify-between p-2 rounded-md bg-background/50">
                                            <div className="flex items-center gap-3">
                                                <span className="font-bold w-6 text-center">{index + 1}</span>
                                                <Avatar className="h-8 w-8">
                                                    <AvatarFallback className="text-lg bg-muted">{p.studentAvatar}</AvatarFallback>
                                                </Avatar>
                                                <div className='flex flex-col'>
                                                    <span>{p.studentName}</span>
                                                    {p.isBlocked && <span className="text-xs text-destructive">Blocked (Malpractice)</span>}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                    {p.isBlocked && (
                                                        <Button variant="outline" size="sm" onClick={() => resetStudentAttempt(p.id)}>
                                                            <RefreshCw className="w-3 h-3 mr-1" />
                                                            Reset
                                                        </Button>
                                                    )}
                                                    <div className="flex items-center gap-2 font-mono text-primary">
                                                        <Trophy className="w-4 h-4 text-yellow-400" />
                                                        {p.totalScore} pts
                                                    </div>
                                            </div>
                                        </div>
                                        )) : <p className="text-center text-muted-foreground">No participants recorded for this battle.</p>}
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

    setIsLoading(true);
    const roomsQuery = query(
        collection(firestore, 'battleRooms'),
        where('teacherId', '==', user.id)
    );

    const unsubscribe = onSnapshot(roomsQuery, (snapshot) => {
        const rooms = snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
        } as BattleRoom));
        
        // Sort on the client side to avoid needing an index
        rooms.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        setBattleRooms(rooms);
        setIsLoading(false);
    }, (error) => {
        console.error("Error fetching battle rooms: ", error);
        setIsLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, user]);


  if (!user || isLoading) {
    return <div className="flex justify-center items-center h-full p-8"><Loader2 className="w-16 h-16 animate-spin text-primary" /></div>;
  }
  
  return (
    <div className="p-4 md:p-8 space-y-8">
      <header>
        <h1 className="text-4xl font-headline tracking-tight text-primary">Teacher Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {user.name}. Manage your battles and create new challenges.</p>
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-3">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Your Battles</CardTitle>
                    <CardDescription>Manage your active sessions or review past results.</CardDescription>
                </div>
                 <Link href="/create-quiz" passHref>
                    <Button>
                        <PlusCircle className="mr-2" />
                        Create New Quiz
                    </Button>
                </Link>
            </CardHeader>
            <CardContent>
                {battleRooms.length > 0 ? (
                    <div className="space-y-4">
                        {battleRooms.map(room => <PastBattleRoomItem key={room.id} room={room} />)}
                    </div>
                ) : (
                    <div className="text-center py-10 border-2 border-dashed border-border rounded-lg">
                        <p className="text-muted-foreground">You haven't hosted any battles yet.</p>
                        <Link href="/create-quiz" passHref>
                            <Button variant="link" className="mt-2">Create your first quiz to get started</Button>
                        </Link>
                    </div>
                )}
            </CardContent>
        </Card>
      </div>
    </div>
  );
}

    