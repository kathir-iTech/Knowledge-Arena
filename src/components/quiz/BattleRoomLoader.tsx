
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
    if (!quizId) return;
    if (!user) {
      router.replace(`/?roomCode=${quizId}`);
      return;
    }

    let mounted = true;
    let initialJoinDone = false;

    const quizSub = quizService.subscribeToQuiz(quizId, (q) => {
      if (!mounted) return;
      setQuiz(q);
      if (!initialJoinDone && q.status === 'waiting' && user.id !== q.created_by) {
        initialJoinDone = true;
        participantService.joinQuiz(quizId, user.id, user.name).catch(() => {});
      }
      if (mounted) setIsLoading(false);
    });
    const partSub = participantService.subscribeToParticipants(quizId, (parts) => {
      if (!mounted) return;
      setAllParticipants(parts);
      const self = parts.find(p => p.user_id === user.id);
      if (self) setParticipant(self);
    });

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
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 text-center p-4 animate-in safe-top safe-bottom" role="alert">
        <div className="flex items-center justify-center w-16 h-16 rounded-[18px] bg-destructive/10">
          <ShieldX className="w-8 h-8 text-destructive" aria-hidden="true" />
        </div>
        <div className="space-y-2 max-w-sm">
          <h1 className="text-page-title font-headline tracking-tight text-destructive">Room Not Found</h1>
          <p className="text-base text-muted-foreground">{error || 'This quiz room does not exist or has been closed.'}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setRetryCount(c => c + 1)}>
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
          <Button onClick={() => router.push('/')}>Return to Dashboard</Button>
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
        isTeacher={(user?.role === 'commander' || user?.role === 'executive') && quiz.created_by === user.id}
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
        isTeacher={(user?.role === 'commander' || user?.role === 'executive') && quiz.created_by === user.id}
            allParticipants={allParticipants}
        />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 text-center p-4 animate-in safe-top safe-bottom">
        <div className="flex items-center justify-center w-16 h-16 rounded-[18px] bg-destructive/10">
          <ShieldX className="w-8 h-8 text-destructive" />
        </div>
        <div className="space-y-2 max-w-sm">
          <h1 className="text-page-title font-headline tracking-tight text-destructive">Unexpected State</h1>
          <p className="text-base text-muted-foreground">This room is in an unexpected state. Please try again later.</p>
        </div>
        <Button onClick={() => router.push('/')}>Return to Dashboard</Button>
    </div>
  );
}
