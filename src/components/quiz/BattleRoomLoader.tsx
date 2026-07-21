
'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { ValidatedQuiz, ValidatedParticipant } from '@/lib/schemas';
import { quizService } from '@/services/quiz.service';
import { participantService } from '@/services/participant.service';
import { ShieldX, RefreshCw } from 'lucide-react';
import { LoadingScreen } from '@/components/LoadingScreen';
import { NetworkStatusIndicator } from '@/components/NetworkStatusIndicator';
import LiveQuiz from '@/components/quiz/LiveQuiz';
import QuizResults from '@/components/quiz/QuizResults';
import WaitingRoom from '@/components/quiz/WaitingRoom';
import { Button } from '../ui/button';

export default function BattleRoomLoader() {
  const { roomCode } = useParams();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { status: connectionStatus } = useOnlineStatus();

  const [quiz, setQuiz] = useState<ValidatedQuiz | null>(null);
  const [participant, setParticipant] = useState<ValidatedParticipant | null>(null);
  const [allParticipants, setAllParticipants] = useState<ValidatedParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [participantsReady, setParticipantsReady] = useState(false);
  const initialJoinDoneRef = useRef(false);
  const firstPartSnapRef = useRef(false);

  const quizId = roomCode as string;

  const handleRetry = useCallback(() => {
    setRetryCount(c => c + 1);
  }, []);

  useEffect(() => {
    if (!quizId) return;
    if (!user) {
      sessionStorage.setItem('pendingRoomCode', quizId);
      router.replace(`/?roomCode=${quizId}`);
      return;
    }

    let mounted = true;
    setError(null);
    setParticipantsReady(false);
    setParticipant(null);
    setAllParticipants([]);
    firstPartSnapRef.current = false;

    const quizSub = quizService.subscribeToQuiz(quizId, (q) => {
      if (!mounted) return;
      if (!q) {
        setError('This room does not exist or has been removed.');
        if (mounted) setIsLoading(false);
        return;
      }
      if (q.archived) {
        setError('This arena has been closed.');
        if (mounted) setIsLoading(false);
        return;
      }
      setQuiz(q);
      if (!initialJoinDoneRef.current && q.status === 'waiting' && user.id !== q.created_by) {
        initialJoinDoneRef.current = true;
        participantService.joinQuiz(quizId, user.id, user.name).catch(() => {});
      }
      if (mounted) setIsLoading(false);
    }, () => {
      if (mounted && connectionStatus === 'offline') return;
    });
    const partSub = participantService.subscribeToParticipants(quizId, (parts) => {
      if (!mounted) return;
      setAllParticipants(parts);
      setParticipantsReady(true);
      const self = parts.find(p => p.user_id === user.id);
      if (self) {
        if (self.status === 'blocked') {
          router.push('/kicked');
          return;
        }
        setParticipant(self);
      } else if (firstPartSnapRef.current) {
        setParticipant(null);
      }
      firstPartSnapRef.current = true;
    }, () => {
      if (!mounted) return;
      setParticipantsReady(true);
      setParticipant(null);
      firstPartSnapRef.current = true;
    });

    return () => {
      mounted = false;
      quizSub();
      partSub();
    };
  }, [quizId, user, retryCount, connectionStatus]);

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
          <p className="text-base text-muted-foreground">{connectionStatus === 'offline' ? 'You appear to be offline. Please check your connection and try again.' : (error || 'This quiz room does not exist or has been closed.')}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleRetry}>
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
          <Button onClick={() => router.push('/')}>Return to Dashboard</Button>
        </div>
        <NetworkStatusIndicator status={connectionStatus} />
      </div>
    );
  }

  if (!user) {
    return <LoadingScreen message="Joining Quiz..." />;
  }

  if (quiz.status === 'waiting') {
    return (
      <>
        <WaitingRoom
          quiz={quiz}
          isTeacher={(user?.role === 'commander' || user?.role === 'executive') && quiz.created_by === user.id}
        />
        <NetworkStatusIndicator status={connectionStatus} />
      </>
    );
  }

  if (quiz.status === 'finished') {
    const isTeacher = (user?.role === 'commander' || user?.role === 'executive') && quiz.created_by === user.id;
    if (!isTeacher && !participantsReady) {
      return <LoadingScreen message="Checking battle access..." />;
    }
    if (!isTeacher && !participant) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-6 text-center p-4 animate-in safe-top safe-bottom" role="alert">
          <div className="flex items-center justify-center w-16 h-16 rounded-[18px] bg-destructive/10">
            <ShieldX className="w-8 h-8 text-destructive" aria-hidden="true" />
          </div>
          <div className="space-y-2 max-w-sm">
            <h1 className="text-page-title font-headline tracking-tight text-destructive">Access Denied</h1>
            <p className="text-base text-muted-foreground">Only gladiators who participated in this battle can view its debrief.</p>
          </div>
          <Button onClick={() => router.push('/')}>Return to Dashboard</Button>
        </div>
      );
    }
    return (
      <>
        <QuizResults quiz={quiz} currentUserId={user.id} />
        <NetworkStatusIndicator status={connectionStatus} />
      </>
    );
  }

  if (quiz.status === 'live') {
    const isTeacher = (user?.role === 'commander' || user?.role === 'executive') && quiz.created_by === user.id;
    if (!participant && !isTeacher && firstPartSnapRef.current) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-6 text-center p-4 animate-in safe-top safe-bottom">
          <div className="flex items-center justify-center w-16 h-16 rounded-[18px] bg-destructive/10">
            <ShieldX className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-2 max-w-sm">
            <h1 className="text-page-title font-headline tracking-tight text-destructive">Battle Already Started</h1>
            <p className="text-base text-muted-foreground">This battle is already in progress. Late joining is not permitted. Wait for the next round or contact your Commander.</p>
          </div>
          <Button onClick={() => router.push('/')}>Return to Dashboard</Button>
        </div>
      );
    }
    if (!participant) {
      return <LoadingScreen message="Joining the arena..." />;
    }
    return (
      <>
        <LiveQuiz
            quiz={quiz}
            participant={participant}
        isTeacher={isTeacher}
            allParticipants={allParticipants}
        />
        <NetworkStatusIndicator status={connectionStatus} />
      </>
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
