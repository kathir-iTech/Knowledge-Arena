'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ValidatedQuiz, ValidatedParticipant } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Clock, Loader2, ArrowRight, ShieldAlert, User, Users, Ban, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction } from '../ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { quizService } from '@/services/quiz.service';
import { questionService } from '@/services/game.service';
import { participantService } from '@/services/participant.service';
import { submissionService } from '@/services/game.service';
import { usePageFocusChange } from '@/hooks/usePageFocusChange';
import { useToast } from '@/hooks/use-toast';
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
        <Card className="w-full max-w-4xl mt-6 border-primary/20 bg-secondary/10">
            <CardHeader className="py-3">
              <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-primary/70">Standings ({total})</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap gap-4">
                    {sortedParticipants.filter(p => p.user_id !== teacherId).map((p, idx) => {
                      const rank = idx + 1;
                      const percentile = total > 0 ? Math.round(((total - rank) / total) * 100) : 0;
                      const isSelf = p.user_id === currentUserId;
                      return (
                        <div key={p.user_id} className={cn(
                          "flex items-center gap-3 p-2 rounded-lg border transition-all relative",
                          isSelf ? "bg-primary/15 border-primary/40 ring-1 ring-primary/30" : "",
                          p.status === 'blocked' ? "bg-destructive/10 border-destructive/20 opacity-60" : "bg-secondary/40 border-border/50"
                        )}>
                            <div className="relative">
                              <Avatar className="h-8 w-8 border border-primary/20">
                                  <AvatarFallback className="text-sm bg-background">{p.avatar || '🎮'}</AvatarFallback>
                              </Avatar>
                              <span className="absolute -bottom-1 -right-1 text-[8px] font-black bg-background border border-border rounded-full w-4 h-4 flex items-center justify-center">{rank}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold max-w-[80px] truncate">{isSelf ? 'You' : p.name || p.user_id.slice(0, 8)}</span>
                                <span className={cn('text-xs font-mono font-bold', p.status === 'blocked' ? 'text-destructive' : 'text-primary')}>
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

const ParticipantStats = ({ participants, teacherId }: { participants: ValidatedParticipant[], teacherId: string }) => {
  const students = participants.filter(p => p.user_id !== teacherId);
  const playing = students.filter(p => p.status === 'playing').length;
  const blocked = students.filter(p => p.status === 'blocked').length;
  const finished = students.filter(p => p.status === 'finished').length;

  return (
    <div className="flex flex-wrap gap-4 justify-center mb-6">
      <div className="flex items-center gap-2 bg-secondary/30 px-4 py-2 rounded-full text-sm">
        <Users className="w-4 h-4 text-primary" />
        <span className="font-bold">{students.length}</span>
        <span className="text-muted-foreground">total</span>
      </div>
      <div className="flex items-center gap-2 bg-green-500/10 px-4 py-2 rounded-full text-sm">
        <User className="w-4 h-4 text-green-500" />
        <span className="font-bold text-green-500">{playing}</span>
        <span className="text-muted-foreground">active</span>
      </div>
      {blocked > 0 && (
        <div className="flex items-center gap-2 bg-destructive/10 px-4 py-2 rounded-full text-sm animate-pulse">
          <Ban className="w-4 h-4 text-destructive" />
          <span className="font-bold text-destructive">{blocked}</span>
          <span className="text-muted-foreground">blocked</span>
        </div>
      )}
      {finished > 0 && (
        <div className="flex items-center gap-2 bg-blue-500/10 px-4 py-2 rounded-full text-sm">
          <span className="font-bold text-blue-500">{finished}</span>
          <span className="text-muted-foreground">finished</span>
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
  const [isScoring, setIsScoring] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const lastViolationRef = useRef(0);
  const prevViolationsRef = useRef<Record<string, number>>({});

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
    questionService.getQuestionsByQuizId(quiz.id)
      .then(qs => { if (mounted) setQuestions(qs); })
      .catch(() => { if (mounted) toast({ variant: 'destructive', title: 'Error', description: 'Failed to load questions. Please refresh.' }); })
      .finally(() => { if (mounted) setIsLoadingQuestions(false); });
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
              title: p.status === 'blocked' ? 'Student Blocked' : 'Malpractice Warning',
              description: `${p.name || p.user_id.slice(0, 8)} — Violation #${curr} (${new Date().toLocaleTimeString()})`,
              variant: p.status === 'blocked' ? 'destructive' : 'default',
            });
          }
          prevViolationsRef.current[p.user_id] = curr;
        });
      }
    });
    participantService.getAllParticipants(quiz.id)
      .then(parts => { if (mounted) setParticipants(parts); })
      .catch(() => { if (mounted) toast({ variant: 'destructive', title: 'Error', description: 'Failed to load participants.' }); });
    return () => { mounted = false; pSub(); };
  }, [quiz.id, toast, isTeacher, quiz.created_by]);

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

  useEffect(() => {
    setSelectedAnswer(null);
    setHasAnswered(false);
  }, [quiz.current_question_index]);

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
    if (hasAnswered || isTeacher || !currentQuestion || !user || timeLeft === 0 || participant.status === 'blocked') return;
    setHasAnswered(true);
    setSelectedAnswer(idx);
    try {
      await submissionService.submitAnswer({
        quiz_id: quiz.id,
        question_id: currentQuestion.id,
        user_id: user.id,
        selected_option: idx
      });
    } catch {
      setHasAnswered(false);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to submit answer. Please try again.' });
    }
  };

  const evaluateQuestion = async () => {
    if (!isTeacher || !currentQuestion) return;
    setIsScoring(true);
    try {
      const startTime = typeof quiz.question_start_at === 'number' ? quiz.question_start_at : Date.now();
      await questionService.evaluateQuestion(quiz.id, currentQuestion.id, startTime);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Scoring failed.' });
    } finally { setIsScoring(false); }
  };

  const handleNext = async () => {
    if (!isTeacher || isScoring) return;
    try {
      await evaluateQuestion();
      const nextIdx = (quiz.current_question_index ?? 0) + 1;
      if (nextIdx < (quiz.question_count ?? 0)) {
        await quizService.advanceToQuestion(quiz.id, nextIdx);
      } else {
        await quizService.updateQuizStatus(quiz.id, 'finished');
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to advance. Please try again.' });
    }
  };

  if (isLoadingQuestions) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-primary h-12 w-12" /></div>;
  if (!currentQuestion) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <AlertDialog open={showViolationWarning} onOpenChange={setShowViolationWarning}>
        <AlertDialogContent className="bg-destructive/10 border-destructive">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><ShieldAlert className="w-6 h-6 text-destructive" /> Tab Switch Detected!</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground">Fair play is mandatory. One more switch and you will be blocked from the arena.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogAction onClick={() => setShowViolationWarning(false)} className="bg-destructive text-white">RE-FOCUS</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isTeacher && <ParticipantStats participants={participants} teacherId={quiz.created_by} />}

      <Card className="w-full max-w-4xl border-primary/20 bg-card/50 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-primary/20"><Progress value={(timeLeft / currentQuestion.timer) * 100} className="h-full rounded-none" /></div>
        <CardHeader className="pt-12 text-center">
            <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">Phase {(quiz.current_question_index ?? 0) + 1} / {quiz.question_count ?? 0}</span>
                <span className={cn("font-mono text-3xl", timeLeft <= 5 ? "text-destructive animate-pulse" : "text-primary")}>{timeLeft}s</span>
            </div>
            <CardTitle className="text-xl md:text-3xl lg:text-5xl font-headline py-4 md:py-6 leading-tight">{currentQuestion.text}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8 pb-12 px-4 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentQuestion.options.map((opt: string, i: number) => (
              <Button key={i} onClick={() => handleAnswerSubmit(i)} disabled={hasAnswered || isTeacher || timeLeft === 0 || participant.status === 'blocked'} variant={selectedAnswer === i ? 'default' : 'outline'} className={cn(
                  "h-24 text-xl font-medium relative group border-2",
                  selectedAnswer === i ? "border-primary shadow-lg shadow-primary/20" : "border-border/50",
                  hasAnswered && selectedAnswer !== i && "opacity-40"
                )}>
                <span className="absolute left-4 opacity-50 font-mono text-xs">{String.fromCharCode(65 + i)}</span>
                {opt}
              </Button>
            ))}
          </div>
          {isTeacher && (
            <div className="flex justify-center pt-8">
              <Button onClick={handleNext} disabled={isScoring} size="lg" className="h-16 px-12 text-xl font-headline rounded-full shadow-2xl shadow-primary/30">
                {isScoring ? <Loader2 className="animate-spin mr-2" /> : <ArrowRight className="mr-2" />}
                {(quiz.current_question_index ?? 0) === (quiz.question_count ?? 0) - 1 ? 'REVEAL PODIUM' : 'EVALUATE & NEXT'}
              </Button>
            </div>
          )}
          {participant.status === 'blocked' && !isTeacher && (
             <div className="bg-destructive/10 border border-destructive/20 p-8 rounded-2xl text-center">
                <ShieldAlert className="w-12 h-12 text-destructive mx-auto mb-4" />
                <h3 className="text-2xl font-black text-destructive uppercase">Disqualified</h3>
                <p className="text-muted-foreground mt-2">Malpractice detected. Await Commander Amnesty.</p>
             </div>
          )}
        </CardContent>
      </Card>
      <LiveLeaderboard quizId={quiz.id} participants={participants} teacherId={quiz.created_by} currentUserId={user?.id || ''} />
    </div>
  );
}
