
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore } from '@/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Loader2, Swords } from 'lucide-react';
import type { QuizParticipant } from '@/lib/types';

export default function StudentDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();

  const [roomCode, setRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleJoinQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim() || !firestore || !user) return;

    setIsLoading(true);
    const quizId = roomCode.trim().toUpperCase();

    try {
      // 1. Check if the quiz exists
      const quizRef = doc(firestore, 'quizzes', quizId);
      const quizSnap = await getDoc(quizRef);

      if (!quizSnap.exists()) {
        toast({
          variant: 'destructive',
          title: 'Room Not Found',
          description: `The quiz room with code "${quizId}" does not exist.`,
        });
        setIsLoading(false);
        return;
      }
      
      const quizData = quizSnap.data();
      if (quizData.status === 'finished') {
        toast({
            variant: 'destructive',
            title: 'Quiz Finished',
            description: `This quiz has already ended.`,
        });
        setIsLoading(false);
        return;
      }
      
      // 2. Check if the student is already a participant and their status
      const participantRef = doc(firestore, 'quizzes', quizId, 'participants', user.id);
      const participantSnap = await getDoc(participantRef);

      if (participantSnap.exists()) {
          const participantData = participantSnap.data() as QuizParticipant;
          if (participantData.status === 'blocked') {
              toast({
                  variant: 'destructive',
                  title: 'Action Denied',
                  description: 'You are blocked from this quiz. Please ask your teacher to reset your attempt.',
              });
              setIsLoading(false);
              return;
          }
          if (participantData.status === 'finished') {
            toast({
                variant: 'destructive',
                title: 'Quiz Already Completed',
                description: "You have already finished this quiz and can't re-enter.",
            });
            setIsLoading(false);
            return;
          }
          // If they already exist and are not blocked, they can just proceed to the quiz page
      } else {
          // 3. If not a participant, create the participant document to "join"
          const newParticipant: Omit<QuizParticipant, 'id'> = {
            name: user.name,
            avatar: user.avatar,
            role: 'student',
            score: 0,
            status: 'playing',
            violationsCount: 0,
          };
          // This create operation is allowed by security rules
          await setDoc(participantRef, newParticipant);
      }
      
      // 4. Redirect to the quiz room
      router.push(`/battle/${quizId}`);

    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Error Joining Quiz',
            description: error.message || 'An unexpected error occurred. Please try again.',
        });
       setIsLoading(false);
    }
  };

  if (!user) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="w-16 h-16 animate-spin" /></div>;
  }

  return (
    <div className="p-4 md:p-8 space-y-8">
       <header>
        <h1 className="text-4xl font-headline tracking-tight text-primary">Student Dashboard</h1>
        <p className="text-muted-foreground">Welcome, Gladiator {user.name}. Your next challenge awaits.</p>
      </header>

       <div className="flex justify-center px-4">
         <Card className="w-full max-w-md border-accent/50 shadow-lg shadow-accent/10">
          <CardHeader>
            <CardTitle className="font-headline text-center text-2xl">Enter the Arena</CardTitle>
            <CardDescription className="text-center">Enter the code provided by your teacher to join the battle.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoinQuiz} className="space-y-4">
              <Input
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                placeholder="ROOM CODE"
                className="text-center text-2xl h-14 tracking-widest font-mono uppercase"
                maxLength={6}
                autoCapitalize="characters"
              />
              <Button type="submit" className="w-full text-lg h-12" disabled={isLoading || roomCode.length < 6}>
                {isLoading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Swords className="mr-2 h-5 w-5" />
                )}
                Join Quiz
              </Button>
            </form>
          </CardContent>
        </Card>
       </div>
    </div>
  );
}
