
'use client';

import React, { useMemo, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { ValidatedQuiz, ValidatedParticipant } from '@/lib/schemas';
import { quizService } from '@/services/quiz.service';
import { participantService } from '@/services/participant.service';
import { Loader2, ShieldX } from 'lucide-react';
import LiveQuiz from '@/components/quiz/LiveQuiz';
import QuizResults from '@/components/quiz/QuizResults';
import WaitingRoom from '@/components/quiz/WaitingRoom';
import { Button } from '../ui/button';
import type { Quiz, QuizParticipant } from '@/lib/types';

export default function BattleRoomLoader() {
  const { roomCode } = useParams();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  
  const [quiz, setQuiz] = useState<ValidatedQuiz | null>(null);
  const [participant, setParticipant] = useState<ValidatedParticipant | null>(null);
  const [allParticipants, setAllParticipants] = useState<ValidatedParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const quizId = roomCode as string;

  useEffect(() => {
    if (!quizId || !user) return;

    let quizSub: any;
    let partSub: any;

    const init = async () => {
      try {
        const q = await quizService.getQuizById(quizId);
        setQuiz(q);
        
        quizSub = quizService.subscribeToQuiz(quizId, setQuiz);
        partSub = participantService.subscribeToParticipants(quizId, (parts) => {
          setAllParticipants(parts);
          const self = parts.find(p => p.user_id === user.id);
          if (self) setParticipant(self);
        });
      } catch (e) {
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };

    init();

    return () => {
      quizSub?.unsubscribe();
      partSub?.unsubscribe();
    };
  }, [quizId, user]);

  useEffect(() => {
    if (participant?.status === 'blocked') {
      router.push('/kicked');
    }
  }, [participant, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Entering the Arena...</p>
      </div>
    );
  }
  
  if (error || !quiz) {
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
        isTeacher={quiz.created_by === participant.user_id}
      />
    );
  }
  
  if (quiz.status === 'finished') {
    return <QuizResults quiz={quiz as unknown as Quiz} />;
  }

  if (quiz.status === 'live') {
    return (
        <LiveQuiz
            quiz={quiz as unknown as Quiz}
            participant={participant as unknown as QuizParticipant}
            isTeacher={quiz.created_by === participant.user_id}
            allParticipants={allParticipants}
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
