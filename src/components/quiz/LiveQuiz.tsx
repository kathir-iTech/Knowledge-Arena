'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ValidatedQuiz, ValidatedParticipant } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, Loader2, ArrowRight, ShieldAlert, User, Users, Ban, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '../ui/avatar';

import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { quizService } from '@/services/quiz.service';
import { questionService, submissionService } from '@/services/game.service';
import { participantService } from '@/services/participant.service';
import { usePageFocusChange } from '@/hooks/usePageFocusChange';
import { useToast } from '@/hooks/use-toast';
import { LoadingScreen } from '@/components/LoadingScreen';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';

interface LiveQuizQuestion {
  id: string;
  text: string;
  options: string[];
  timer: number;
  sort_index: number;
}

const LiveLeaderboard = ({ quizId, participants, teacherId, currentUserId }: { quizId: string, participants: ValidatedParticipant[], teacherId: string, currentUserId: string }) => {
    const sortedParticipants = useMemo(() => [...participants].sort((a,b) => b.score - a.score), [participants]);
    const total = sortedParticipants.filter(p => p.user_id !== teacherId).length;

    return (
        <Card className="w-full max-w-4xl mt-4 md:mt-6">
            <CardHeader className="py-3 md:py-4">
              <CardTitle className="text-sm font-semibold text-muted-foreground">Standings ({total})</CardTitle>
            </CardHeader>
            <CardContent className="p-3 md:p-5">
                <div className="flex flex-wrap gap-2.5 md:gap-3">
                    {sortedParticipants.filter(p => p.user_id !== teacherId).map((p, idx) => {
                      const rank = idx + 1;
                      const percentile = total > 0 ? Math.round(((total - rank) / total) * 100) : 0;
                      const isSelf = p.user_id === currentUserId;
                      return (
                        <div key={p.user_id} className={cn(
                          "flex items-center gap-2 md:gap-3 p-2 md:p-2.5 rounded-[12px] border transition-all duration-150",
                          isSelf ? "bg-primary/5 border-primary/20" : p.status === 'blocked' ? "bg-destructive/5 border-destructive/10 opacity-50" : "bg-card border-border/50 hover:border-primary/20"
                        )}>
                            <div className="relative shrink-0">
                              <Avatar className="h-8 w-8 md:h-9 md:w-9">
                                  <AvatarFallback className="text-xs md:text-sm bg-secondary">{p.avatar || '🎮'}</AvatarFallback>
                              </Avatar>
                              <span className={cn("absolute -bottom-1 -right-1 text-[9px] font-bold bg-background border border-border rounded-full w-4 h-4 flex items-center justify-center", rank <= 3 ? "text-primary" : "text-muted-foreground")}>{rank}</span>
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

const ParticipantStats = ({ participants, teacherId, submittedCount }: { participants: ValidatedParticipant[], teacherId: string, submittedCount: number }) => {
  const students = participants.filter(p => p.user_id !== teacherId);
  const playing = students.filter(p => p.status === 'playing').length;
  const blocked = students.filter(p => p.status === 'blocked').length;
  const finished = students.filter(p => p.status === 'finished').length;

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
    </div>
  );
};

export default function LiveQuiz({ quiz, participant, isTeacher, allParticipants }: { quiz: ValidatedQuiz, participant: ValidatedParticipant, isTeacher: boolean, allParticipants: ValidatedParticipant[] }) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [questions, setQuestions] = useState<LiveQuizQuestion[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);
  const [participants, setParticipants] = useState<ValidatedParticipant[]>(allParticipants || []);

  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [showViolationWarning, setShowViolationWarning] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [submittedCount, setSubmittedCount] = useState(0);
  const lastViolationRef = useRef(0);
  const prevViolationsRef = useRef<Record<string, number>>({});
  const advancingRef = useRef(false);
  const submittingRef = useRef(false);
  const { firestore } = useFirebase();

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
    });
    return () => { mounted = false; qSub(); };
  }, [quiz.id]);

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
              description: `${p.name || p.user_id.slice(0, 8)} — Violation #${curr} (${new Date().toLocaleTimeString()})`,
              variant: p.status === 'blocked' ? 'destructive' : 'default',
            });
          }
          prevViolationsRef.current[p.user_id] = curr;
        });
      }
    });
    return () => { mounted = false; pSub(); };
  }, [quiz.id, isTeacher, quiz.created_by]);

  const currentQuestion = useMemo(() => {
    if (!questions.length || (quiz.current_question_index ?? -1) < 0) return null;
    return questions[quiz.current_question_index ?? 0];
  }, [questions, quiz.current_question_index]);

  useEffect(() => {
    if (!currentQuestion) return;
    const start = typeof quiz.question_start_at === 'number' ? quiz.question_start_at : Date.now();
    const limit = currentQuestion.timer * 1000;
    const end = start + limit;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, [currentQuestion, quiz.current_question_index, quiz.question_start_at]);

  // Reset submission state when question advances
  const prevQuestionRef = useRef<string | null>(null);
  useEffect(() => {
    const qId = currentQuestion?.id ?? null;
    if (qId && qId !== prevQuestionRef.current) {
      prevQuestionRef.current = qId;
      setSelectedAnswer(null);
      setHasAnswered(false);
      setShowViolationWarning(false);
    }
  }, [currentQuestion?.id]);

  useEffect(() => {
    let mounted = true;
    if (isTeacher || !currentQuestion || !user || !firestore) return;
    const subDocRef = doc(firestore, 'quizzes', quiz.id, 'questions', currentQuestion.id, 'submissions', user.id);
    getDoc(subDocRef).then(snap => {
      if (!mounted) return;
      if (snap.exists()) {
        const data = snap.data() as { selected_option: number };
        setSelectedAnswer(data.selected_option);
        setHasAnswered(true);
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, [quiz.current_question_index, isTeacher, currentQuestion?.id, user?.id, firestore, quiz.id]);

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
    if (hasAnswered || submittingRef.current || isTeacher || !currentQuestion || !user || timeLeft === 0 || participant.status === 'blocked' || isAdvancing) return;
    submittingRef.current = true;
    setHasAnswered(true);
    setSelectedAnswer(idx);
    try {
      await submissionService.submitAnswer({
        quiz_id: quiz.id,
        question_id: currentQuestion.id,
        user_id: user.id,
        selected_option: idx
      });
    } catch (e) {
      if (e instanceof Error && e.message.includes('permission')) {
        setSelectedAnswer(idx);
        setHasAnswered(true);
      } else {
        setHasAnswered(false);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to submit answer. Please try again.' });
      }
    } finally { submittingRef.current = false; }
  };

  const handleNext = async () => {
    if (!isTeacher || advancingRef.current) return;
    advancingRef.current = true;
    setIsAdvancing(true);
    try {
      if (currentQuestion) {
        const startTime = typeof quiz.question_start_at === 'number' ? quiz.question_start_at : Date.now();
        await questionService.evaluateQuestion(quiz.id, currentQuestion.id, startTime);
      }
      const nextIdx = (quiz.current_question_index ?? 0) + 1;
      if (nextIdx < (quiz.question_count ?? 0)) {
        await quizService.advanceToQuestion(quiz.id, nextIdx);
      } else {
        await quizService.updateQuizStatus(quiz.id, 'finished');
        await participantService.markAllFinished(quiz.id, quiz.created_by);
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to advance. Please try again.' });
    } finally { advancingRef.current = false; setIsAdvancing(false); }
  };

  if (isLoadingQuestions) return <LoadingScreen message="Loading questions..." />;
  if (!currentQuestion) return null;

  const studentCount = participants.filter(p => p.user_id !== quiz.created_by).length;
  const progressValue = Math.max(0, Math.min(100, (timeLeft / (currentQuestion.timer || 1)) * 100));

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

      {isTeacher && <ParticipantStats participants={participants} teacherId={quiz.created_by} submittedCount={submittedCount} />}

      {!isTeacher && (
        <div className={cn(
          "flex items-center gap-2 mb-4 px-4 py-2 rounded-[12px] border transition-all duration-150",
          timeLeft <= 5 ? "bg-destructive/5 border-destructive/10" : "bg-card border-border/50"
        )}>
          <Clock className={cn("w-4 h-4", timeLeft <= 5 ? "text-destructive" : "text-muted-foreground")} />
          <span className={cn("font-mono text-base font-bold tabular-nums", timeLeft <= 5 ? "text-destructive" : "text-foreground")} aria-live="polite" aria-atomic="true">{timeLeft}</span>
          <span className="text-sm text-muted-foreground">seconds remaining</span>
        </div>
      )}

      <Card className="w-full max-w-4xl">
        <CardHeader className="text-center pt-10 pb-4 md:pb-6 px-5 md:px-10">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
            Question {(quiz.current_question_index ?? 0) + 1} / {quiz.question_count ?? 0}
          </span>
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
                      : "border-border/50 bg-card hover:border-primary/30 hover:bg-primary/[0.02] hover:shadow-elevation-small cursor-pointer",
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
          {isTeacher && (
            <div className="flex flex-col items-center pt-6 md:pt-8 gap-2">
              <Button onClick={handleNext} disabled={isAdvancing} size="lg" className="w-full md:w-auto min-w-[200px]" aria-busy={isAdvancing}>
                {isAdvancing ? <Loader2 className="animate-spin mr-2" /> : <ArrowRight className="mr-2 h-5 w-5" />}
                {(quiz.current_question_index ?? 0) === (quiz.question_count ?? 0) - 1 ? 'Reveal Podium' : 'Evaluate & Next'}
              </Button>
              <p className="text-sm text-muted-foreground">{submittedCount} / {studentCount} gladiators answered</p>
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
      <LiveLeaderboard quizId={quiz.id} participants={participants} teacherId={quiz.created_by} currentUserId={user?.id || ''} />
    </div>
  );
}
