'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Quiz, QuizParticipant } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Clock, Loader2, ArrowRight, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction } from '../ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { quizService } from '@/services/quiz.service';
import { questionService } from '@/services/game.service';
import { participantService } from '@/services/participant.service';
import { submissionService } from '@/services/game.service';
import { usePageFocusChange } from '@/hooks/usePageFocusChange';
import type { ValidatedParticipant } from '@/lib/schemas';

const LiveLeaderboard = ({ quizId, participants, teacherId }: { quizId: string, participants: ValidatedParticipant[], teacherId: string }) => {
    const sortedParticipants = useMemo(() => [...participants].sort((a,b) => b.score - a.score), [participants]);

    return (
        <Card className="w-full max-w-4xl mt-6 border-primary/20 bg-secondary/10">
            <CardHeader className="py-3"><CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-primary/70">Live Standings</CardTitle></CardHeader>
            <CardContent>
                <div className="flex flex-wrap gap-4">
                    {sortedParticipants.filter(p => p.user_id !== teacherId).map(p => (
                        <div key={p.user_id} className={cn(
                          "flex items-center gap-3 p-2 rounded-lg border transition-all",
                          p.status === 'blocked' ? "bg-destructive/10 border-destructive/20 opacity-60" : "bg-secondary/40 border-border/50"
                        )}>
                            <Avatar className="h-8 w-8 border border-primary/20">
                                <AvatarFallback className="text-sm bg-background">🎮</AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold max-w-[100px] truncate">{p.user_id.slice(0, 8)}</span>
                                <span className={cn('text-xs font-mono font-bold', p.status === 'blocked' ? 'text-destructive' : 'text-primary')}>
                                  {p.status === 'blocked' ? 'BLOCKED' : `${p.score} PTS`}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};

export default function LiveQuiz({ quiz, participant, isTeacher, allParticipants }: { quiz: Quiz, participant: QuizParticipant, isTeacher: boolean, allParticipants: ValidatedParticipant[] }) {
  const { user } = useAuth();

  const [questions, setQuestions] = useState<any[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);
  const [participants, setParticipants] = useState<ValidatedParticipant[]>(allParticipants || []);

  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [showViolationWarning, setShowViolationWarning] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    let sub: any;
    const init = async () => {
      try {
        const qs = await questionService.getQuestionsByQuizId(quiz.id);
        setQuestions(qs);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoadingQuestions(false);
      }
      sub = questionService.subscribeToQuestions(quiz.id, setQuestions);
    };
    init();
    return () => { sub?.unsubscribe?.(); };
  }, [quiz.id]);

  useEffect(() => {
    let sub: any;
    participantService.getAllParticipants(quiz.id)
      .then(setParticipants)
      .catch(console.error);
    sub = participantService.subscribeToParticipants(quiz.id, setParticipants);
    return () => { sub?.unsubscribe?.(); };
  }, [quiz.id]);

  const currentQuestion = useMemo(() => {
    if (!questions.length || quiz.currentQuestionIndex < 0) return null;
    return questions[quiz.currentQuestionIndex];
  }, [questions, quiz.currentQuestionIndex]);

  useEffect(() => {
    if (!currentQuestion || !quiz.questionStartAt) return;
    const start = typeof quiz.questionStartAt === 'number' ? quiz.questionStartAt : new Date(quiz.questionStartAt).getTime();
    const limit = currentQuestion.timer * 1000;
    const end = start + limit;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, [currentQuestion, quiz.currentQuestionIndex, quiz.questionStartAt]);

  useEffect(() => {
    setSelectedAnswer(null);
    setHasAnswered(false);
  }, [quiz.currentQuestionIndex]);

  const onMalpractice = useCallback(async () => {
    if (isTeacher || !user || participant.status === 'blocked' || quiz.status !== 'live') return;
    const newCount = (participant.violationsCount || 0) + 1;
    try {
      await participantService.updateParticipant(quiz.id, user.id, {
        violations_count: newCount,
        status: newCount >= 2 ? 'blocked' : 'playing'
      });
      if (newCount < 2) setShowViolationWarning(true);
    } catch (e) {
      console.error(e);
    }
  }, [isTeacher, user, quiz.id, quiz.status, participant]);

  usePageFocusChange(onMalpractice, quiz.status === 'live' && !isTeacher);

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
    } catch (e) {
      setHasAnswered(false);
      console.error(e);
    }
  };

  const evaluateQuestion = async () => {
    if (!isTeacher || !currentQuestion) return;
    setIsScoring(true);
    try {
      const startTime = typeof quiz.questionStartAt === 'number' ? quiz.questionStartAt : new Date(quiz.questionStartAt).getTime();
      await questionService.evaluateQuestion(quiz.id, currentQuestion.id, startTime);
    } catch (e) { console.error(e); } finally { setIsScoring(false); }
  };

  const handleNext = async () => {
    if (!isTeacher || isScoring) return;
    await evaluateQuestion();
    const nextIdx = quiz.currentQuestionIndex + 1;
    if (nextIdx < quiz.questionCount) {
      await quizService.advanceToQuestion(quiz.id, nextIdx);
    } else {
      await quizService.updateQuizStatus(quiz.id, 'finished');
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

      <Card className="w-full max-w-4xl border-primary/20 bg-card/50 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-primary/20"><Progress value={(timeLeft / currentQuestion.timer) * 100} className="h-full rounded-none" /></div>
        <CardHeader className="pt-12 text-center">
            <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">Phase {quiz.currentQuestionIndex + 1} / {quiz.questionCount}</span>
                <span className={cn("font-mono text-3xl", timeLeft <= 5 ? "text-destructive animate-pulse" : "text-primary")}>{timeLeft}s</span>
            </div>
            <CardTitle className="text-3xl md:text-5xl font-headline py-6 leading-tight">{currentQuestion.text}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8 pb-12 px-8">
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
                {quiz.currentQuestionIndex === quiz.questionCount - 1 ? 'REVEAL PODIUM' : 'EVALUATE & NEXT'}
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
      <LiveLeaderboard quizId={quiz.id} participants={participants} teacherId={quiz.createdBy} />
    </div>
  );
}
