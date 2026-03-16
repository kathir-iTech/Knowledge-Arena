
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import type { Quiz, QuizParticipant } from '@/lib/types';
import { useFirestore, useCollection, updateDocumentNonBlocking } from '@/firebase';
import { collection, query, where, onSnapshot, doc, getDocs, writeBatch } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Loader2, Trash2, Users, RefreshCw, PlayCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { cn } from '@/lib/utils';

const QuizCard = ({ quiz }: { quiz: Quiz }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isProcessing, setIsProcessing] = useState(false);

    const partsRef = useMemo(() => firestore ? collection(firestore, 'quizzes', quiz.id, 'participants') : null, [firestore, quiz.id]);
    const { data: participants } = useCollection<QuizParticipant>(partsRef);

    const handleResetStudent = (sid: string) => {
        if (!firestore) return;
        updateDocumentNonBlocking(doc(firestore, 'quizzes', quiz.id, 'participants', sid), { 
            status: 'playing', 
            violationsCount: 0 
        });
        toast({ title: 'Student Reset', description: 'Malpractice block has been cleared.' });
    };

    const handleDelete = async () => {
        if (!firestore) return;
        setIsProcessing(true);
        try {
            const batch = writeBatch(firestore);
            
            // 1. Delete participants
            const pSnap = await getDocs(collection(firestore, 'quizzes', quiz.id, 'participants'));
            pSnap.forEach(d => batch.delete(d.ref));
            
            // 2. Delete questions and their submissions
            const qSnap = await getDocs(collection(firestore, 'quizzes', quiz.id, 'questions'));
            for (const qDoc of qSnap.docs) {
              const subSnap = await getDocs(collection(qDoc.ref, 'submissions'));
              subSnap.forEach(s => batch.delete(s.ref));
              batch.delete(qDoc.ref);
            }
            
            // 3. Delete answer keys
            const aSnap = await getDocs(collection(firestore, 'quizzes', quiz.id, 'answerKeys'));
            aSnap.forEach(d => batch.delete(d.ref));
            
            // 4. Delete the main quiz document
            batch.delete(doc(firestore, 'quizzes', quiz.id));
            
            await batch.commit();
            toast({ title: 'Arena Purged', description: 'Quiz room and all data destroyed.' });
        } catch (e) {
            console.error("Delete error:", e);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not delete quiz.' });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleResetQuiz = async () => {
        if (!firestore) return;
        setIsProcessing(true);
        try {
            const batch = writeBatch(firestore);
            
            // 1. Reset participant scores and remove students
            const pSnap = await getDocs(collection(firestore, 'quizzes', quiz.id, 'participants'));
            pSnap.forEach(d => {
              if (d.data().role === 'student') {
                batch.delete(d.ref); // Students must re-join for a fresh start
              } else {
                batch.update(d.ref, { score: 0 }); // Reset teacher score
              }
            });

            // 2. Reset quiz metadata
            batch.update(doc(firestore, 'quizzes', quiz.id), { 
                status: 'waiting', 
                currentQuestionIndex: -1,
                questionStartAt: null 
            });

            // 3. Purge all submissions
            const qSnap = await getDocs(collection(firestore, 'quizzes', quiz.id, 'questions'));
            for (const qDoc of qSnap.docs) {
              const subSnap = await getDocs(collection(qDoc.ref, 'submissions'));
              subSnap.forEach(s => batch.delete(s.ref));
            }

            await batch.commit();
            toast({ title: 'Quiz Reset', description: 'Room returned to waiting state.' });
        } catch (e) {
            console.error("Reset error:", e);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not reset quiz.' });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Card className="bg-secondary/10 border-primary/20 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                    <CardTitle className="text-xl hover:text-primary transition-colors">
                        <Link href={`/battle/${quiz.id}`}>{quiz.title}</Link>
                    </CardTitle>
                    <div className="flex gap-2 items-center">
                        <Badge variant="outline" className="font-mono bg-background">{quiz.id}</Badge>
                        <Badge className={cn(
                            quiz.status === 'live' ? "bg-green-500/10 text-green-500 border-green-500/20" : 
                            quiz.status === 'finished' ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary border-primary/20"
                        )}>
                            {quiz.status.toUpperCase()}
                        </Badge>
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {participants?.filter(p => p.role === 'student').length || 0}
                        </span>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button asChild size="sm" variant={quiz.status === 'waiting' ? 'default' : 'outline'}>
                        <Link href={`/battle/${quiz.id}`}>
                            {quiz.status === 'waiting' ? (
                                <><PlayCircle className="mr-2 h-4 w-4" /> Start Battle</>
                            ) : 'Enter Arena'}
                        </Link>
                    </Button>
                    
                    {quiz.status === 'finished' && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="outline" size="icon" className="h-9 w-9" disabled={isProcessing}>
                                    <RefreshCw className="w-4 h-4" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Reset Quiz?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will purge all scores and student entries. The room will return to the 'Waiting' state.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Keep results</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleResetQuiz}>Reset Room</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" className="h-9 w-9" disabled={isProcessing}>
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete Arena?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action is permanent. The quiz room and all gladiator history will be destroyed forever.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Destroy Forever</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </CardHeader>
            {participants && participants.some(p => p.status === 'blocked') && (
              <CardContent className="pt-2">
                <div className="space-y-2 p-3 bg-destructive/5 rounded-lg border border-destructive/10">
                  <p className="text-[10px] font-black text-destructive uppercase tracking-widest">Awaiting Amnesty (Blocked):</p>
                  {participants.filter(p => p.status === 'blocked').map(p => (
                    <div key={p.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6"><AvatarFallback className="text-[10px]">{p.avatar}</AvatarFallback></Avatar>
                        <span className="text-sm font-medium">{p.name}</span>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 px-3 text-xs text-destructive hover:bg-destructive/10" onClick={() => handleResetStudent(p.id)}>Unblock</Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
        </Card>
    );
};

export default function TeacherDashboard() {
  const { user } = useAuth();
  const firestore = useFirestore();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firestore || !user) return;
    const q = query(collection(firestore, 'quizzes'), where('createdBy', '==', user.id));
    return onSnapshot(q, (snap) => {
      setQuizzes(snap.docs.map(d => ({ ...d.data(), id: d.id } as Quiz)).sort((a,b) => b.createdAt - a.createdAt));
      setLoading(false);
    });
  }, [firestore, user]);

  if (loading) return <div className="p-8 flex justify-center h-[50vh] items-center"><Loader2 className="animate-spin h-12 w-12 text-primary" /></div>;

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-6xl mx-auto">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-headline text-primary">Commander's Dashboard</h1>
          <p className="text-muted-foreground">Manage your battle rooms and review gladiator performance.</p>
        </div>
        <Button asChild size="lg" className="h-14 px-8 shadow-lg shadow-primary/20">
            <Link href="/create-quiz"><PlusCircle className="mr-2 h-5 w-5" />Construct New Arena</Link>
        </Button>
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {quizzes.map(q => <QuizCard key={q.id} quiz={q} />)}
        {quizzes.length === 0 && (
            <div className="md:col-span-2 py-20 text-center border-2 border-dashed border-muted rounded-3xl">
                <p className="text-muted-foreground text-lg mb-4">No arenas have been constructed yet.</p>
                <Button asChild variant="outline"><Link href="/create-quiz">Create Your First Quiz</Link></Button>
            </div>
        )}
      </div>
    </div>
  );
}
