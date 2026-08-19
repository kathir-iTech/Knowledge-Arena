'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ValidatedQuiz, ValidatedParticipant } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, Loader2, ArrowRight, ShieldAlert, User, Users, Ban, CheckCircle2, XCircle, Flag, WifiOff, Pause, Play, SkipForward, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useFirebase } from '@/firebase';
import { questionService, submissionService } from '@/services/game.service';
import { participantService } from '@/services/participant.service';
import { presenceService, type PresenceMap } from '@/services/presence.service';
import { battleService } from '@/services/battle.service';
import { usePageFocusChange } from '@/hooks/usePageFocusChange';
import { useToast } from '@/hooks/use-toast';
import { LoadingScreen } from '@/components/LoadingScreen';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { applyOptionShuffle } from '@/lib/battle-machine';
import { COMMANDER_PRESENCE_WINDOW_MS } from '@/lib/constants';
import { getServerOffset } from '@/lib/client-clock';

interface LiveQuizQuestion {
  id: string;
  text: string;
  options: string[];
  timer: number;
  sort_index: number;
  questionStats?: { correctOptionIndex?: number | null };
}

const REVEAL_HOLD_MS = 1500;

function useCommanderPresence(quiz: ValidatedQuiz, presence: PresenceMap | null): boolean {
  // Until the first RTDB presence snapshot arrives, assume the Commander is
  // online to avoid a false "connection interrupted" flash.
  if (!presence) return true;
  return !!(presence[quiz.created_by] && presence[quiz.created_by].online);
}

const CountdownTimer = React.memo(({ timeLeft, totalSec, idle }: { timeLeft: number; totalSec: number; idle?: boolean }) => {
  const progress = totalSec > 0 ? (timeLeft / totalSec) * 100 : 0;
  const isUrgent = timeLeft <= 5;
  const isCritical = timeLeft <= 3;

  if (idle) {
    return (
      <div
        className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-[12px] border border-border/50 bg-card"
        role="timer"
      >
        <Clock className="w-4 h-4 text-muted-foreground" />
        <span className="font-mono text-lg font-bold tabular-nums text-muted-foreground">--</span>
        <span className="text-sm text-muted-foreground">preparing...</span>
        <div className="flex gap-0.5 ml-auto" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-4 rounded-full bg-muted animate-pulse"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 mb-4 px-4 py-2.5 rounded-[12px] border transition-all duration-300",
        isCritical ? "bg-destructive/10 border-destructive/20 shadow-elevation-small" :
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
});

function AnimatedScore({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (to === from) { setDisplay(to); return; }
    const duration = Math.min(900, Math.max(300, Math.abs(to - from) * 2));
    const start = performance.now();
    let frame: number;
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    prevRef.current = to;
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span className={cn("font-mono font-semibold tabular-nums", className)}>{display} PTS</span>;
}

const LiveLeaderboard = React.memo(({ participants, teacherId, currentUserId, presence }: { participants: ValidatedParticipant[], teacherId: string, currentUserId: string, presence: PresenceMap | null }) => {
    const sortedParticipants = useMemo(() => [...participants].sort((a,b) => b.score - a.score), [participants]);
    const [rankDeltas, setRankDeltas] = useState<Record<string, number>>({});
    const prevRanksRef = useRef<Record<string, number>>({});

    useEffect(() => {
      const nextRanks: Record<string, number> = {};
      sortedParticipants.forEach((p, idx) => { nextRanks[p.user_id] = idx + 1; });
      const deltas: Record<string, number> = {};
      for (const uid of Object.keys(nextRanks)) {
        const prev = prevRanksRef.current[uid];
        if (prev && prev !== nextRanks[uid]) {
          deltas[uid] = prev > nextRanks[uid] ? 1 : -1;
        }
      }
      if (Object.keys(deltas).length > 0) setRankDeltas(deltas);
      prevRanksRef.current = nextRanks;
    }, [sortedParticipants]);

    const onlineParticipants = useMemo(() => {
      // Until the first RTDB presence snapshot arrives, don't filter anyone out.
      if (presence == null) return sortedParticipants;
      return sortedParticipants.filter(p => p.user_id === teacherId || presence[p.user_id] != null);
    }, [sortedParticipants, teacherId, presence]);
    const students = onlineParticipants.filter(p => p.user_id !== teacherId);
    const total = students.length;

    return (
        <Card className="w-full max-w-4xl mt-4 md:mt-6 card-hover shadow-elevation-small">
            <CardHeader className="py-3 md:py-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                  <span className="relative flex h-2 w-2" aria-hidden="true">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                  </span>
                  Standings
                </CardTitle>
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
                      const delta = rankDeltas[p.user_id];
                      return (
                        <div key={p.user_id} className={cn(
                          "flex items-center gap-2 md:gap-3 p-2 md:p-2.5 rounded-[12px] border transition-all duration-300",
                          isSelf ? "bg-primary/5 border-primary/20" : p.status === 'blocked' ? "bg-destructive/5 border-destructive/10 opacity-50" : showPodium ? "bg-warning/[0.03] border-warning/10" : "bg-card border-border/50"
                        )}>
                            <div className="relative shrink-0">
                              <Avatar className={cn("h-8 w-8 md:h-9 md:w-9", showPodium && "ring-2 ring-warning/30 ring-offset-1 ring-offset-card")}>
                                  <AvatarFallback className="text-xs md:text-sm bg-secondary">{p.avatar || '🎮'}</AvatarFallback>
                              </Avatar>
                              <span className={cn(
                                "absolute -bottom-1 -right-1 text-[9px] font-bold bg-background border border-border rounded-full w-4 h-4 flex items-center justify-center transition-colors duration-300",
                                rank === 1 ? "text-warning" : rank === 2 ? "text-muted-foreground" : rank === 3 ? "text-warning/70" : "text-muted-foreground",
                                delta === 1 && "bg-success/20 border-success/40 text-success",
                                delta === -1 && "bg-destructive/20 border-destructive/40 text-destructive"
                              )} aria-label={`Rank ${rank}`}>
                                {delta === 1 ? '▲' : delta === -1 ? '▼' : rank}
                              </span>
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-xs md:text-sm font-semibold truncate max-w-[60px] md:max-w-[80px]">{isSelf ? 'You' : p.name || p.user_id.slice(0, 6)}</span>
                                <AnimatedScore value={p.score} className={cn('text-[10px] md:text-xs', p.status === 'blocked' ? 'text-destructive' : 'text-primary')} />
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
});

const ParticipantStats = ({ participants, teacherId, submittedCount, finishedCount, onUnblock, unblockingId, independent, presence }: {
  participants: ValidatedParticipant[];
  teacherId: string;
  submittedCount: number;
  finishedCount: number;
  onUnblock: (userId: string) => void;
  unblockingId: string | null;
  independent: boolean;
  presence: PresenceMap | null;
}) => {
  const allStudents = participants.filter(p => p.user_id !== teacherId);
  // Roster stats reflect gladiators actually present via RTDB (ghost gladiators
  // whose tab was closed drop out). Blocked status is management state, so
  // blocked students stay visible for unblocking regardless of presence.
  const students = presence == null
    ? allStudents
    : allStudents.filter(p => presence[p.user_id] != null);
  const playing = students.filter(p => p.status === 'playing').length;
  const blocked = allStudents.filter(p => p.status === 'blocked').length;
  const finished = allStudents.filter(p => p.status === 'finished').length;
  const blockedStudents = allStudents.filter(p => p.status === 'blocked');

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
      {independent ? (
        <div className="flex items-center gap-1.5 bg-primary/5 px-3 py-1.5 rounded-[12px] text-xs">
          <Trophy className="w-3.5 h-3.5 text-primary" />
          <span className="font-semibold text-primary">{finishedCount}</span>
          <span className="text-muted-foreground">finished</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 bg-primary/5 px-3 py-1.5 rounded-[12px] text-xs">
          <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
          <span className="font-semibold text-primary">{submittedCount}</span>
          <span className="text-muted-foreground">answered</span>
        </div>
      )}
      {blocked > 0 && (
        <div className="flex items-center gap-1.5 bg-destructive/5 px-3 py-1.5 rounded-[12px] text-xs">
          <Ban className="w-3.5 h-3.5 text-destructive" />
          <span className="font-semibold text-destructive">{blocked}</span>
          <span className="text-muted-foreground">blocked</span>
        </div>
      )}
      {finished > 0 && !independent && (
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
  const router = useRouter();
  const { toast } = useToast();
  const [presence, setPresence] = useState<PresenceMap | null>(null);
  const commanderOnline = useCommanderPresence(quiz, presence);
  const independent = quiz.battle_mode === 'independent';

  const [questions, setQuestions] = useState<LiveQuizQuestion[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);
  const participants = allParticipants;

  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [answerSynced, setAnswerSynced] = useState(false);
  const [showViolationWarning, setShowViolationWarning] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [advanceStage, setAdvanceStage] = useState<'idle' | 'evaluating' | 'advancing'>('idle');
  const [timeLeft, setTimeLeft] = useState(0);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const endingRef = useRef(false);
  const lastViolationRef = useRef(0);
  const prevViolationsRef = useRef<Record<string, number>>({});
  const advancingRef = useRef(false);
  const confirmedQuestionIds = useRef(new Set<string>());
  const operationLock = useRef(false);
  const timeUpAttemptsRef = useRef<Record<string, number>>({});
  const autoEndedRef = useRef<string | null>(null);
  const commanderAbsentSinceRef = useRef<number | null>(null);
  const autoAdvanceAttemptedRef = useRef(new Set<string>());
  const offsetRef = useRef(0);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [hold, setHold] = useState<null | {
    question: LiveQuizQuestion;
    options: string[];
    selected: number | null;
    answered: boolean;
    correctIndex: number;
    userIndex: number;
  }>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealSnapshotRef = useRef<null | { qid: string; selected: number | null; answered: boolean; userIndex: number }>(null);
  const prevQuestionIdRef = useRef<string | null>(null);
  const { firestore } = useFirebase();

  // Clock-skew correction: battle timers compare this browser's clock against
  // server-written question_start_at timestamps. Sample the offset at mount
  // and refresh it periodically so skewed clients stop locking out of the
  // submit path prematurely (server still enforces its own tolerance).
  useEffect(() => {
    let mounted = true;
    const sample = () => {
      getServerOffset().then(o => { if (mounted) offsetRef.current = o; });
    };
    sample();
    const interval = setInterval(sample, 60 * 1000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // RTDB presence: single source of truth for who is actively connected to the
  // arena (replaces the old Firestore lastSeen heartbeats entirely).
  useEffect(() => {
    let mounted = true;
    const unsub = presenceService.subscribeToPresence(quiz.id, (p) => {
      if (mounted) setPresence(p);
    });
    return () => { mounted = false; unsub(); };
  }, [quiz.id]);

  // Tracks how long the Commander has been absent so gladiators can trigger the
  // auto-advance once the grace window has fully elapsed.
  useEffect(() => {
    if (commanderOnline) {
      commanderAbsentSinceRef.current = null;
    } else if (commanderAbsentSinceRef.current === null) {
      commanderAbsentSinceRef.current = Date.now();
    }
  }, [commanderOnline]);

  useEffect(() => {
    if (!isTeacher && participant.status === 'blocked') {
      router.push('/kicked');
    }
  }, [isTeacher, participant.status, router]);

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

  // Commander-facing violation alerts. Lives here instead of the participant
  // onSnapshot (removed — participants now flow down via props) so teacher
  // notifications still work without a duplicate Firestore listener.
  useEffect(() => {
    if (!isTeacher) return;
    allParticipants.forEach(p => {
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
  }, [allParticipants, isTeacher, quiz.created_by, toast]);

  const myQuestionOrder = independent ? (participant.question_order ?? null) : null;
  const myIndex = myQuestionOrder ? (participant.current_question_index ?? 0) : (quiz.current_question_index ?? -1);

  const currentQuestion = useMemo(() => {
    if (!questions.length) return null;
    if (myQuestionOrder) {
      const qid = myQuestionOrder[myIndex];
      if (!qid) return null;
      return questions.find(q => q.id === qid) ?? null;
    }
    if ((quiz.current_question_index ?? -1) < 0) return null;
    return questions[quiz.current_question_index ?? 0] ?? null;
  }, [questions, myQuestionOrder, myIndex, quiz.current_question_index]);

  // Gladiator-triggered Commander auto-advance: once the Commander has been
  // absent for the grace window and the current question's timer has expired,
  // the lowest-sorted online gladiator calls the server route once per question.
  const tryAutoAdvance = useCallback(() => {
    if (isTeacher || independent || !user) return;
    if (quiz.status !== 'live') return;
    if (commanderOnline) return;
    const since = commanderAbsentSinceRef.current;
    if (since == null || Date.now() - since < COMMANDER_PRESENCE_WINDOW_MS) return;
    if (currentQuestion && timeLeft > 0) return;
    const qid = currentQuestion?.id ?? '__idle__';
    if (autoAdvanceAttemptedRef.current.has(qid)) return;
    // Debounce: only the gladiator whose uid sorts first among the currently
    // online gladiators triggers the auto-advance so 30 clients don't all fire.
    const onlineGladiators = Object.keys(presence ?? {})
      .filter(uid => presence?.[uid]?.role === 'gladiator')
      .sort();
    const triggerUid = onlineGladiators[0];
    if (!triggerUid || triggerUid !== user.id) return;
    autoAdvanceAttemptedRef.current.add(qid);
    battleService.autoAdvance(quiz.id)
      .then(() => {})
      .catch(() => {
        // Transient failure (or the Commander actually reconnected). Drop the
        // lock so a later cycle can retry; rate limiting bounds the retries.
        autoAdvanceAttemptedRef.current.delete(qid);
      });
  }, [isTeacher, independent, user, quiz.status, commanderOnline, currentQuestion, timeLeft, presence, quiz.id]);

  useEffect(() => {
    if (isTeacher || independent) return;
    const interval = setInterval(tryAutoAdvance, 5000);
    return () => clearInterval(interval);
  }, [tryAutoAdvance, isTeacher, independent]);

  const displayedOptions = useMemo(() => {
    if (!currentQuestion) return [];
    if (independent && participant.option_shuffle?.[currentQuestion.id]) {
      return applyOptionShuffle(currentQuestion.options, participant.option_shuffle[currentQuestion.id]);
    }
    return currentQuestion.options;
  }, [currentQuestion, independent, participant.option_shuffle]);

  // Post-scoring reveal: once the server has evaluated the current question,
  // `questionStats.correctOptionIndex` appears on the question doc. For a
  // gladiator this unlocks the correct/incorrect flash — the emotional payoff
  // of the battle. The question is sealed by then (timer expired or answered),
  // so no answer can leak forward.
  const displayQuestion = hold ? hold.question : currentQuestion;
  const displayKey = displayQuestion?.id ?? null;
  const shownUserIndex = hold ? hold.userIndex : myIndex;
  const displayOptions = hold ? hold.options : displayedOptions;
  const displaySelected = hold ? hold.selected : selectedAnswer;
  const displayAnswered = hold ? hold.answered : hasAnswered;

  const liveReveal = useMemo(() => {
    if (isTeacher || hold || !currentQuestion) return null;
    const ci = currentQuestion.questionStats?.correctOptionIndex;
    if (typeof ci !== 'number') return null;
    if (!hasAnswered && timeLeft > 0) return null;
    return { correctIndex: ci, selected: selectedAnswer, answered: hasAnswered };
  }, [isTeacher, hold, currentQuestion, hasAnswered, selectedAnswer, timeLeft]);

  // Arm the reveal snapshot while the evaluated question is still on screen,
  // so an incoming question switch can freeze it for a satisfying flash.
  useEffect(() => {
    if (isTeacher || hold || !currentQuestion) { revealSnapshotRef.current = null; return; }
    const ci = currentQuestion.questionStats?.correctOptionIndex;
    if (typeof ci !== 'number') return;
    if (!hasAnswered && timeLeft > 0) return;
    revealSnapshotRef.current = { qid: currentQuestion.id, selected: selectedAnswer, answered: hasAnswered, userIndex: myIndex };
  }, [currentQuestion, hasAnswered, selectedAnswer, timeLeft, myIndex, isTeacher, hold]);

  // When the question advances with a reveal armed, freeze the old question on
  // screen (with options as the gladiator saw them) so the verdict lands.
  useEffect(() => {
    const nextId = currentQuestion?.id ?? null;
    if (nextId === prevQuestionIdRef.current) return;
    const prevId = prevQuestionIdRef.current;
    prevQuestionIdRef.current = nextId;
    if (isTeacher || hold) return;
    const snap = revealSnapshotRef.current;
    if (!snap || snap.qid !== prevId) return;
    const oldQ = questions.find(q => q.id === snap.qid);
    const ci = oldQ?.questionStats?.correctOptionIndex;
    if (!oldQ || typeof ci !== 'number') return;
    const opts = participant.option_shuffle?.[oldQ.id]
      ? applyOptionShuffle(oldQ.options, participant.option_shuffle[oldQ.id])
      : oldQ.options;
    setHold({ question: oldQ, options: opts, selected: snap.selected, answered: snap.answered, correctIndex: ci, userIndex: snap.userIndex });
    revealSnapshotRef.current = null;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      setHold(null);
    }, REVEAL_HOLD_MS);
  }, [currentQuestion, questions, isTeacher, hold, participant.option_shuffle]);

  const answerStartAt = useMemo(() => {
    if (independent) {
      return typeof participant.question_start_at === 'number' ? participant.question_start_at : Date.now();
    }
    return typeof quiz.question_start_at === 'number' ? quiz.question_start_at : Date.now();
  }, [independent, participant.question_start_at, quiz.question_start_at]);

  const isQuestionTimerActive = quiz.status === 'live' && (!isTeacher || !independent);

  useEffect(() => {
    if (!isQuestionTimerActive || !currentQuestion) return;
    if (!isTeacher && independent && participant.status !== 'playing') return;
    const durationMs = currentQuestion.timer * 1000;
    const totalSec = currentQuestion.timer;
    const deadline = answerStartAt + durationMs;

    const interval = setInterval(() => {
      // deadline is on the server's clock (question_start_at is server-written);
      // correct this browser's now with the sampled offset first.
      const now = Date.now() + offsetRef.current;
      const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
      const clamped = Math.min(remaining, totalSec);
      setTimeLeft(clamped);
      if (clamped <= 0) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, [isQuestionTimerActive, currentQuestion?.id, currentQuestion?.timer, answerStartAt, isTeacher, independent, participant.status]);

  useEffect(() => {
    if (!displayKey) return;
    setIsTransitioning(true);
    setSelectedAnswer(null);
    setHasAnswered(false);
    setAnswerSynced(false);
    setShowViolationWarning(false);
    setAdvanceStage('idle');
    const timer = setTimeout(() => setIsTransitioning(false), 300);
    return () => clearTimeout(timer);
  }, [displayKey]);

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
  }, [currentQuestion?.id, isTeacher, user?.id, firestore, quiz.id]);

  useEffect(() => {
    if (!isTeacher || !firestore || independent) return;
    const qId = currentQuestion?.id;
    if (!qId || !quiz.id) return;
    const subsRef = collection(firestore, 'quizzes', quiz.id, 'questions', qId, 'submissions');
    const unsub = onSnapshot(subsRef, (snap) => {
      setSubmittedCount(snap.docs.filter(d => d.data()?.selected_option !== undefined).length);
    });
    return () => { unsub(); };
  }, [isTeacher, currentQuestion?.id, quiz.id, firestore, independent]);

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
    if (!qId || hasAnswered || isTeacher || !user || timeLeft === 0 || quiz.status !== 'live' || participant.status === 'blocked' || isAdvancing) return;
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
      if (independent) {
        try {
          await battleService.evaluateSelf(quiz.id, qId);
        } catch (e) {
          if (!(e instanceof Error && e.message.includes('not live'))) {
            toast({ variant: 'destructive', title: 'Sync Issue', description: 'Answer saved. Retrying evaluation...' });
          }
        }
      }
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

  useEffect(() => {
    if (independent && !isTeacher && currentQuestion && quiz.status === 'live' && participant.status === 'playing') {
      if (hasAnswered || timeLeft > 0) return;
      const qid = currentQuestion.id;
      const lastAttempt = timeUpAttemptsRef.current[qid] ?? 0;
      if (Date.now() - lastAttempt < 8000) return;
      timeUpAttemptsRef.current[qid] = Date.now();
      const t = setTimeout(() => {
        battleService.evaluateSelf(quiz.id, qid).catch(() => {});
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [independent, isTeacher, currentQuestion?.id, quiz.status, participant.status, hasAnswered, timeLeft, quiz.id]);

  useEffect(() => {
    if (!independent && quiz.status === 'live' && timeLeft === 0 && currentQuestion && !isTeacher) {
      const qIndex = quiz.current_question_index ?? 0;
      const qCount = quiz.question_count ?? 0;
      if (qIndex < qCount - 1) return;
      if (advancingRef.current || endingRef.current || autoEndedRef.current === currentQuestion.id) return;
      autoEndedRef.current = currentQuestion.id;
      const t = setTimeout(() => {
        battleService.endBattle(quiz.id).catch(() => {});
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [independent, quiz.status, timeLeft, currentQuestion?.id, quiz.current_question_index, quiz.question_count, isTeacher, quiz.id]);

  const handleNext = async () => {
    if (!isTeacher || independent || advancingRef.current || operationLock.current) return;
    advancingRef.current = true;
    operationLock.current = true;
    setIsAdvancing(true);
    setAdvanceStage('evaluating');
    try {
      if (currentQuestion) {
        await battleService.evaluateQuestion(quiz.id, currentQuestion.id);
      }
      setAdvanceStage('advancing');
      await battleService.advanceQuestion(quiz.id);
    } catch (e) {
      console.error('[handleNext] Failed to advance:', e);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to advance. Please try again.' });
    } finally { advancingRef.current = false; operationLock.current = false; setIsAdvancing(false); setAdvanceStage('idle'); }
  };

  const handleEndBattle = async () => {
    if (!isTeacher || endingRef.current || operationLock.current) return;
    endingRef.current = true;
    operationLock.current = true;
    setIsEnding(true);
    try {
      await battleService.endBattle(quiz.id);
      toast({ title: 'Battle Ended', description: 'The battle has been finalized.' });
    } catch (e) {
      console.error('[handleEndBattle] Failed to end:', e);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to end battle. Please try again.' });
    } finally {
      endingRef.current = false;
      operationLock.current = false;
      setIsEnding(false);
    }
  };

  const handlePause = async () => {
    if (!isTeacher || operationLock.current || isPausing) return;
    operationLock.current = true;
    setIsPausing(true);
    try {
      await battleService.pauseBattle(quiz.id);
      toast({ title: 'Battle Paused', description: 'Timers and answers are frozen.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to pause the battle.' });
    } finally {
      setIsPausing(false);
      operationLock.current = false;
    }
  };

  const handleResume = async () => {
    if (!isTeacher || operationLock.current || isResuming) return;
    operationLock.current = true;
    setIsResuming(true);
    try {
      await battleService.resumeBattle(quiz.id);
      toast({ title: 'Battle Resumed', description: 'Timers restored to their exact remaining time.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to resume the battle.' });
    } finally {
      setIsResuming(false);
      operationLock.current = false;
    }
  };

  const handleSkip = async () => {
    if (!isTeacher || operationLock.current || isSkipping) return;
    operationLock.current = true;
    setIsSkipping(true);
    setShowSkipConfirm(false);
    try {
      // Reconcile first: score any submissions that landed before the skip so
      // they aren't orphaned — only genuine non-submitters take the penalty.
      if (currentQuestion) {
        await battleService.evaluateQuestion(quiz.id, currentQuestion.id);
      }
      const res = await battleService.skipQuestion(quiz.id);
      toast({ title: 'Question Skipped', description: res?.ended ? 'That was the final question. Battle complete.' : 'Everyone moved safely to the next question.' });
    } catch (e) {
      console.error('[handleSkip] Failed:', e);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to skip the question.' });
    } finally {
      setIsSkipping(false);
      operationLock.current = false;
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

  const studentCount = participants.filter(p => p.user_id !== quiz.created_by && (presence == null || presence[p.user_id] != null)).length;
  const showCommanderOffline = !isTeacher && !commanderOnline && (quiz.status === 'live' || quiz.status === 'paused');
  const finishedCount = participants.filter(p => p.user_id !== quiz.created_by && p.status === 'finished').length;
  const isGladiatorFinished = !isTeacher && independent && participant.status === 'finished';

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-3 md:p-4 bg-background overflow-x-hidden animate-in safe-top safe-bottom">
      {quiz.status === 'paused' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
          <div className="relative bg-card border border-warning/20 rounded-[18px] shadow-elevation-medium p-6 max-w-sm w-full space-y-4 text-center animate-in">
            <div className="flex items-center justify-center w-12 h-12 rounded-[14px] bg-warning/10 mx-auto">
              <Pause className="w-6 h-6 text-warning" />
            </div>
            <h2 className="font-headline text-xl font-semibold">Battle Paused</h2>
            <p className="text-sm text-muted-foreground">
              The Commander has paused the battle. Timers and answers are frozen and will resume exactly where they left off.
            </p>
          </div>
        </div>
      )}

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
              className="w-full h-11 rounded-[12px] bg-destructive text-destructive-foreground font-medium text-sm hover:bg-destructive/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              Continue Battle
            </button>
          </div>
        </div>
      )}

      {showCommanderOffline && (
        <div className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-[12px] bg-warning/5 border border-warning/10 w-full max-w-4xl shadow-elevation-small" role="alert" aria-live="assertive">
          <WifiOff className="w-4 h-4 text-warning shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-warning">Commander connection interrupted</span>
            <p className="text-xs text-muted-foreground">The battle won't stall — once the grace period ends, the next question will advance automatically.</p>
          </div>
        </div>
      )}

      {isTeacher && (
        <div className="flex items-center gap-2 mb-4 w-full max-w-4xl justify-between">
          <ParticipantStats participants={participants} teacherId={quiz.created_by} submittedCount={submittedCount} finishedCount={finishedCount} onUnblock={handleUnblock} unblockingId={unblockingId} independent={independent} presence={presence} />
        </div>
      )}

      {isGladiatorFinished && (
        <div className="w-full max-w-4xl mb-4">
          <Card className="border-success/20 bg-success/5 shadow-elevation-small">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-[14px] bg-success/10 shrink-0">
                <Trophy className="w-6 h-6 text-success" />
              </div>
              <div>
                <h2 className="font-headline text-lg font-semibold">You&apos;ve Finished!</h2>
                <p className="text-sm text-muted-foreground">Your score has been recorded. Waiting for the remaining gladiators to complete the battle...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!isTeacher && !isGladiatorFinished && !hold && (
        <CountdownTimer idle={!currentQuestion} timeLeft={timeLeft} totalSec={currentQuestion?.timer ?? 0} />
      )}

      {!isGladiatorFinished && (
      <Card className="w-full max-w-4xl card-hover shadow-elevation-small">
        <CardHeader className={cn(
          "text-center pt-10 pb-4 md:pb-6 px-5 md:px-10 transition-opacity duration-300",
          isTransitioning ? "opacity-50" : "opacity-100"
        )}>
          {isTeacher && independent ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-3">
                <Trophy className="w-5 h-5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Independent Mode
                </span>
              </div>
              <CardTitle className="text-xl sm:text-2xl font-headline tracking-tight">
                Gladiators are progressing at their own pace
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Question order and options are shuffled per gladiator. Scores update in real time below.
              </p>
            </div>
          ) : displayQuestion ? (
            <>
              <div className="flex items-center justify-center gap-3 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Question {shownUserIndex + 1} / {quiz.question_count ?? 0}
                </span>
                <div className="flex gap-1" aria-hidden="true">
                  {Array.from({ length: quiz.question_count ?? 0 }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "w-2 h-2 rounded-full transition-all duration-300",
                        i < shownUserIndex ? "bg-primary" :
                        i === shownUserIndex ? "bg-primary/60 scale-125" :
                        "bg-muted-foreground/20"
                      )}
                    />
                  ))}
                </div>
              </div>
              <CardTitle className="text-xl sm:text-3xl md:text-4xl font-headline leading-snug md:leading-tight tracking-tight">{displayQuestion.text}</CardTitle>
              {isTeacher && !independent && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className={cn("font-mono text-lg font-bold tabular-nums", timeLeft <= 5 ? "text-destructive" : "text-foreground")} aria-live="polite" aria-atomic="true">{timeLeft}<span className="text-sm font-normal text-muted-foreground ml-0.5">s</span></span>
                </div>
              )}
            </>
          ) : (
            <CardTitle className="text-xl sm:text-2xl font-headline tracking-tight">Preparing question...</CardTitle>
          )}
        </CardHeader>
        {displayQuestion && !isTeacher && (
        <CardContent className="pb-10 md:pb-14 px-5 md:px-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {displayOptions.map((opt: string, i: number) => {
              const isSelected = displaySelected === i;
              const revealed = hold !== null || liveReveal !== null;
              const correctIndex = hold ? hold.correctIndex : (liveReveal?.correctIndex ?? -1);
              const isRevealedCorrect = revealed && i === correctIndex;
              const isRevealedWrongPick = revealed && isSelected && i !== correctIndex;
              return (
              <button
                key={i}
                onClick={() => handleAnswerSubmit(i)}
                disabled={displayAnswered || isTeacher || timeLeft === 0 || quiz.status !== 'live' || participant.status === 'blocked'}
                aria-pressed={isSelected}
                className={cn(
                  "group relative flex flex-col gap-2 p-3 md:p-5 rounded-[14px] border-2 text-left transition-all duration-300 ease-out min-h-14 md:min-h-[5.5rem] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                  isRevealedCorrect
                    ? "border-success bg-success/10 shadow-elevation-small animate-in"
                    : isRevealedWrongPick
                      ? "border-destructive bg-destructive/10 shadow-elevation-small animate-in"
                      : revealed
                        ? "border-border/30 bg-muted/10 opacity-40"
                        : isSelected
                          ? "border-primary bg-primary/5 shadow-elevation-small ring-1 ring-primary/20"
                          : displayAnswered
                            ? "border-border/30 bg-muted/10 opacity-40"
                            : "border-border/50 bg-card hover:border-primary/30 hover:bg-primary/5 hover:shadow-elevation-small hover:-translate-y-0.5 cursor-pointer active:scale-[0.98]",
                  (displayAnswered || isTeacher || timeLeft === 0 || quiz.status !== 'live') && "cursor-default"
                )}
                aria-label={`Option ${String.fromCharCode(65 + i)}: ${opt}`}
              >
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "shrink-0 flex items-center justify-center w-8 h-8 rounded-[10px] text-sm font-bold font-mono transition-all duration-300 ease-out",
                    isRevealedCorrect
                      ? "bg-success text-success-foreground shadow-elevation-small"
                      : isRevealedWrongPick
                        ? "bg-destructive text-destructive-foreground shadow-elevation-small"
                        : isSelected
                          ? "bg-primary text-primary-foreground shadow-elevation-small"
                          : "bg-primary/10 text-primary group-hover:bg-primary/20 group-hover:scale-105"
                  )}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="flex-1 text-sm md:text-base font-medium leading-snug">{opt}</span>
                  {isRevealedCorrect && (
                    <CheckCircle2 className="w-5 h-5 text-success shrink-0 animate-in" aria-label="Correct answer" />
                  )}
                  {isRevealedWrongPick && (
                    <XCircle className="w-5 h-5 text-destructive shrink-0 animate-in" aria-label="Your answer was incorrect" />
                  )}
                  {!revealed && isSelected && (
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                  )}
                </div>
              </button>
              );
            })}
          </div>

          {(() => {
            const revealInfo = hold ? { correctIndex: hold.correctIndex, answered: hold.answered, selected: hold.selected } : liveReveal;
            if (!revealInfo) return null;
            const verdict = revealInfo.answered && revealInfo.selected === revealInfo.correctIndex ? 'correct'
              : revealInfo.answered ? 'incorrect' : 'timedout';
            const letter = String.fromCharCode(65 + revealInfo.correctIndex);
            return (
              <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className={cn(
                  "flex items-center justify-center gap-2.5 mt-5 px-4 py-3.5 rounded-[12px] border animate-in",
                  verdict === 'correct' ? "bg-success/10 border-success/25" : verdict === 'incorrect' ? "bg-destructive/10 border-destructive/25" : "bg-warning/10 border-warning/25"
                )}
              >
                {verdict === 'correct' ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-success" />
                    <span className="font-semibold text-success">Correct!</span>
                    <span className="text-sm text-muted-foreground">Well fought, gladiator.</span>
                  </>
                ) : verdict === 'incorrect' ? (
                  <>
                    <XCircle className="w-5 h-5 shrink-0 text-destructive" />
                    <span className="font-semibold text-destructive">Incorrect</span>
                    <span className="text-sm text-muted-foreground">The correct answer was {letter}.</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-5 h-5 shrink-0 text-warning" />
                    <span className="font-semibold text-warning">Time&apos;s up</span>
                    <span className="text-sm text-muted-foreground">The correct answer was {letter}.</span>
                  </>
                )}
              </div>
            );
          })()}

          {displayAnswered && !isTeacher && !(hold ? true : liveReveal !== null) && (
            <div className="flex items-center justify-center gap-2 mt-4 text-sm">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <span className="font-medium text-primary">Answer Locked</span>
              <span className="text-muted-foreground mx-1">·</span>
              {answerSynced ? (
                independent ? (
                  <span className="text-muted-foreground">Score saved. Next question coming up...</span>
                ) : (
                  <span className="text-muted-foreground">Waiting for the Commander...</span>
                )
              ) : (
                <span className="text-warning font-medium flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Answer sync pending
                </span>
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
        )}
      </Card>
      )}

      {isTeacher && !independent && currentQuestion && (
        <div className="flex flex-col items-center pt-6 md:pt-8 gap-2 w-full max-w-4xl">
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button onClick={handleNext} disabled={isAdvancing || isEnding || isSkipping || isPausing || isResuming} size="lg" className="w-full sm:w-auto min-w-[200px]" aria-busy={isAdvancing}>
              {isAdvancing && advanceStage === 'evaluating' ? <Loader2 className="animate-spin mr-2" /> : isAdvancing && advanceStage === 'advancing' ? <Loader2 className="animate-spin mr-2" /> : <ArrowRight className="mr-2 h-5 w-5" />}
              {isAdvancing && advanceStage === 'evaluating' ? 'Evaluating answers...' :
               isAdvancing && advanceStage === 'advancing' ? 'Advancing...' :
               (quiz.current_question_index ?? 0) === (quiz.question_count ?? 0) - 1 ? 'Reveal Podium' : 'Evaluate & Next'}
            </Button>
            {quiz.status === 'paused' ? (
              <Button onClick={handleResume} variant="outline" disabled={isResuming || isEnding || isSkipping} size="lg" className="w-full sm:w-auto">
                {isResuming ? <Loader2 className="animate-spin mr-2" /> : <Play className="mr-2 h-5 w-5" />}
                Resume
              </Button>
            ) : (
              <Button onClick={handlePause} variant="outline" disabled={isPausing || isEnding || isSkipping || isAdvancing} size="lg" className="w-full sm:w-auto">
                {isPausing ? <Loader2 className="animate-spin mr-2" /> : <Pause className="mr-2 h-5 w-5" />}
                Pause
              </Button>
            )}
            <Button onClick={() => setShowSkipConfirm(true)} variant="outline" disabled={isSkipping || isEnding || isAdvancing} size="lg" className="w-full sm:w-auto">
              {isSkipping ? <Loader2 className="animate-spin mr-2" /> : <SkipForward className="mr-2 h-5 w-5" />}
              Skip
            </Button>
            <Button onClick={() => setShowEndConfirm(true)} variant="outline" disabled={isAdvancing || isEnding || isSkipping} size="lg" className="w-full sm:w-auto">
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

      {isTeacher && independent && (
        <div className="flex flex-col items-center pt-6 md:pt-8 gap-2 w-full max-w-4xl">
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {quiz.status === 'paused' ? (
              <Button onClick={handleResume} variant="outline" disabled={isResuming || isEnding} size="lg" className="w-full sm:w-auto">
                {isResuming ? <Loader2 className="animate-spin mr-2" /> : <Play className="mr-2 h-5 w-5" />}
                Resume
              </Button>
            ) : (
              <Button onClick={handlePause} variant="outline" disabled={isPausing || isEnding} size="lg" className="w-full sm:w-auto">
                {isPausing ? <Loader2 className="animate-spin mr-2" /> : <Pause className="mr-2 h-5 w-5" />}
                Pause
              </Button>
            )}
            <Button onClick={() => setShowEndConfirm(true)} variant="outline" disabled={isEnding} size="lg" className="w-full sm:w-auto">
              {isEnding ? <Loader2 className="animate-spin mr-2" /> : <Flag className="mr-2 h-5 w-5" />}
              End Battle
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{finishedCount} / {studentCount} gladiators finished</p>
        </div>
      )}

      <LiveLeaderboard participants={participants} teacherId={quiz.created_by} currentUserId={user?.id || ''} presence={presence} />

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

      <AlertDialog open={showSkipConfirm} onOpenChange={(o) => { if (!o && !isSkipping) setShowSkipConfirm(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skip this Question?</AlertDialogTitle>
            <AlertDialogDescription>
              The question will be marked as skipped for every gladiator. No scores are awarded for it and everyone moves to the next question safely.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSkipping}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSkip} disabled={isSkipping}>
              {isSkipping ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
              Skip Question
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
