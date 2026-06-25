
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useFirestore, useCollection, updateDocumentNonBlocking, errorEmitter, FirestorePermissionError } from '@/firebase';
import { doc, collection, setDoc, getDoc, getDocs, writeBatch, query, orderBy } from 'firebase/firestore';
import type { Quiz, QuizParticipant, QuizQuestion } from '@/lib/types';
import { usePageFocusChange } from '@/hooks/usePageFocusChange';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Clock, Loader2, ArrowRight, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction } from '../ui/alert-dialog';

interface LiveQuizProps {
  quiz: Quiz;
  participant: QuizParticipant;
  isTeacher: boolean;
}

const LiveLeaderboard = ({ quizId }: { quizId: string }) => {
    const firestore = useFirestore();
    const participantsRef = useMemo(() => firestore ? collection(firestore, 'quizzes', quizId, 'participants') : null, [firestore, quizId]);
    const { data: participants } = useCollection<QuizParticipant>(participantsRef);
    const sortedParticipants = useMemo(() => participants ? [...participants].sort((a,b) => b.score - a.score) : [], [participants]);

    return (
        <Card className="w-full max-w-4xl mt-6 border-primary/20 bg-secondary/10">
            <CardHeader className="py-3">
              <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-primary/70">Live Standings</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap gap-4">
                    {sortedParticipants.filter(p => p.role === 'student').map(p => (
                        <div key={p.id} className={cn(
                          "flex items-center gap-3 p-2 rounded-lg border transition-all",
                          p.status === 'blocked' ? "bg-destructive/10 border-destructive/20 opacity-60" : "bg-secondary/40 border-border/50"
                        )}>
                            <Avatar className="h-8 w-8 border border-primary/20">
                              <AvatarFallback className="text-sm bg-background">{p.avatar}</AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold max-w-[100px] truncate">{p.name}</span>
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

export default function LiveQuiz({ quiz, participant, isTeacher }: LiveQuizProps) {
  const { user } = useAuth();
  const firestore = useFirestore();
  
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [showViolationWarning, setShowViolationWarning] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  const questionsQuery = useMemo(() => firestore ? query(collection(firestore, 'quizzes', quiz.id, 'questions'), orderBy('index')) : null, [firestore, quiz.id]);
  const { data: questions, isLoading: isLoadingQuestions } = useCollection<QuizQuestion>(questionsQuery);

  const currentQuestion = useMemo(() => {
    if (!questions || quiz.currentQuestionIndex < 0) return null;
    return questions[quiz.currentQuestionIndex];
  }, [questions, quiz.currentQuestionIndex]);

  useEffect(() => {
    if (!currentQuestion || !quiz.questionStartAt) return;
    
    const start = typeof quiz.questionStartAt === 'number' 
        ? quiz.questionStartAt 
        : (quiz.questionStartAt as any)?.toMillis?.() || Date.now();
    
    const limit = currentQuestion.timer * 1000;
    const end = start + limit;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, [currentQuestion, quiz.questionStartAt]);

  useEffect(() => {
    setSelectedAnswer(null);
    setHasAnswered(false);
  }, [quiz.currentQuestionIndex]);

  const onMalpractice = useCallback(() => {
    if (isTeacher || !firestore || !user || participant.status === 'blocked' || quiz.status !== 'live') return;
    
    const newCount = (participant.violationsCount || 0) + 1;
    const pRef = doc(firestore, 'quizzes', quiz.id, 'participants', user.id);
    
    updateDocumentNonBlocking(pRef, { 
      violationsCount: newCount, 
      status: newCount >= 2 ? 'blocked' : participant.status 
    });
    
    if (newCount < 2) {
      setShowViolationWarning(true);
    }
  }, [isTeacher, firestore, user, quiz.id, quiz.status, participant]);

  usePageFocusChange(onMalpractice, quiz.status === 'live' && !isTeacher);

  const handleAnswerSubmit = (idx: number) => {
    if (hasAnswered || isTeacher || !currentQuestion || !user || !firestore || timeLeft === 0 || participant.status === 'blocked') return;
    
    setHasAnswered(true);
    setSelectedAnswer(idx);
    
    const subRef = doc(firestore, `quizzes/${quiz.id}/questions/${currentQuestion.id}/submissions`, user.id);
    const subData = { selectedOption: idx, submittedAt: Date.now() };
    
    setDoc(subRef, subData).catch(err => {
      setHasAnswered(false);
      errorEmitter.emit('permission-error', new FirestorePermissionError({ 
        path: subRef.path, 
        operation: 'create', 
        requestResourceData: subData 
      }));
    });
  };

  const evaluateQuestion = async () => {
    if (!isTeacher || !firestore || !currentQuestion) return;
    setIsScoring(true);
    try {
      const keySnap = await getDoc(doc(firestore, `quizzes/${quiz.id}/answerKeys`, currentQuestion.id));
      if (!keySnap.exists()) throw new Error('No answer key found');
      
      const correctIdx = keySnap.data().correctOptionIndex;
      const start = typeof quiz.questionStartAt === 'number' 
        ? quiz.questionStartAt 
        : (quiz.questionStartAt as any)?.toMillis?.() || Date.now();
      
      const partsSnap = await getDocs(collection(firestore, `quizzes/${quiz.id}/participants`));
      const batch = writeBatch(firestore);

      for (const pDoc of partsSnap.docs) {
        const pData = pDoc.data() as QuizParticipant;
        if (pData.role === 'teacher' || pData.status === 'blocked') continue;
        
        const subSnap = await getDoc(doc(firestore, `quizzes/${quiz.id}/questions/${currentQuestion.id}/submissions`, pDoc.id));
        if (subSnap.exists() && subSnap.data().selectedOption === correctIdx) {
          const timeUsed = subSnap.data().submittedAt - start;
          const score = 500 + Math.max(0, Math.floor((1 - timeUsed / (currentQuestion.timer * 1000)) * 500));
          batch.update(pDoc.ref, { score: (pData.score || 0) + score });
        }
      }
      await batch.commit();
    } catch (e) {
      console.error("Evaluation error:", e);
    } finally {
      setIsScoring(false);
    }
  };

  const handleNext = async () => {
    if (!isTeacher || !firestore || isScoring) return;
    
    await evaluateQuestion();
    
    const nextIdx = quiz.currentQuestionIndex + 1;
    const qRef = doc(firestore, 'quizzes', quiz.id);
    
    if (nextIdx < quiz.questionCount) {
      updateDocumentNonBlocking(qRef, { 
        currentQuestionIndex: nextIdx, 
        questionStartAt: Date.now() 
      });
    } else {
      updateDocumentNonBlocking(qRef, { status: 'finished' });
    }
  };

  if (isLoadingQuestions) return <div className="flex h-screen items-center justify-center bg-background"><Loader2 className="animate-spin h-12 w-12 text-primary" /></div>;
  if (!currentQuestion) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <AlertDialog open={showViolationWarning} onOpenChange={setShowViolationWarning}>
        <AlertDialogContent className="bg-destructive/10 border-destructive text-destructive-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-6 h-6" />
              Malpractice Warning!
            </AlertDialogTitle>
            <AlertDialogDescription className="text-foreground">
              You switched tabs or lost focus. Fair play is mandatory in the arena. One more violation and you will be blocked from the battle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogAction onClick={() => setShowViolationWarning(false)} className="bg-destructive hover:bg-destructive/90 text-white">I Promise to stay focused</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="w-full max-w-4xl border-primary/20 shadow-2xl bg-card/50 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-primary/20">
           <Progress value={(timeLeft / currentQuestion.timer) * 100} className="h-full rounded-none transition-all duration-300" />
        </div>
        <CardHeader className="pt-10">
          <div className="flex justify-between items-center mb-6">
            <span className="text-xs font-black uppercase tracking-[0.3em] text-primary/80">Round {quiz.currentQuestionIndex + 1} of {quiz.questionCount}</span>
            <div className={cn(
              "flex items-center gap-2 font-mono text-3xl transition-colors",
              timeLeft <= 5 ? "text-destructive animate-pulse" : "text-primary"
            )}>
              <Clock className="w-7 h-7" />
              {timeLeft}s
            </div>
          </div>
          <CardTitle className="text-3xl md:text-4xl text-center font-headline leading-tight py-6">{currentQuestion.text}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8 pb-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {currentQuestion.options.map((opt, i) => (
              <Button
                key={i}
                onClick={() => handleAnswerSubmit(i)}
                disabled={hasAnswered || isTeacher || timeLeft === 0 || participant.status === 'blocked'}
                variant={selectedAnswer === i ? 'default' : 'outline'}
                className={cn(
                  "h-24 text-xl font-medium transition-all relative group overflow-hidden border-2",
                  selectedAnswer === i ? "border-primary shadow-lg shadow-primary/20" : "border-border/50 hover:border-primary/50",
                  hasAnswered && selectedAnswer !== i && "opacity-40 grayscale-[0.5]"
                )}
              >
                <span className="absolute left-4 bg-background/50 px-3 py-1 rounded-md font-mono text-sm border border-border group-hover:border-primary/50 transition-colors">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="ml-8">{opt}</span>
              </Button>
            ))}
          </div>
          
          {isTeacher && (
            <div className="flex justify-center pt-6">
              <Button onClick={handleNext} disabled={isScoring} size="lg" className="px-12 h-16 text-xl rounded-full shadow-xl shadow-primary/30 transition-transform hover:scale-105">
                {isScoring ? <Loader2 className="animate-spin mr-2" /> : <ArrowRight className="mr-2" />}
                {quiz.currentQuestionIndex === quiz.questionCount - 1 ? 'End Quiz & Show Results' : 'Score & Next Round'}
              </Button>
            </div>
          )}
          
          {participant.status === 'blocked' && !isTeacher && (
             <div className="bg-destructive/10 border border-destructive/20 p-6 rounded-xl text-center space-y-2">
                <ShieldAlert className="w-10 h-10 text-destructive mx-auto" />
                <h3 className="text-xl font-bold text-destructive">BATTLE BLOCKED</h3>
                <p className="text-sm text-muted-foreground">Malpractice detected. You are disqualified from this round. Contact the Commander for amnesty.</p>
             </div>
          )}
        </CardContent>
      </Card>
      
      <LiveLeaderboard quizId={quiz.id} />
    </div>
  );
}
