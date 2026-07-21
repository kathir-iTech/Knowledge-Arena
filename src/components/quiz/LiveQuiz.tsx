'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ValidatedQuiz, ValidatedParticipant } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, Loader2, ArrowRight, ShieldAlert, User, Users, Ban, CheckCircle2, Flag, Wifi, WifiOff, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';

import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { quizService } from '@/services/quiz.service';
import { questionService, submissionService } from '@/services/game.service';
import { participantService } from '@/services/participant.service';
import { usePageFocusChange } from '@/hooks/usePageFocusChange';
import { useToast } from '@/hooks/use-toast';
import { LoadingScreen } from '@/components/LoadingScreen';
import { collection, onSnapshot, doc } from 'firebase/firestore';

interface LiveQuizQuestion {
  id: string;
  text: string;
  options: string[];
  timer: number;
  sort_index: number;
}

const COMMANDER_TIMEOUT_MS = 45000;
const PARTICIPANT_TIMEOUT_MS = 30000;

function isOnline(lastSeen: unknown, now: number, timeout: number): boolean {
  if (!lastSeen) return true;
  const ts = typeof lastSeen === 'number' ? lastSeen : (lastSeen as any).toMillis?.();
  if (!ts) return true;
  return now - ts < timeout;
}

function useCommanderPresence(quiz: ValidatedQuiz) {
  const [commanderOnline, setCommanderOnline] = useState(true);
  const [presenceNow, setPresenceNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setPresenceNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const lastSeen = (quiz as any).commanderLastSeen;
    const online = isOnline(lastSeen, presenceNow, COMMANDER_TIMEOUT_MS);
    setCommanderOnline(online);
  }, [quiz, presenceNow]);

  return commanderOnline;
}

function useSound(url?: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('ka_sound_muted') !== 'false';
  });

  useEffect(() => {
    if (!url) return;
    audioRef.current = new Audio(url);
    audioRef.current.preload = 'none';
    return () => { audioRef.current = null; };
  }, [url]);

  const play = useCallback(() => {
    if (muted || !audioRef.current) return;
    const p = audioRef.current.play();
    if (p) p.catch(() => {});
  }, [muted]);

  const toggleMute = useCallback(() => {
    setMuted(prev => {
      const next = !prev;
      localStorage.setItem('ka_sound_muted', String(next));
      return next;
    });
  }, []);

  return { play, muted, toggleMute };
}

const CountdownTimer = ({ timeLeft, totalSec }: { timeLeft: number; totalSec: number }) => {
  const progress = totalSec > 0 ? (timeLeft / totalSec) * 100 : 0;
  const isUrgent = timeLeft <= 5;
  const isCritical = timeLeft <= 3;

  return (
    <div
      className={cn(
        "flex items-center gap-2 mb-4 px-4 py-2.5 rounded-[12px] border transition-all duration-300",
        isCritical ? "bg-destructive/10 border-destructive/20" :
        isUrgent ? "bg-warning/5 border-warning/15" :
        "bg-card border-border/50"
      )}
      role="timer"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`${timeLeft} seconds remaining`}
    >
      <Clock
        className={cn(
          "w-4 h-4 shrink-0 transition-colors duration-300",
          isCritical ? "text-destructive" :
          isUrgent ? "text-warning" :
          "text-muted-foreground"
        )}
      />
      <span
        className={cn(
          "font-mono text-lg font-bold tabular-nums transition-colors duration-300",
          isCritical ? "text-destructive" :
          isUrgent ? "text-warning" :
          "text-foreground"
        )}
      >
        {timeLeft}
      </span>
      <span className="text-sm text-muted-foreground">seconds remaining</span>
      {isUrgent && (
        <div className="flex gap-0.5 ml-auto" aria-hidden="true">
          {Array.from({ length: Math.min(timeLeft, 5) }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "w-1.5 h-4 rounded-full transition-all duration-200",
                isCritical ? "bg-destructive" : "bg-warning"
              )}
              style={{
                animation: timeLeft > 0 ? `pulse 0.5s ease-in-out ${i * 0.15}s infinite` : 'none',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const LiveLeaderboard = ({ participants, teacherId, currentUserId }: { participants: ValidatedParticipant[], teacherId: string, currentUserId: string }) => {
    const sortedParticipants = useMemo(() => [...participants].sort((a,b) => b.score - a.score), [participants]);
    const [presenceNow, setPresenceNow] = useState(() => Date.now());
    useEffect(() => {
      const interval = setInterval(() => setPresenceNow(Date.now()), 5000);
      return () => clearInterval(interval);
    }, []);
    const onlineParticipants = useMemo(() => sortedParticipants.filter(p => p.user_id === teacherId || isOnline(p.lastSeen, presenceNow, PARTICIPANT_TIMEOUT_MS)), [sortedParticipants, teacherId, presenceNow]);
    const students = onlineParticipants.filter(p => p.user_id !== teacherId);
    const total = students.length;

    return (
        <Card className="w-full max-w-4xl mt-4 md:mt-6">
            <CardHeader className="py-3 md:py-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Standings</CardTitle>
                <span className="text-xs text-muted-foreground tabular-nums">{total} gladiator{total !== 1 ? 's' : ''}</span>
              </div>
            </CardHeader>
            <CardContent className="p-3 md:p-5">
                <div className="flex flex-wrap gap-2.5 md:gap-3">
                    {students.map((p, idx) => {
                      const rank = idx + 1;
                      const percentile = total > 0 ? Math.round(((total - rank) / total) * 100) : 0;
                      const isSelf = p.user_id === currentUserId;
                      const showPodium = idx < 3 && total >= 3;
                      return (
                        <div key={p.user_id} className={cn(
                          "flex items-center gap-2 md:gap-3 p-2 md:p-2.5 rounded-[12px] border transition-all duration-150",
                          isSelf ? "bg-primary/5 border-primary/20" : p.status === 'blocked' ? "bg-destructive/5 border-destructive/10 opacity-50" : showPodium ? "bg-warning/[0.03] border-warning/10" : "bg-card border-border/50"
                        )}>
                            <div className="relative shrink-0">
                              <Avatar className={cn("h-8 w-8 md:h-9 md:w-9", showPodium && "ring-2 ring-warning/30 ring-offset-1 ring-offset-card")}>
                                  <AvatarFallback className="text-xs md:text-sm bg-secondary">{p.avatar || '🎮'}</AvatarFallback>
                              </Avatar>
                              <span className={cn(
                                "absolute -bottom-1 -right-1 text-[9px] font-bold bg-background border border-border rounded-full w-4 h-4 flex items-center justify-center",
                                rank === 1 ? "text-warning" : rank === 2 ? "text-muted-foreground" : rank === 3 ? "text-amber-700" : "text-muted-foreground"
                              )} aria-label={`Rank ${rank}`}>{rank}</span>
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-xs md:text-sm font-semibold truncate max-w-[60px] md:max-w-[80px]">{isSelf ? 'You' : p.name || p.user_id.slice(0, 6)}</span>
                                <span className={cn('text-[10px] md:text-xs font-mono font-semibold', p.status === 'blocked' ? 'text-destructive' : 'text-primary')}>
                                  {p.status === 'blocked' ? 'BLOCKED' : `${p.score} PTS`}
                                </span>
                                {isSelf && p.status !== 'blocked' && (
                                  <span className="text-[9px] text-muted-foreground">Top {percentile}%</span>
                                )}
                            </div>
                        </div>
                      );
                    })}
                </div>
            </CardContent>
        </Card>
    );
};

const ParticipantStats = ({ participants, teacherId, submittedCount, onUnblock, unblockingId }: {
  participants: ValidatedParticipant[];
  teacherId: string;
  submittedCount: number;
  onUnblock: (userId: string) => void;
  unblockingId: string | null;
}) => {
  const students = participants.filter(p => p.user_id !== teacherId);
  const playing = students.filter(p => p.status === 'playing').length;
  const blocked = students.filter(p => p.status === 'blocked').length;
  const finished = students.filter(p => p.status === 'finished').length;
  const blockedStudents = students.filter(p => p.status === 'blocked');

  return (
    <div className="flex flex-wrap gap-2 justify-center mb-4 md:mb-6">
      <div className="flex items-center gap-1.5 bg-muted/50 px-3 py-1.5 rounded-[12px] text-xs">
        <Users className="w-3.5 h-3.5 text-primary" />
        <span className="font-semibold">{students.length}</span>
        <span className="text-muted-foreground">total</span>
      </div>
      <div className="flex items-center gap-1.5 bg-success/5 px-3 py-1.5 rounded-[12px] text-xs">
        <User className="w-3.5 h-3.5 text-success" />
        <span className="font-semibold text-success">{playing}</span>
        <span className="text-muted-foreground">active</span>
      </div>
      <div className="flex items-center gap-1.5 bg-primary/5 px-3 py-1.5 rounded-[12px] text-xs">
        <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
        <span className="font-semibold text-primary">{submittedCount}</span>
        <span className="text-muted-foreground">answered</span>
      </div>
      {blocked > 0 && (
        <div className="flex items-center gap-1.5 bg-destructive/5 px-3 py-1.5 rounded-[12px] text-xs">
          <Ban className="w-3.5 h-3.5 text-destructive" />
          <span className="font-semibold text-destructive">{blocked}</span>
          <span className="text-muted-foreground">blocked</span>
        </div>
      )}
      {finished > 0 && (
        <div className="flex items-center gap-1.5 bg-primary/5 px-3 py-1.5 rounded-[12px] text-xs">
          <span className="font-semibold text-primary">{finished}</span>
          <span className="text-muted-foreground">done</span>
        </div>
      )}
      {blockedStudents.length > 0 && (
        <div className="w-full max-w-xl basis-full rounded-[12px] border border-destructive/10 bg-destructive/5 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-destructive">Blocked gladiators</div>
          <div className="flex flex-wrap gap-2">
            {blockedStudents.map(p => (
              <div key={p.user_id} className="flex items-center gap-2 rounded-[10px] bg-background/70 px-2.5 py-1.5 text-xs">
                <span className="max-w-28 truncate">{p.name || p.user_id.slice(0, 8)}</span>
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onUnblock(p.user_id)} disabled={unblockingId === p.user_id}>
                  {unblockingId === p.user_id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Unblock'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default function LiveQuiz({ quiz, participant, isTeacher, allParticipants }: { quiz: ValidatedQuiz, participant: ValidatedParticipant, isTeacher: boolean, allParticipants: ValidatedParticipant[] }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const commanderOnline = useCommanderPresence(quiz);
  const sound = useSound();

  const [questions, setQuestions] = useState<LiveQuizQuestion[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);
  const [participants, setParticipants] = useState<ValidatedParticipant[]>(allParticipants || []);

  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [answerSynced, setAnswerSynced] = useState(false);
  const [showViolationWarning, setShowViolationWarning] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [advanceStage, setAdvanceStage] = useState<'idle' | 'evaluating' | 'advancing'>('idle');
  const [timeLeft, setTimeLeft] = useState(0);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const endingRef = useRef(false);
  const lastViolationRef = useRef(0);
  const prevViolationsRef = useRef<Record<string, number>>({});
  const advancingRef = useRef(false);
  const confirmedQuestionIds = useRef(new Set<string>());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const { firestore } = useFirebase();

  useEffect(() => {
    if (!isTeacher || !user) return;
    const send = () => {
      quizService.commanderHeartbeat(quiz.id).catch(() => {});
    };
    send();
    heartbeatRef.current = setInterval(send, 15000);

    const handlePageShow = () => {
      send();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(send, 15000);
    };

    window.addEventListener('pageshow', handlePageShow);

    return () => {
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [quiz.id, user, isTeacher]);

  useEffect(() => {
    if (!isTeacher && user) {
      const send = () => {
        participantService.heartbeat(quiz.id, user.id).catch(() => {});
      };
      send();
      heartbeatRef.current = setInterval(send, 15000);

      const handlePageShow = () => {
        send();
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(send, 15000);
      };

      window.addEventListener('pageshow', handlePageShow);

      return () => {
        if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
        window.removeEventListener('pageshow', handlePageShow);
      };
    }
  }, [quiz.id, user, isTeacher]);

  useEffect(() => {
    if (participant.status === 'blocked') return;
    const preventDefaults = (e: Event) => { e.preventDefault(); };
    document.addEventListener('contextmenu', preventDefaults);
    document.addEventListener('copy', preventDefaults);
    document.addEventListener('cut', preventDefaults);
    document.addEventListener('paste', preventDefaults);
    return () => {
      document.removeEventListener('contextmenu', preventDefaults);
      document.removeEventListener('copy', preventDefaults);
      document.removeEventListener('cut', preventDefaults);
      document.removeEventListener('paste', preventDefaults);
    };
  }, [participant.status]);

  useEffect(() => {
    let mounted = true;
    const qSub = questionService.subscribeToQuestions(quiz.id, (qs) => {
      if (mounted) { setQuestions(qs); setIsLoadingQuestions(false); }
    }, () => {
      if (mounted && navigator.onLine) {
        toast({ variant: 'destructive', title: 'Connection Issue', description: 'Failed to sync questions. Retrying...' });
      }
    });
    return () => { mounted = false; qSub(); };
  }, [quiz.id, toast]);

  useEffect(() => {
    let mounted = true;
    const pSub = participantService.subscribeToParticipants(quiz.id, (parts) => {
      if (!mounted) return;
      setParticipants(parts);
      if (isTeacher) {
        parts.forEach(p => {
          if (p.user_id === quiz.created_by) return;
          const prev = prevViolationsRef.current[p.user_id];
          const curr = p.violations_count ?? 0;
          if (prev === undefined) {
            prevViolationsRef.current[p.user_id] = curr;
            return;
          }
          if (curr > prev) {
            toast({
              title: p.status === 'blocked' ? 'Gladiator Blocked' : 'Malpractice Warning',
              description: `${p.name || p.user_id.slice(0, 8)} — Violation #${curr}`,
              variant: p.status === 'blocked' ? 'destructive' : 'default',
            });
          }
          prevViolationsRef.current[p.user_id] = curr;
        });
      }
    }, () => {
      if (mounted && navigator.onLine) {
        toast({ variant: 'destructive', title: 'Connection Issue', description: 'Participant sync interrupted. Reconnecting...' });
      }
    });
    return () => { mounted = false; pSub(); };
  }, [quiz.id, isTeacher, quiz.created_by, toast]);

  const currentQuestion = useMemo(() => {
    if (!questions.length || (quiz.current_question_index ?? -1) < 0) return null;
    return questions[quiz.current_question_index ?? 0];
  }, [questions, quiz.current_question_index]);

  useEffect(() => {
    if (!currentQuestion) return;
    const start = typeof quiz.question_start_at === 'number' ? quiz.question_start_at : Date.now();
    const durationMs = currentQuestion.timer * 1000;
    const totalSec = currentQuestion.timer;
    const deadline = start + durationMs;

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
      const clamped = Math.min(remaining, totalSec);
      setTimeLeft(clamped);
      if (clamped <= 0) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, [quiz.current_question_index, quiz.question_start_at, currentQuestion?.timer]);

  const prevQuestionIdxRef = useRef<number | null>(null);
  useEffect(() => {
    const idx = quiz.current_question_index ?? -1;
    if (idx >= 0 && idx !== prevQuestionIdxRef.current) {
      prevQuestionIdxRef.current = idx;
      setIsTransitioning(true);
      setSelectedAnswer(null);
      setHasAnswered(false);
      setAnswerSynced(false);
      setShowViolationWarning(false);
      setAdvanceStage('idle');
      const timer = setTimeout(() => setIsTransitioning(false), 300);
      return () => clearTimeout(timer);
    }
  }, [quiz.current_question_index]);

  useEffect(() => {
    if (isTeacher || !currentQuestion || !user || !firestore) return;
    const subDocRef = doc(firestore, 'quizzes', quiz.id, 'questions', currentQuestion.id, 'submissions', user.id);
    const unsub = onSnapshot(subDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as { selected_option: number };
        setSelectedAnswer(data.selected_option);
        setHasAnswered(true);
        setAnswerSynced(true);
        confirmedQuestionIds.current.add(currentQuestion.id);
      }
    }, () => {});
    return () => { unsub(); };
  }, [quiz.current_question_index, isTeacher, user?.id, firestore, quiz.id]);

  useEffect(() => {
    if (!isTeacher || !firestore) return;
    const qId = currentQuestion?.id;
    if (!qId || !quiz.id) return;
    const subsRef = collection(firestore, 'quizzes', quiz.id, 'questions', qId, 'submissions');
    const unsub = onSnapshot(subsRef, (snap) => {
      setSubmittedCount(snap.docs.filter(d => d.data()?.selected_option !== undefined).length);
    });
    return () => { unsub(); };
  }, [isTeacher, currentQuestion?.id, quiz.id, firestore]);

  const onMalpractice = useCallback(async () => {
    if (isTeacher || !user || participant.status === 'blocked' || quiz.status !== 'live') return;
    const now = Date.now();
    if (now - lastViolationRef.current < 2000) return;
    lastViolationRef.current = now;
    const newCount = (participant.violations_count || 0) + 1;
    try {
      const newStatus = newCount >= 2 ? 'blocked' : 'playing';
      await participantService.updateParticipant(quiz.id, user.id, {
        violations_count: newCount,
        status: newStatus,
      });
      if (newStatus === 'blocked') {
        try { sessionStorage.setItem('blocked_at', Date.now().toString()); sessionStorage.setItem('blocked_violations', String(newCount)); } catch {}
      }
      if (newCount < 2) setShowViolationWarning(true);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to record violation.' });
    }
  }, [isTeacher, user, quiz.id, quiz.status, participant, toast]);

  usePageFocusChange(onMalpractice, quiz.status === 'live' && !isTeacher);

  useEffect(() => {
    if (quiz.status !== 'live' || isTeacher) return;
    const onFullscreen = () => {
      if (!document.fullscreenElement) onMalpractice();
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, [quiz.status, isTeacher, onMalpractice]);

  const handleAnswerSubmit = async (idx: number) => {
    const qId = currentQuestion?.id;
    if (!qId || hasAnswered || isTeacher || !user || timeLeft === 0 || participant.status === 'blocked' || isAdvancing) return;
    if (confirmedQuestionIds.current.has(qId)) return;
    setHasAnswered(true);
    setSelectedAnswer(idx);
    setAnswerSynced(false);
    try {
      await submissionService.submitAnswer({
        quiz_id: quiz.id,
        question_id: qId,
        user_id: user.id,
        selected_option: idx
      });
      setAnswerSynced(true);
      confirmedQuestionIds.current.add(qId);
    } catch (e) {
      if (e instanceof Error && e.message.includes('permission')) {
        setAnswerSynced(true);
        confirmedQuestionIds.current.add(qId);
      } else {
        setHasAnswered(false);
        setSelectedAnswer(null);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to submit answer. Please try again.' });
      }
    }
  };

  const handleNext = async () => {
    if (!isTeacher || advancingRef.current) return;
    advancingRef.current = true;
    setIsAdvancing(true);
    setAdvanceStage('evaluating');
    try {
      if (currentQuestion) {
        const startTime = typeof quiz.question_start_at === 'number' ? quiz.question_start_at : Date.now();
        await questionService.evaluateQuestion(quiz.id, currentQuestion.id, startTime);
      }
      setAdvanceStage('advancing');
      const nextIdx = (quiz.current_question_index ?? 0) + 1;
      if (nextIdx < (quiz.question_count ?? 0)) {
        await quizService.advanceToQuestion(quiz.id, nextIdx);
      } else {
        await quizService.updateQuizStatus(quiz.id, 'finished');
        await participantService.markAllFinished(quiz.id, quiz.created_by);
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to advance. Please try again.' });
    } finally { advancingRef.current = false; setIsAdvancing(false); setAdvanceStage('idle'); }
  };

  const handleEndBattle = async () => {
    if (!isTeacher || endingRef.current) return;
    endingRef.current = true;
    setIsEnding(true);
    try {
      if (currentQuestion) {
        const startTime = typeof quiz.question_start_at === 'number' ? quiz.question_start_at : Date.now();
        await questionService.evaluateQuestion(quiz.id, currentQuestion.id, startTime);
      }
      await quizService.updateQuizStatus(quiz.id, 'finished');
      await participantService.markAllFinished(quiz.id, quiz.created_by);
      toast({ title: 'Battle Ended', description: 'The battle has been finalized.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to end battle. Please try again.' });
      endingRef.current = false;
      setIsEnding(false);
    }
  };

  const handleUnblock = async (userId: string) => {
    if (!isTeacher || unblockingId) return;
    setUnblockingId(userId);
    try {
      await participantService.unblockParticipant(quiz.id, userId);
      toast({ title: 'Unblocked', description: 'The gladiator can join the arena again.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to unblock gladiator.' });
    } finally {
      setUnblockingId(null);
    }
  };

  if (isLoadingQuestions) return <LoadingScreen message="Loading questions..." />;
  if (!currentQuestion) return null;

  const studentCount = participants.filter(p => p.user_id !== quiz.created_by).length;
  const showCommanderOffline = !isTeacher && !commanderOnline && quiz.status === 'live';
  const showCommanderReconnected = !isTeacher && commanderOnline;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-3 md:p-4 bg-background overflow-x-hidden animate-in safe-top safe-bottom">
      {showViolationWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setShowViolationWarning(false)} />
          <div className="relative bg-card border border-destructive/20 rounded-[18px] shadow-elevation-medium p-6 max-w-sm w-full space-y-4 animate-in">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-[12px] bg-destructive/10 shrink-0">
                <ShieldAlert className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Focus Lost</h3>
                <p className="text-sm text-muted-foreground">You looked away from the battle. One more violation will disqualify you.</p>
              </div>
            </div>
            <button
              onClick={() => setShowViolationWarning(false)}
              className="w-full h-11 rounded-[12px] bg-destructive text-destructive-foreground font-medium text-sm hover:bg-destructive/90 transition-colors"
            >
              Continue Battle
            </button>
          </div>
        </div>
      )}

      {showCommanderOffline && (
        <div className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-[12px] bg-warning/5 border border-warning/10 w-full max-w-4xl" role="alert" aria-live="assertive">
          <WifiOff className="w-4 h-4 text-warning shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-warning">Commander connection interrupted</span>
            <p className="text-xs text-muted-foreground">The battle is paused while we wait for the Commander to reconnect.</p>
          </div>
        </div>
      )}

      {isTeacher && (
        <div className="flex items-center gap-2 mb-4 w-full max-w-4xl justify-between">
          <ParticipantStats participants={participants} teacherId={quiz.created_by} submittedCount={submittedCount} onUnblock={handleUnblock} unblockingId={unblockingId} />
        </div>
      )}

      {!isTeacher && (
        <CountdownTimer timeLeft={timeLeft} totalSec={currentQuestion.timer} />
      )}

      <Card className="w-full max-w-4xl">
        <CardHeader className={cn(
          "text-center pt-10 pb-4 md:pb-6 px-5 md:px-10 transition-opacity duration-300",
          isTransitioning ? "opacity-50" : "opacity-100"
        )}>
          <div className="flex items-center justify-center gap-3 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Question {(quiz.current_question_index ?? 0) + 1} / {quiz.question_count ?? 0}
            </span>
            <div className="flex gap-1" aria-hidden="true">
              {Array.from({ length: quiz.question_count ?? 0 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all duration-300",
                    i < (quiz.current_question_index ?? 0) ? "bg-primary" :
                    i === (quiz.current_question_index ?? 0) ? "bg-primary/60 scale-125" :
                    "bg-muted-foreground/20"
                  )}
                />
              ))}
            </div>
          </div>
          <CardTitle className="text-xl sm:text-3xl md:text-4xl font-headline leading-snug md:leading-tight tracking-tight">{currentQuestion.text}</CardTitle>
          {isTeacher && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className={cn("font-mono text-lg font-bold tabular-nums", timeLeft <= 5 ? "text-destructive" : "text-foreground")} aria-live="polite" aria-atomic="true">{timeLeft}<span className="text-sm font-normal text-muted-foreground ml-0.5">s</span></span>
            </div>
          )}
        </CardHeader>
        <CardContent className="pb-10 md:pb-14 px-5 md:px-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {currentQuestion.options.map((opt: string, i: number) => (
              <button
                key={i}
                onClick={() => handleAnswerSubmit(i)}
                disabled={hasAnswered || isTeacher || timeLeft === 0 || participant.status === 'blocked'}
                className={cn(
                  "group relative flex flex-col gap-2 p-3 md:p-5 rounded-[14px] border-2 text-left transition-all duration-150 min-h-[3.5rem] md:min-h-[5.5rem]",
                  selectedAnswer === i
                    ? "border-primary bg-primary/5 shadow-elevation-small"
                    : hasAnswered
                      ? "border-border/30 bg-muted/10 opacity-40"
                      : "border-border/50 bg-card hover:border-primary/30 hover:bg-primary/[0.02] hover:shadow-elevation-small cursor-pointer active:scale-[0.98]",
                  (hasAnswered || isTeacher || timeLeft === 0) && "cursor-default"
                )}
                aria-label={`Option ${String.fromCharCode(65 + i)}: ${opt}`}
              >
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "shrink-0 flex items-center justify-center w-8 h-8 rounded-[10px] text-sm font-bold font-mono transition-all duration-150",
                    selectedAnswer === i
                      ? "bg-primary text-primary-foreground"
                      : "bg-primary/10 text-primary group-hover:bg-primary/20"
                  )}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="flex-1 text-sm md:text-base font-medium leading-snug">{opt}</span>
                  {selectedAnswer === i && (
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                  )}
                </div>
              </button>
            ))}
          </div>

          {hasAnswered && !isTeacher && (
            <div className="flex items-center justify-center gap-2 mt-4 text-sm">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <span className="font-medium text-primary">Answer Locked</span>
              <span className="text-muted-foreground mx-1">·</span>
              {answerSynced ? (
                <span className="text-muted-foreground">Waiting for the Commander...</span>
              ) : (
                <span className="text-warning font-medium flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Answer sync pending
                </span>
              )}
            </div>
          )}

          {isTeacher && (
            <div className="flex flex-col items-center pt-6 md:pt-8 gap-2">
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Button onClick={handleNext} disabled={isAdvancing || isEnding} size="lg" className="w-full sm:w-auto min-w-[200px]" aria-busy={isAdvancing}>
                  {isAdvancing && advanceStage === 'evaluating' ? <Loader2 className="animate-spin mr-2" /> : isAdvancing && advanceStage === 'advancing' ? <Loader2 className="animate-spin mr-2" /> : <ArrowRight className="mr-2 h-5 w-5" />}
                  {isAdvancing && advanceStage === 'evaluating' ? 'Evaluating answers...' :
                   isAdvancing && advanceStage === 'advancing' ? 'Advancing...' :
                   (quiz.current_question_index ?? 0) === (quiz.question_count ?? 0) - 1 ? 'Reveal Podium' : 'Evaluate & Next'}
                </Button>
                <Button onClick={() => setShowEndConfirm(true)} variant="outline" disabled={isAdvancing || isEnding} size="lg" className="w-full sm:w-auto">
                  {isEnding ? <Loader2 className="animate-spin mr-2" /> : <Flag className="mr-2 h-5 w-5" />}
                  End Battle
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{submittedCount} / {studentCount} gladiators answered</p>
              {studentCount > 0 && submittedCount < studentCount && (
                <p className="text-xs text-muted-foreground/60">Waiting for {studentCount - submittedCount} more gladiator{(studentCount - submittedCount) !== 1 ? 's' : ''}</p>
              )}
            </div>
          )}

          {participant.status === 'blocked' && !isTeacher && (
             <div className="bg-destructive/5 border border-destructive/10 p-8 rounded-[18px] text-center space-y-3 mt-6">
                <ShieldAlert className="w-12 h-12 text-destructive mx-auto" />
                <h3 className="text-xl font-bold text-destructive">Disqualified</h3>
                <p className="text-sm text-muted-foreground">Malpractice detected. Awaiting review.</p>
             </div>
          )}
        </CardContent>
      </Card>

      <LiveLeaderboard participants={participants} teacherId={quiz.created_by} currentUserId={user?.id || ''} />

      {isTeacher && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
          <button
            onClick={sound.toggleMute}
            className="flex items-center justify-center w-9 h-9 rounded-[10px] bg-background/80 backdrop-blur-sm border border-border/50 shadow-elevation-small hover:bg-muted transition-colors"
            aria-label={sound.muted ? 'Unmute sounds' : 'Mute sounds'}
          >
            {sound.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      )}

      <AlertDialog open={showEndConfirm} onOpenChange={(o) => { if (!o && !isEnding) setShowEndConfirm(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End Battle?</AlertDialogTitle>
            <AlertDialogDescription>
              The battle will end for all participants and current results will be finalized. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowEndConfirm(false)} disabled={isEnding}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowEndConfirm(false); handleEndBattle(); }} disabled={isEnding} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isEnding ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
              End Battle
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
