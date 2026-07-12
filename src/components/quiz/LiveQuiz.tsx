'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ValidatedQuiz, ValidatedParticipant } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Clock, Loader2, ArrowRight, ShieldAlert, User, Users, Ban, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction } from '../ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { quizService } from '@/services/quiz.service';
import { questionService, submissionService } from '@/services/game.service';
import { participantService } from '@/services/participant.service';
import { usePageFocusChange } from '@/hooks/usePageFocusChange';
import { useToast } from '@/hooks/use-toast';
import { LoadingScreen } from '@/components/LoadingScreen';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';

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
        <Card className="w-full max-w-4xl mt-3 md:mt-6 border-primary/20 bg-secondary/10 px-0">
            <CardHeader className="py-2 md:py-3">
              <CardTitle className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-primary/70">Standings ({total})</CardTitle>
            </CardHeader>
            <CardContent className="p-2 md:p-4">
                <div className="flex flex-wrap gap-2 md:gap-4">
                    {sortedParticipants.filter(p => p.user_id !== teacherId).map((p, idx) => {
                      const rank = idx + 1;
                      const percentile = total > 0 ? Math.round(((total - rank) / total) * 100) : 0;
                      const isSelf = p.user_id === currentUserId;
                      return (
                        <div key={p.user_id} className={cn(
                          "flex items-center gap-2 md:gap-3 p-[6px] md:p-2 rounded-lg border transition-all relative",
                          isSelf ? "bg-primary/15 border-primary/40 ring-1 ring-primary/30" : "",
                          p.status === 'blocked' ? "bg-destructive/10 border-destructive/20 opacity-60" : "bg-secondary/40 border-border/50"
                        )}>
                            <div className="relative">
                              <Avatar className="h-6 w-6 md:h-8 md:w-8 border border-primary/20">
                                  <AvatarFallback className="text-[10px] md:text-sm bg-background">{p.avatar || '🎮'}</AvatarFallback>
                              </Avatar>
                              <span className="absolute -bottom-1 -right-1 text-[6px] md:text-[8px] font-black bg-background border border-border rounded-full w-3 h-3 md:w-4 md:h-4 flex items-center justify-center">{rank}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] md:text-sm font-bold max-w-[60px] md:max-w-[80px] truncate">{isSelf ? 'You' : p.name || p.user_id.slice(0, 6)}</span>
                                <span className={cn('text-[9px] md:text-xs font-mono font-bold', p.status === 'blocked' ? 'text-destructive' : 'text-primary')}>
                                  {p.status === 'blocked' ? 'BLOCKED' : `${p.score} PTS`}
                                </span>
                                {isSelf && p.status !== 'blocked' && (
                                  <span className="text-[7px] md:text-[9px] text-muted-foreground">Top {percentile}%</span>
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
    <div className="flex flex-wrap gap-2 md:gap-4 justify-center mb-3 md:mb-6">
      <div className="flex items-center gap-1 md:gap-2 bg-secondary/30 px-2 md:px-4 py-1 md:py-2 rounded-full text-[10px] md:text-sm">
        <Users className="w-3 h-3 md:w-4 md:h-4 text-primary" />
        <span className="font-bold">{students.length}</span>
        <span className="text-muted-foreground hidden md:inline">total</span>
      </div>
      <div className="flex items-center gap-1 md:gap-2 bg-green-500/10 px-2 md:px-4 py-1 md:py-2 rounded-full text-[10px] md:text-sm">
        <User className="w-3 h-3 md:w-4 md:h-4 text-green-500" />
        <span className="font-bold text-green-500">{playing}</span>
        <span className="text-muted-foreground hidden md:inline">active</span>
      </div>
      <div className="flex items-center gap-1 md:gap-2 bg-blue-500/10 px-2 md:px-4 py-1 md:py-2 rounded-full text-[10px] md:text-sm">
        <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4 text-blue-500" />
        <span className="font-bold text-blue-500">{submittedCount}</span>
        <span className="text-muted-foreground hidden md:inline">answered</span>
      </div>
      {blocked > 0 && (
        <div className="flex items-center gap-1 md:gap-2 bg-destructive/10 px-2 md:px-4 py-1 md:py-2 rounded-full text-[10px] md:text-sm animate-pulse">
          <Ban className="w-3 h-3 md:w-4 md:h-4 text-destructive" />
          <span className="font-bold text-destructive">{blocked}</span>
          <span className="text-muted-foreground hidden md:inline">blocked</span>
        </div>
      )}
      {finished > 0 && (
        <div className="flex items-center gap-1 md:gap-2 bg-blue-500/10 px-2 md:px-4 py-1 md:py-2 rounded-full text-[10px] md:text-sm">
          <span className="font-bold text-blue-500">{finished}</span>
          <span className="text-muted-foreground hidden md:inline">done</span>
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
  const currentQuestionIdRef = useRef<string | null>(null);
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
              title: p.status === 'blocked' ? 'Student Blocked' : 'Malpractice Warning',
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
    if (!currentQuestion || !quiz.question_start_at) return;
    const start = typeof quiz.question_start_at === 'number' ? quiz.question_start_at : Date.now();
    const limit = currentQuestion.timer * 1000;
    const end = start + limit;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, [currentQuestion, quiz.current_question_index, quiz.question_start_at]);

  // Restore student's existing answer on mount or question change
  useEffect(() => {
    setSelectedAnswer(null);
    setHasAnswered(false);
    if (isTeacher || !currentQuestion || !user || !firestore) return;
    const subDocRef = doc(firestore, 'quizzes', quiz.id, 'questions', currentQuestion.id, 'submissions', user.id);
    getDoc(subDocRef).then(snap => {
      if (snap.exists()) {
        const data = snap.data() as { selected_option: number };
        setSelectedAnswer(data.selected_option);
        setHasAnswered(true);
      }
    }).catch(() => {});
  }, [quiz.current_question_index, isTeacher, currentQuestion?.id, user?.id, firestore, quiz.id]);

  useEffect(() => {
    if (!isTeacher || !firestore) return;
    const qId = currentQuestion?.id;
    if (!qId || !quiz.id) return;
    currentQuestionIdRef.current = qId;

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
    if (hasAnswered || submittingRef.current || isTeacher || !currentQuestion || !user || timeLeft === 0 || participant.status === 'blocked') return;
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
      // If Firestore rejects (e.g. duplicate submission already exists), don't reset
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

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-2 md:p-4 bg-background overflow-x-hidden">
      <AlertDialog open={showViolationWarning} onOpenChange={setShowViolationWarning}>
        <AlertDialogContent className="bg-destructive/10 border-destructive">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><ShieldAlert className="w-6 h-6 text-destructive" /> Tab Switch Detected!</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground">Fair play is mandatory. One more switch and you will be blocked from the arena.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogAction onClick={() => setShowViolationWarning(false)} className="bg-destructive text-white">RE-FOCUS</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isTeacher && <ParticipantStats participants={participants} teacherId={quiz.created_by} submittedCount={submittedCount} />}

      <Card className="w-full max-w-4xl border-primary/20 bg-card/50 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-primary/20"><Progress value={(timeLeft / currentQuestion.timer) * 100} className="h-full rounded-none" aria-label={`${timeLeft} seconds remaining`} /></div>
        <CardHeader className="pt-6 md:pt-12 pb-3 md:pb-6 px-3 md:px-6">
            <div className="flex justify-between items-center mb-1 md:mb-4">
                <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-primary/60">Phase {(quiz.current_question_index ?? 0) + 1} / {quiz.question_count ?? 0}</span>
                <span className={cn("font-mono text-lg md:text-3xl font-bold", timeLeft <= 5 ? "text-destructive animate-pulse" : "text-primary")} aria-live="polite" aria-atomic="true">{timeLeft}s</span>
            </div>
            <CardTitle className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-headline leading-snug md:leading-tight break-words whitespace-normal text-balance">{currentQuestion.text}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 md:space-y-6 pb-6 md:pb-12 px-3 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
            {currentQuestion.options.map((opt: string, i: number) => (
              <Button key={i} onClick={() => handleAnswerSubmit(i)} disabled={hasAnswered || isTeacher || timeLeft === 0 || participant.status === 'blocked'} variant={selectedAnswer === i ? 'default' : 'outline'} className={cn(
                  "h-auto min-h-[3rem] md:min-h-[4.5rem] text-sm md:text-base lg:text-lg font-medium border-2 whitespace-normal break-words touch-target text-left flex items-center gap-2 md:gap-3 px-2 md:px-4 py-2 md:py-3",
                  selectedAnswer === i ? "border-primary shadow-lg shadow-primary/20" : "border-border/50",
                  hasAnswered && selectedAnswer !== i && "opacity-40"
                )} aria-label={`Option ${String.fromCharCode(65 + i)}: ${opt}`}>
                <span className="shrink-0 flex items-center justify-center w-5 h-5 md:w-7 md:h-7 rounded-full bg-primary/10 text-[10px] md:text-xs font-mono font-bold text-primary" aria-hidden="true">{String.fromCharCode(65 + i)}</span>
                <span className="flex-1 leading-snug">{opt}</span>
              </Button>
            ))}
          </div>
          {isTeacher && (
            <div className="flex flex-col items-center pt-4 md:pt-8 gap-2">
              <Button onClick={handleNext} disabled={isAdvancing} size="lg" className="w-full md:w-auto h-12 md:h-16 px-6 md:px-12 text-base md:text-xl font-headline rounded-full shadow-2xl shadow-primary/30" aria-busy={isAdvancing}>
                {isAdvancing ? <Loader2 className="animate-spin mr-2" aria-hidden="true" /> : <ArrowRight className="mr-2" aria-hidden="true" />}
                {(quiz.current_question_index ?? 0) === (quiz.question_count ?? 0) - 1 ? 'REVEAL PODIUM' : 'EVALUATE & NEXT'}
              </Button>
              <p className="text-[10px] md:text-xs text-muted-foreground" aria-live="polite" aria-atomic="true">
                {submittedCount} / {studentCount} students answered
              </p>
            </div>
          )}
          {participant.status === 'blocked' && !isTeacher && (
             <div className="bg-destructive/10 border border-destructive/20 p-6 md:p-8 rounded-2xl text-center">
                <ShieldAlert className="w-10 h-10 md:w-12 md:h-12 text-destructive mx-auto mb-3 md:mb-4" />
                <h3 className="text-xl md:text-2xl font-black text-destructive uppercase">Disqualified</h3>
                <p className="text-sm md:text-base text-muted-foreground mt-2">Malpractice detected. Await Commander Amnesty.</p>
             </div>
          )}
        </CardContent>
      </Card>
      <LiveLeaderboard quizId={quiz.id} participants={participants} teacherId={quiz.created_by} currentUserId={user?.id || ''} />
    </div>
  );
}
