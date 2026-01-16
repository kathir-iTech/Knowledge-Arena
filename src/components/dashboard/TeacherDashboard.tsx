
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import type { Battle, BattleParticipant } from '@/lib/types';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, where, onSnapshot, getDocs, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Loader2, Trash2, Users, Trophy, RefreshCw, Copy, CheckCircle } from 'lucide-react';
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
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Badge } from '@/components/ui/badge';

const BattleCard = ({ battle }: { battle: Battle }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isDeleting, setIsDeleting] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [isFinishing, setIsFinishing] = useState(false);
    
    const participantsCollectionRef = React.useMemo(() => {
        if (!firestore) return null;
        return collection(firestore, 'battles', battle.id, 'participants');
    }, [firestore, battle.id]);

    const { data: participants, isLoading: isLoadingParticipants } = useCollection<BattleParticipant>(participantsCollectionRef);

    const sortedParticipants = React.useMemo(() => {
        if (!participants) return [];
        return [...participants].sort((a,b) => b.score - a.score);
    }, [participants]);

    const resetStudentAttempt = (studentId: string) => {
        if (!firestore) return;

        const participantRef = doc(firestore, 'battles', battle.id, 'participants', studentId);
        updateDocumentNonBlocking(participantRef, {
            status: 'playing',
            violationsCount: 0
        });
        toast({ title: 'Success', description: 'Student attempt has been reset.' });
    };

    const handleDelete = async () => {
        if (!firestore) return;
        setIsDeleting(true);
        toast({ title: "Deletion in Progress", description: `Removing battle room ${battle.id} and all its data...` });
        try {
            // This is a complex delete and should ideally be handled by a Cloud Function
            // for robustness. For the client, we'll do our best.
            const batch = writeBatch(firestore);
            const battleRef = doc(firestore, 'battles', battle.id);

            // Delete all subcollections (participants, questions, etc.)
            const participantsSnap = await getDocs(collection(firestore, 'battles', battle.id, 'participants'));
            participantsSnap.forEach(doc => batch.delete(doc.ref));

            const questionsSnap = await getDocs(collection(firestore, 'battles', battle.id, 'questions'));
            questionsSnap.forEach(doc => batch.delete(doc.ref));
            
            const answerKeysSnap = await getDocs(collection(firestore, 'battles', battle.id, 'answerKeys'));
            answerKeysSnap.forEach(doc => batch.delete(doc.ref));

            // Finally, delete the battle document itself
            batch.delete(battleRef);
            
            await batch.commit();

            toast({ variant: "default", title: "Battle Deleted", description: `Battle room ${battle.id} was removed.` });
        } catch (error) {
             console.error("Error deleting battle room:", error);
             toast({ variant: "destructive", title: "Deletion Failed", description: "Could not delete the battle room." });
             setIsDeleting(false);
        }
    }
    
    const handleFinishBattle = async () => {
      if (!firestore) return;
      setIsFinishing(true);
      const battleRef = doc(firestore, 'battles', battle.id);
      try {
        await updateDoc(battleRef, { state: 'finished' });
        toast({ title: "Battle Finished", description: `Battle room ${battle.id} has been closed.` });
      } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not finish the battle.' });
      } finally {
        setIsFinishing(false);
      }
    };

    const handleResetBattle = async () => {
        if (!firestore) return;
        setIsResetting(true);
        try {
            // Delete all participant and answer data
            const batch = writeBatch(firestore);
            const participantsQuery = collection(firestore, 'battles', battle.id, 'participants');
            const participantsSnapshot = await getDocs(participantsQuery);
            participantsSnapshot.forEach(pDoc => {
                // Keep the teacher's participant doc, reset others
                if (pDoc.data().role !== 'teacher') {
                    batch.delete(pDoc.ref);
                }
            });
            // A more robust solution would also delete the `answers` subcollection

            // Reset the room state
            const roomRef = doc(firestore, 'battles', battle.id);
            batch.update(roomRef, { 
                state: 'waiting',
                currentQuestionIndex: -1
            });
            
            await batch.commit();
            toast({ title: "Battle Reset", description: `Battle room ${battle.id} is now in the waiting room.` });
        } catch (error) {
            console.error("Error resetting battle room:", error);
            toast({ variant: "destructive", title: "Reset Failed", description: "Could not reset the battle room." });
        } finally {
            setIsResetting(false);
        }
    };

    const getStatusVariant = (status: Battle['state']) => {
        switch (status) {
            case 'waiting': return 'secondary';
            case 'live': return 'default';
            case 'finished': return 'outline';
            default: return 'outline';
        }
    }

    const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text).then(() => {
        toast({ title: 'Copied!', description: `Room code ${text} copied to your clipboard.` });
      });
    };

    return (
        <Card className="bg-secondary/50">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex-1">
                    <Link href={`/battle/${battle.id}`}>
                        <CardTitle className="text-xl font-headline hover:underline">
                            {battle.title || 'Untitled Battle'}
                        </CardTitle>
                    </Link>
                    <div className="flex items-center flex-wrap gap-2 mt-1">
                        <div className="flex items-center gap-1 text-muted-foreground">
                            <span>Code:</span>
                            <span className="font-mono text-primary">{battle.id}</span>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(battle.id)}>
                                <Copy className="w-4 h-4"/>
                            </Button>
                        </div>
                        <Badge variant={getStatusVariant(battle.state)}>{battle.state}</Badge>
                         <div className="flex items-center gap-2 text-muted-foreground">
                            <Users className="w-5 h-5"/>
                            <span>{participants?.filter(p => p.role === 'student').length || 0}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-center">
                    {battle.state === 'live' && (
                        <Button variant="outline" size="sm" onClick={handleFinishBattle} disabled={isFinishing}>
                           {isFinishing ? <Loader2 className="animate-spin w-4 h-4" /> : 'Finish'}
                        </Button>
                    )}
                     {battle.state === 'finished' && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="secondary" size="sm" disabled={isResetting} tooltip="Reset Battle">
                                    {isResetting ? <Loader2 className="animate-spin w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                                    <span className='ml-2 hidden sm:inline'>Reset</span>
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will reset the battle, deleting all student scores and answers. 
                                    The room will return to the 'waiting' state. This action cannot be undone.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleResetBattle} disabled={isResetting}>
                                    {isResetting ? <Loader2 className="animate-spin" /> : "Confirm Reset"}
                                </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="icon" className='h-9 w-9' disabled={isDeleting}>
                           <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the battle room
                             and all associated data.
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
            <CardContent>
                <Accordion type="single" collapsible>
                    <AccordionItem value="item-1">
                        <AccordionTrigger>View Leaderboard & Attempts</AccordionTrigger>
                        <AccordionContent>
                            {isLoadingParticipants ? <Loader2 className="mx-auto my-4 animate-spin" /> : (
                                <div className="space-y-2">
                                    {sortedParticipants.length > 0 ? sortedParticipants.filter(p => p.role === 'student').map((p, index) => (
                                    <div key={p.id} className="flex items-center justify-between p-2 rounded-md bg-background/50 flex-wrap gap-2">
                                        <div className="flex items-center gap-3">
                                            <span className="font-bold w-6 text-center">{index + 1}</span>
                                            <Avatar className="h-8 w-8">
                                                <AvatarFallback className="text-lg bg-muted">{p.avatar}</AvatarFallback>
                                            </Avatar>
                                            <div className='flex flex-col'>
                                                <span className='flex items-center gap-1'>{p.name} {p.status === 'finished' && <CheckCircle className="w-4 h-4 text-green-500" />}</span>
                                                {p.status === 'blocked' && <span className="text-xs text-destructive">Blocked ({p.violationsCount} violations)</span>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                                {p.status === 'blocked' && (
                                                    <Button variant="outline" size="sm" onClick={() => resetStudentAttempt(p.id)}>
                                                        <RefreshCw className="w-3 h-3 mr-1" />
                                                        Reset
                                                    </Button>
                                                )}
                                                <div className="flex items-center gap-2 font-mono text-primary text-sm">
                                                    <Trophy className="w-4 h-4 text-yellow-400" />
                                                    {p.score} pts
                                                </div>
                                        </div>
                                    </div>
                                    )) : <p className="text-center text-muted-foreground">No participants have joined this battle yet.</p>}
                                </div>
                            )}
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </CardContent>
        </Card>
    );
}

export default function TeacherDashboard() {
  const { user } = useAuth();
  const firestore = useFirestore();
  const [battleRooms, setBattleRooms] = useState<Battle[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!firestore || !user) return;

    setIsLoading(true);
    const roomsQuery = query(
        collection(firestore, 'battles'),
        where('createdBy', '==', user.id)
    );

    const unsubscribe = onSnapshot(roomsQuery, (snapshot) => {
        const rooms = snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
        } as Battle));
        
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
            <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <CardTitle>Your Battles</CardTitle>
                    <CardDescription>Manage your active sessions or review past results.</CardDescription>
                </div>
                 <Link href="/create-quiz" passHref>
                    <Button className='w-full md:w-auto'>
                        <PlusCircle className="mr-2" />
                        Create New Quiz
                    </Button>
                </Link>
            </CardHeader>
            <CardContent>
                {battleRooms.length > 0 ? (
                    <div className="space-y-4">
                        {battleRooms.map(room => <BattleCard key={room.id} battle={room} />)}
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
