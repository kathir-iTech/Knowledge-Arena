
'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { ValidatedQuiz, ValidatedParticipant } from '@/lib/schemas';
import { quizService } from '@/services/quiz.service';
import { participantService } from '@/services/participant.service';
import { battleService, getSessionToken } from '@/services/battle.service';
import { presenceService } from '@/services/presence.service';
import { STARTING_TRANSITION_MS, QUIZ_WAITING, QUIZ_READY, QUIZ_STARTING, QUIZ_LIVE, QUIZ_PAUSED, QUIZ_FINISHED, QUIZ_ARCHIVED } from '@/lib/constants';
import { isBattleActive } from '@/lib/battle-machine';
import { ShieldX, RefreshCw, MonitorX } from 'lucide-react';
import { LoadingScreen } from '@/components/LoadingScreen';
import LiveQuiz from '@/components/quiz/LiveQuiz';
import QuizResults from '@/components/quiz/QuizResults';
import WaitingRoom from '@/components/quiz/WaitingRoom';
import { Button } from '../ui/button';

function StartingScreen({ quizId, startedAt }: { quizId: string; startedAt?: number | null }) {
  const [countdown, setCountdown] = useState(3);
  const [isActivating, setIsActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activatedRef = useRef(false);

  const doActivate = useCallback(async () => {
    if (activatedRef.current) return;
    activatedRef.current = true;
    setIsActivating(true);
    try {
      await battleService.activateBattle(quizId);
    } catch (e) {
      activatedRef.current = false;
      setError(e instanceof Error ? e.message : 'Failed to activate the battle.');
      setIsActivating(false);
    }
  }, [quizId]);

  useEffect(() => {
    const elapsed = startedAt ? Date.now() - startedAt : 0;
    const seconds = Math.max(0, Math.ceil((STARTING_TRANSITION_MS - elapsed) / 1000));
    setCountdown(seconds);
    if (elapsed >= STARTING_TRANSITION_MS) {
      doActivate();
      return;
    }
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          doActivate();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt, doActivate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 text-center p-4 animate-in safe-top safe-bottom">
      <div className="flex flex-col items-center gap-4">
        <div className="relative flex items-center justify-center w-24 h-24">
          <span className="absolute inset-0 rounded-full bg-primary/10 animate-ping" aria-hidden="true" />
          <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/30">
            <span className="font-mono text-4xl font-bold text-primary tabular-nums">{countdown}</span>
          </div>
        </div>
        <h1 className="text-page-title font-headline tracking-tight">Battle Starting</h1>
        <p className="text-base text-muted-foreground max-w-sm">
          {error ? error : 'Get ready! The arena is about to go live.'}
        </p>
      </div>
      {error && (
        <Button onClick={doActivate} disabled={isActivating}>
          <RefreshCw className="mr-2 h-4 w-4" /> Retry Activation
        </Button>
      )}
    </div>
  );
}

function ReplacedScreen({ onReturn }: { onReturn: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 text-center p-4 animate-in safe-top safe-bottom" role="alert">
      <div className="flex items-center justify-center w-16 h-16 rounded-[18px] bg-warning/10">
        <MonitorX className="w-8 h-8 text-warning" aria-hidden="true" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h1 className="text-page-title font-headline tracking-tight">Session Replaced</h1>
        <p className="text-base text-muted-foreground">
          This arena is now open in another window or device on your account. Only one active session is allowed per arena.
        </p>
      </div>
      <Button onClick={onReturn}>Return to Dashboard</Button>
    </div>
  );
}

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
  const [replaced, setReplaced] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isRetryingJoin, setIsRetryingJoin] = useState(false);
  const initialJoinDoneRef = useRef(false);
  const firstPartSnapRef = useRef(false);
  const reconnectLoggedRef = useRef(false);
  const quizRef = useRef<ValidatedQuiz | null>(null);

  const quizId = roomCode as string;
  const sessionToken = user ? getSessionToken(quizId) : '';

  const handleRetry = useCallback(() => {
    setRetryCount(c => c + 1);
  }, []);

  const handleRetryJoin = useCallback(async () => {
    if (!user || isRetryingJoin) return;
    setIsRetryingJoin(true);
    setJoinError(null);
    try {
      await participantService.joinQuiz(quizId, user.id, user.name, sessionToken);
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Failed to join the arena. Please try again.');
    } finally {
      setIsRetryingJoin(false);
    }
  }, [quizId, user, sessionToken, isRetryingJoin]);

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
    setReplaced(false);
    setJoinError(null);
    firstPartSnapRef.current = false;
    reconnectLoggedRef.current = false;

    const quizSub = quizService.subscribeToQuiz(quizId, (q) => {
      if (!mounted) return;
      if (!q) {
        setError('This room does not exist or has been removed.');
        if (mounted) setIsLoading(false);
        return;
      }
      if (q.archived || q.status === QUIZ_ARCHIVED) {
        setError('This arena has been closed.');
        if (mounted) setIsLoading(false);
        return;
      }
      setQuiz(q);
      quizRef.current = q;
      if (!initialJoinDoneRef.current && (q.status === QUIZ_WAITING || q.status === QUIZ_READY) && user.id !== q.created_by) {
        initialJoinDoneRef.current = true;
        participantService.joinQuiz(quizId, user.id, user.name, sessionToken).catch((e) => {
          if (mounted) {
            setJoinError(e instanceof Error ? e.message : 'Failed to join the arena. Please try again.');
          }
        });
      }
      if (mounted) setIsLoading(false);
    }, () => {
      if (!mounted) return;
      if (connectionStatus === 'offline') return;
      setError('This room does not exist or you do not have access to it.');
      if (mounted) setIsLoading(false);
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
        const currentQuiz = quizRef.current;
        if (currentQuiz && isBattleActive(currentQuiz.status) && self.session_token && self.session_token !== sessionToken) {
          setReplaced(true);
          return;
        }
        if (currentQuiz && currentQuiz.status !== QUIZ_WAITING && currentQuiz.status !== QUIZ_READY && !reconnectLoggedRef.current) {
          reconnectLoggedRef.current = true;
          battleService.recordReconnect(quizId, sessionToken).catch(() => {});
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
  }, [quizId, user, retryCount, connectionStatus, sessionToken, router]);

  // Real-time presence: both Commanders and Gladiators register in RTDB while
  // they are on the battle screen (waiting room and live battle). The node is
  // removed automatically on disconnect and re-applied on reconnect.
  useEffect(() => {
    if (!user || !quizId) return;
    const role = user.role === 'gladiator' ? 'gladiator' : 'commander';
    return presenceService.setPresence(quizId, user.id, role);
  }, [quizId, user?.id, user?.role]);

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

      </div>
    );
  }

  if (!user) {
    return <LoadingScreen message="Joining Quiz..." />;
  }

  if (replaced) {
    return <ReplacedScreen onReturn={() => router.push('/')} />;
  }

  if (quiz.status === QUIZ_WAITING || quiz.status === QUIZ_READY) {
    return (
      <>
        <WaitingRoom
          quiz={quiz}
          isTeacher={(user?.role === 'commander' || user?.role === 'executive') && quiz.created_by === user.id}
          joinError={joinError}
          onRetryJoin={handleRetryJoin}
          isRetryingJoin={isRetryingJoin}
        />

      </>
    );
  }

  if (quiz.status === QUIZ_STARTING) {
    return <StartingScreen quizId={quiz.id} startedAt={quiz.started_at} />;
  }

  if (quiz.status === QUIZ_FINISHED) {
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

      </>
    );
  }

  if (quiz.status === QUIZ_LIVE || quiz.status === QUIZ_PAUSED) {
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
    if (!participant && !isTeacher) {
      return <LoadingScreen message="Joining the arena..." />;
    }
    return (
      <>
        <LiveQuiz
            quiz={quiz}
            participant={participant as ValidatedParticipant}
        isTeacher={isTeacher}
            allParticipants={allParticipants}
        />

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
