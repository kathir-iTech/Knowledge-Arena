
'use client';

import React, { useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useDoc, useFirestore } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { Quiz, QuizParticipant } from '@/lib/types';
import { Loader2, ShieldX } from 'lucide-react';
import LiveQuiz from '@/components/quiz/LiveQuiz';
import QuizResults from '@/components/quiz/QuizResults';
import WaitingRoom from '@/components/quiz/WaitingRoom';
import { Button } from '../ui/button';

export default function BattleRoomLoader() {
  const { roomCode } = useParams();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const firestore = useFirestore();

  const quizId = roomCode as string;

  const quizRef = useMemo(() => {
    if (!firestore || !quizId) return null;
    return doc(firestore, 'quizzes', quizId);
  }, [firestore, quizId]);
  const { data: quiz, isLoading: isQuizLoading, error: quizError } = useDoc<Quiz>(quizRef);

  const participantRef = useMemo(() => {
    if (!firestore || !quizId || !user) return null;
    return doc(firestore, `quizzes/${quizId}/participants`, user.id);
  }, [firestore, quizId, user]);
  const { data: participant, isLoading: isParticipantLoading } = useDoc<QuizParticipant>(participantRef);

  useEffect(() => {
    if (participant?.status === 'blocked') {
      router.push('/kicked');
    }
  }, [participant, router]);

  const isLoading = isAuthLoading || isQuizLoading || isParticipantLoading;

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Entering the Arena...</p>
      </div>
    );
  }
  
  if (quizError || !quiz) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 text-center">
        <ShieldX className="h-12 w-12 text-destructive" />
        <h1 className="text-2xl font-bold">Room Not Found</h1>
        <p className="text-muted-foreground">This quiz room does not exist or has been closed.</p>
        <Button onClick={() => router.push('/')}>Return to Dashboard</Button>
      </div>
    );
  }
  
  if (!user || !participant) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Joining Quiz...</p>
      </div>
    );
  }
  
  if (quiz.status === 'waiting') {
    return (
      <WaitingRoom
        quiz={quiz}
        isTeacher={participant.role === 'teacher'}
      />
    );
  }
  
  if (quiz.status === 'finished') {
    return <QuizResults quiz={quiz} />;
  }

  if (quiz.status === 'live') {
    return (
        <LiveQuiz
            quiz={quiz}
            participant={participant}
            isTeacher={participant.role === 'teacher'}
        />
    );
  }

  return (
    <div className="flex flex-col h-screen items-center justify-center gap-4">
        <p>An unknown error occurred.</p>
        <Button onClick={() => router.push('/')}>Return to Dashboard</Button>
    </div>
  );
}
