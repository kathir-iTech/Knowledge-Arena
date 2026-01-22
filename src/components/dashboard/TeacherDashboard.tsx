'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import type { Quiz, QuizParticipant } from '@/lib/types';
import { useFirestore, useCollection, updateDocumentNonBlocking } from '@/firebase';
import { collection, query, where, onSnapshot, getDocs, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Loader2, Trash2, Users, Trophy, RefreshCw, Copy, ShieldAlert } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';

const QuizCard = ({ quiz }: { quiz: Quiz }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isDeleting, setIsDeleting] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [isFinishing, setIsFinishing] = useState(false);
    
    const participantsCollectionRef = React.useMemo(() => {
        if (!firestore) return null;
        return collection(firestore, 'quizzes', quiz.id, 'participants');
    }, [firestore, quiz.id]);

    const { data: participants, isLoading: isLoadingParticipants } = useCollection<QuizParticipant>(participantsCollectionRef);

    const sortedParticipants = React.useMemo(() => {
        if (!participants) return [];
        return [...participants].sort((a,b) => b.score - a.score);
    }, [participants]);

    const resetStudentAttempt = (studentId: string) => {
        if (!firestore) return;

        const participantRef = doc(firestore, 'quizzes', quiz.id, 'participants', studentId);
        updateDocumentNonBlocking(participantRef, {
            status: 'playing',
            violationsCount: 0
        });
        toast({ title: 'Success', description: 'Student attempt has been reset.' });
    };

    const handleDelete = async () => {
        if (!firestore) return;
        setIsDeleting(true);
        toast({ title: "Deletion in Progress", description: `Removing quiz room ${quiz.id} and all its data...` });
        try {
            const batch = writeBatch(firestore);
            const quizRef = doc(firestore, 'quizzes', quiz.id);

            // This is a simplified deletion for client-side. A Cloud Function is more robust.
            const participantsSnap = await getDocs(collection(firestore, 'quizzes', quiz.id, 'participants'));
            participantsSnap.forEach(doc => batch.delete(doc.ref));

            const questionsSnap = await getDocs(collection(firestore, 'quizzes', quiz.id, 'questions'));
            questionsSnap.forEach(doc => batch.delete(doc.ref));
            
            const answerKeysSnap = await getDocs(collection(firestore, 'quizzes', quiz.id, 'answerKeys'));
            answerKeysSnap.forEach(doc => batch.delete(doc.ref));
            
            // It's not feasible to delete all submission subcollections from the client.
            // This is a known limitation of client-side operations. A Cloud Function would be needed for full cleanup.

            batch.delete(quizRef);
            
            await batch.commit();

            toast({ variant: "default", title: "Quiz Deleted", description: `Quiz room ${quiz.id} was removed.` });
        } catch (error) {
             toast({ variant: "destructive", title: "Deletion Failed", description: "Could not delete the quiz room." });
             setIsDeleting(false);
        }
    }
    
    const handleFinishQuiz = async () => {
      if (!firestore) return;
      setIsFinishing(true);
      const quizRef = doc(firestore, 'quizzes', quiz.id);
      try {
        await updateDoc(quizRef, { status: 'finished' });
        toast({ title: "Quiz Finished", description: `Quiz room ${quiz.id} has been closed.` });
      } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not finish the quiz.' });
      } finally {
        setIsFinishing(false);
      }
    };

    const handleResetQuiz = async () => {
        if (!firestore) return;
        setIsResetting(true);
        try {
            const batch = writeBatch(firestore);
            const participantsQuery = collection(firestore, 'quizzes', quiz.id, 'participants');
            const participantsSnapshot = await getDocs(participantsQuery);
            participantsSnapshot.forEach(pDoc => {
                // Keep the teacher, reset everyone else
                if (pDoc.data().role !== 'teacher') {
                    batch.delete(pDoc.ref);
                } else {
                    batch.update(pDoc.ref, { score: 0 });
                }
            });

            // Note: This doesn't delete student submission subcollections. That requires a Cloud Function.

            const roomRef = doc(firestore, 'quizzes', quiz.id);
            batch.update(roomRef, { 
                status: 'waiting',
                currentQuestionIndex: -1
            });
            
            await batch.commit();
            toast({ title: "Quiz Reset", description: `Quiz room ${quiz.id} is now in the waiting room.` });
        } catch (error) {
            toast({ variant: "destructive", title: "Reset Failed", description: "Could not reset the quiz room." });
        } finally {
            setIsResetting(false);
        }
    };

    const getStatusVariant = (status: Quiz['status']) => {
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
                    <Link href={`/battle/${quiz.id}`}>
                        <CardTitle className="text-xl font-headline hover:underline">
                            {quiz.title || 'Untitled Quiz'}
                        </CardTitle>
                    </Link>
                    <div className="flex items-center flex-wrap gap-2 mt-1">
                        <div className="flex items-center gap-1 text-muted-foreground">
                            <span>Code:</span>
                            <span className="font-mono text-primary">{quiz.id}</span>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(quiz.id)}>
                                <Copy className="w-4 h-4"/>
                            </Button>
                        </div>
                        <Badge variant={getStatusVariant(quiz.status)}>{quiz.status}</Badge>
                         <div className="flex items-center gap-2 text-muted-foreground">
                            <Users className="w-5 h-5"/>
                            <span>{participants?.filter(p => p.role === 'student').length || 0}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-center">
                    {quiz.status === 'waiting' && (
                        <Link href={`/battle/${quiz.id}`} passHref>
                            <Button variant="default" size="sm">
                                Start Quiz
                            </Button>
                        </Link>
                    )}
                    {quiz.status === 'live' && (
                        <Button variant="outline" size="sm" onClick={handleFinishQuiz} disabled={isFinishing}>
                           {isFinishing ? <Loader2 className="animate-spin w-4 h-4" /> : 'Finish'}
                        </Button>
                    )}
                     {quiz.status !== 'waiting' && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="secondary" size="sm" disabled={isResetting}>
                                    {isResetting ? <Loader2 className="animate-spin w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                                    <span className='ml-2 hidden sm:inline'>Reset</span>
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will reset the quiz, deleting all student scores and submissions. 
                                    The room will return to the 'waiting' state. This action cannot be undone.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleResetQuiz} disabled={isResetting}>
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
                            This action cannot be undone. This will permanently delete the quiz room
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
                                                <span className='flex items-center gap-1'>{p.name}</span>
                                                {p.status === 'blocked' && 
                                                  <Badge variant="destructive" className="w-fit">
                                                    <ShieldAlert className="w-3 h-3 mr-1" />
                                                    Blocked ({p.violationsCount} violations)
                                                  </Badge>
                                                }
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                                {p.status === 'blocked' && (
                                                    <Button variant="outline" size="sm" onClick={() => resetStudentAttempt(p.id)}>
                                                        <RefreshCw className="w-3 h-3 mr-1" />
                                                        Reset Attempt
                                                    </Button>
                                                )}
                                                <div className="flex items-center gap-2 font-mono text-primary text-sm">
                                                    <Trophy className="w-4 h-4 text-yellow-400" />
                                                    {p.score} pts
                                                </div>
                                        </div>
                                    </div>
                                    )) : <p className="text-center text-muted-foreground">No participants have joined this quiz yet.</p>}
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
  const [quizRooms, setQuizRooms] = useState<Quiz[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!firestore || !user) return;

    setIsLoading(true);
    const roomsQuery = query(
        collection(firestore, 'quizzes'),
        where('createdBy', '==', user.id)
    );

    const unsubscribe = onSnapshot(roomsQuery, (snapshot) => {
        const rooms = snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
        } as Quiz));
        
        rooms.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        setQuizRooms(rooms);
        setIsLoading(false);
    }, (error) => {
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
        <p className="text-muted-foreground">Welcome back, {user.name}. Manage your quizzes and create new challenges.</p>
      </header>
      
      <div className="grid grid-cols-1">
        <Card>
            <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <CardTitle>Your Quizzes</CardTitle>
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
                {quizRooms.length > 0 ? (
                    <div className="space-y-4">
                        {quizRooms.map(room => <QuizCard key={room.id} quiz={room} />)}
                    </div>
                ) : (
                    <div className="text-center py-10 border-2 border-dashed border-border rounded-lg">
                        <p className="text-muted-foreground">You haven't hosted any quizzes yet.</p>
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
