
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import type { Quiz, QuizParticipant } from '@/lib/types';
import { useFirestore, useCollection, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, where, onSnapshot, doc, getDocs, writeBatch } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Loader2, Trash2, Users, Trophy, RefreshCw, Copy, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';

const QuizCard = ({ quiz }: { quiz: Quiz }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isProcessing, setIsProcessing] = useState(false);

    const partsRef = useMemo(() => firestore ? collection(firestore, 'quizzes', quiz.id, 'participants') : null, [firestore, quiz.id]);
    const { data: participants } = useCollection<QuizParticipant>(partsRef);

    const handleResetStudent = (sid: string) => {
        if (!firestore) return;
        updateDocumentNonBlocking(doc(firestore, 'quizzes', quiz.id, 'participants', sid), { status: 'playing', violationsCount: 0 });
        toast({ title: 'Student Reset', description: 'Malpractice block cleared.' });
    };

    const handleDelete = async () => {
        if (!firestore) return;
        setIsProcessing(true);
        try {
            const batch = writeBatch(firestore);
            const pSnap = await getDocs(collection(firestore, 'quizzes', quiz.id, 'participants'));
            pSnap.forEach(d => batch.delete(d.ref));
            const qSnap = await getDocs(collection(firestore, 'quizzes', quiz.id, 'questions'));
            qSnap.forEach(d => batch.delete(d.ref));
            const aSnap = await getDocs(collection(firestore, 'quizzes', quiz.id, 'answerKeys'));
            aSnap.forEach(d => batch.delete(d.ref));
            batch.delete(doc(firestore, 'quizzes', quiz.id));
            await batch.commit();
            toast({ title: 'Quiz Deleted' });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error deleting' });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleResetQuiz = async () => {
        if (!firestore) return;
        setIsProcessing(true);
        try {
            const batch = writeBatch(firestore);
            const pSnap = await getDocs(collection(firestore, 'quizzes', quiz.id, 'participants'));
            pSnap.forEach(d => {
              if (d.data().role === 'student') batch.delete(d.ref);
              else batch.update(d.ref, { score: 0 });
            });
            batch.update(doc(firestore, 'quizzes', quiz.id), { status: 'waiting', currentQuestionIndex: -1 });
            await batch.commit();
            toast({ title: 'Quiz Reset', description: 'Room is back to waiting.' });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error resetting' });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Card className="bg-secondary/20">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="hover:underline"><Link href={`/battle/${quiz.id}`}>{quiz.title}</Link></CardTitle>
                    <div className="flex gap-2 items-center mt-2">
                        <Badge variant="outline" className="font-mono">{quiz.id}</Badge>
                        <Badge>{quiz.status}</Badge>
                        <span className="text-sm text-muted-foreground flex items-center gap-1"><Users className="w-4 h-4" />{participants?.filter(p => p.role === 'student').length || 0}</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    {quiz.status === 'waiting' && <Button asChild size="sm"><Link href={`/battle/${quiz.id}`}>Start</Link></Button>}
                    <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="outline" size="sm" disabled={isProcessing}><RefreshCw className="w-4 h-4" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Reset Quiz?</AlertDialogTitle><AlertDialogDescription>This clears all scores and results.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleResetQuiz}>Reset</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="destructive" size="sm" disabled={isProcessing}><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Delete Quiz?</AlertDialogTitle><AlertDialogDescription>Permanent action. All data will be lost.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive">Delete</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </CardHeader>
            {participants && participants.some(p => p.status === 'blocked') && (
              <CardContent>
                <div className="space-y-2">
                  <p className="text-xs font-bold text-destructive uppercase">Blocked Students:</p>
                  {participants.filter(p => p.status === 'blocked').map(p => (
                    <div key={p.id} className="flex items-center justify-between p-2 bg-destructive/10 rounded border border-destructive/20">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6"><AvatarFallback className="text-[10px]">{p.avatar}</AvatarFallback></Avatar>
                        <span className="text-sm">{p.name}</span>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleResetStudent(p.id)}>Reset Attempt</Button>
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

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin h-12 w-12 text-primary" /></div>;

  return (
    <div className="p-4 md:p-8 space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-headline text-primary">Teacher Dashboard</h1>
          <p className="text-muted-foreground">Manage your arena. Total rooms: {quizzes.length}</p>
        </div>
        <Button asChild><Link href="/create-quiz"><PlusCircle className="mr-2" />New Quiz</Link></Button>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {quizzes.map(q => <QuizCard key={q.id} quiz={q} />)}
        {quizzes.length === 0 && <p className="text-muted-foreground italic">No quizzes created yet.</p>}
      </div>
    </div>
  );
}
