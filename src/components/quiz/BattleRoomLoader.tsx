
'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { ValidatedQuiz, ValidatedParticipant } from '@/lib/schemas';
import { quizService } from '@/services/quiz.service';
import { participantService } from '@/services/participant.service';
import { ShieldX, RefreshCw } from 'lucide-react';
import { LoadingScreen } from '@/components/LoadingScreen';
import LiveQuiz from '@/components/quiz/LiveQuiz';
import QuizResults from '@/components/quiz/QuizResults';
import WaitingRoom from '@/components/quiz/WaitingRoom';
import { Button } from '../ui/button';
import type { Unsubscribe } from 'firebase/firestore';

export default function BattleRoomLoader() {
  const { roomCode } = useParams();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();

  const [quiz, setQuiz] = useState<ValidatedQuiz | null>(null);
  const [participant, setParticipant] = useState<ValidatedParticipant | null>(null);
  const [allParticipants, setAllParticipants] = useState<ValidatedParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const quizId = roomCode as string;

  useEffect(() => {
    if (!quizId || !user) return;

    let mounted = true;

    const quizSub = quizService.subscribeToQuiz(quizId, (q) => {
      if (mounted) setQuiz(q);
    });
    const partSub = participantService.subscribeToParticipants(quizId, (parts) => {
      if (!mounted) return;
      setAllParticipants(parts);
      const self = parts.find(p => p.user_id === user.id);
      if (self) setParticipant(self);
    });

    const init = async () => {
      try {
        const q = await quizService.getQuizById(quizId);
        if (!mounted) return;
        setQuiz(q);

        // Block joining mid-quiz: only allow joins during waiting phase
        const initialParts = await participantService.getAllParticipants(quizId);
        if (!mounted) return;
        const self = initialParts.find(p => p.user_id === user.id);
        if (!self && user.id !== q.created_by) {
          if (q.status === 'waiting') {
            await participantService.joinQuiz(quizId, user.id, user.name);
          } else {
            setError('This battle is already in progress. You cannot join mid-quiz.');
            return;
          }
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load quiz');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    init();

    return () => {
      mounted = false;
      quizSub();
      partSub();
    };
  }, [quizId, user, retryCount]);

  useEffect(() => {
    if (participant?.status === 'blocked') {
      router.push('/kicked');
    }
  }, [participant, router]);

  if (isLoading || isAuthLoading) {
    return <LoadingScreen message="Entering the Arena..." />;
  }

  if (error || !quiz) {
    return (
      <div className="loading-screen flex-col gap-6 text-center" role="alert">
         <ShieldX className="w-16 h-16 text-destructive" aria-hidden="true" />
        <h1 className="text-3xl font-headline text-destructive">Room Not Found</h1>
        <p className="text-muted-foreground max-w-md">{error || 'This quiz room does not exist or has been closed.'}</p>
        <div className="flex gap-4">
          <Button variant="outline" size="lg" onClick={() => setRetryCount(c => c + 1)}>
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
          <Button size="lg" onClick={() => router.push('/')}>Return to Dashboard</Button>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoadingScreen message="Joining Quiz..." />;
  }

  if (quiz.status === 'waiting') {
    return (
      <WaitingRoom
        quiz={quiz}
        isTeacher={quiz.created_by === participant?.user_id}
      />
    );
  }

  if (quiz.status === 'finished') {
    return <QuizResults quiz={quiz} currentUserId={user.id} />;
  }

  if (quiz.status === 'live') {
    if (!participant) {
      return <LoadingScreen message="Joining the arena..." />;
    }
    return (
        <LiveQuiz
            quiz={quiz}
            participant={participant}
            isTeacher={quiz.created_by === participant.user_id}
            allParticipants={allParticipants}
        />
    );
  }

  return (
    <div className="loading-screen flex-col gap-6 text-center">
        <ShieldX className="w-16 h-16 text-destructive" />
        <h1 className="text-2xl font-headline">Unexpected State</h1>
        <p className="text-muted-foreground max-w-md">This room is in an unexpected state. Please try again later.</p>
        <Button size="lg" onClick={() => router.push('/')}>Return to Dashboard</Button>
    </div>
  );
}
