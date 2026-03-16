
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useFirestore, useCollection, updateDocumentNonBlocking, errorEmitter, FirestorePermissionError } from '@/firebase';
import { doc, collection, serverTimestamp, setDoc, getDoc, getDocs, writeBatch, query, orderBy } from 'firebase/firestore';
import type { Quiz, QuizParticipant, QuizQuestion, QuizSubmission } from '@/lib/types';
import { usePageFocusChange } from '@/hooks/usePageFocusChange';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Clock, Loader2, ArrowRight, Shield } from 'lucide-react';
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
        <Card className="w-full max-w-4xl mt-4">
            <CardHeader><CardTitle>Leaderboard</CardTitle></CardHeader>
            <CardContent>
                <div className="flex flex-wrap gap-4">
                    {sortedParticipants.map(p => (
                        <div key={p.id} className="flex items-center gap-3 p-2 rounded-md bg-secondary">
                            <Avatar className="h-8 w-8"><AvatarFallback className="text-sm">{p.avatar}</AvatarFallback></Avatar>
                            <div className="flex flex-col">
                                <span className="text-sm font-medium max-w-20 truncate">{p.name}</span>
                                <span className='text-xs text-primary'>{p.score} pts</span>
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
  const { toast } = useToast();
  
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [showViolationWarning, setShowViolationWarning] = useState(false);
  const [isScoring, setIsScoring] = useState(false);

  const questionsQuery = useMemo(() => firestore ? query(collection(firestore, 'quizzes', quiz.id, 'questions'), orderBy('index')) : null, [firestore, quiz.id]);
  const { data: questions, isLoading: isLoadingQuestions } = useCollection<QuizQuestion>(questionsQuery);

  const currentQuestion = useMemo(() => {
    if (!questions || quiz.currentQuestionIndex < 0) return null;
    return questions[quiz.currentQuestionIndex];
  }, [questions, quiz.currentQuestionIndex]);

  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!currentQuestion || !quiz.questionStartAt) return;
    const start = typeof quiz.questionStartAt === 'number' ? quiz.questionStartAt : (quiz.questionStartAt as any).toMillis?.() || Date.now();
    const limit = currentQuestion.timer * 1000;
    const end = start + limit;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 500);
    return () => clearInterval(interval);
  }, [currentQuestion, quiz.questionStartAt]);

  useEffect(() => {
    setSelectedAnswer(null);
    setHasAnswered(false);
  }, [quiz.currentQuestionIndex]);

  const onMalpractice = useCallback(() => {
    if (isTeacher || !firestore || !user || participant.status === 'blocked') return;
    const newCount = (participant.violationsCount || 0) + 1;
    const pRef = doc(firestore, 'quizzes', quiz.id, 'participants', user.id);
    updateDocumentNonBlocking(pRef, { violationsCount: newCount, status: newCount >= 2 ? 'blocked' : participant.status });
    setShowViolationWarning(true);
  }, [isTeacher, firestore, user, quiz.id, participant]);

  usePageFocusChange(onMalpractice, quiz.status === 'live' && !isTeacher);

  const handleAnswerSubmit = async (idx: number) => {
    if (hasAnswered || isTeacher || !currentQuestion || !user || !firestore) return;
    setHasAnswered(true);
    setSelectedAnswer(idx);
    const subRef = doc(firestore, `quizzes/${quiz.id}/questions/${currentQuestion.id}/submissions/${user.id}`);
    const subData = { selectedOption: idx, submittedAt: Date.now() };
    setDoc(subRef, subData).catch(err => {
      setHasAnswered(false);
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: subRef.path, operation: 'create', requestResourceData: subData }));
    });
  };

  const evaluateQuestion = async () => {
    if (!isTeacher || !firestore || !currentQuestion) return;
    setIsScoring(true);
    try {
      const keySnap = await getDoc(doc(firestore, `quizzes/${quiz.id}/answerKeys`, currentQuestion.id));
      if (!keySnap.exists()) throw new Error('No answer key');
      const correctIdx = keySnap.data().correctOptionIndex;
      const start = typeof quiz.questionStartAt === 'number' ? quiz.questionStartAt : (quiz.questionStartAt as any).toMillis?.() || Date.now();
      
      const partsSnap = await getDocs(collection(firestore, `quizzes/${quiz.id}/participants`));
      const batch = writeBatch(firestore);

      for (const pDoc of partsSnap.docs) {
        if (pDoc.data().role === 'teacher') continue;
        const subSnap = await getDoc(doc(firestore, `quizzes/${quiz.id}/questions/${currentQuestion.id}/submissions`, pDoc.id));
        if (subSnap.exists() && subSnap.data().selectedOption === correctIdx) {
          const timeUsed = subSnap.data().submittedAt - start;
          const score = 500 + Math.max(0, Math.floor((1 - timeUsed / (currentQuestion.timer * 1000)) * 500));
          batch.update(pDoc.ref, { score: (pDoc.data().score || 0) + score });
        }
      }
      await batch.commit();
    } catch (e) {
      console.error(e);
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
      updateDocumentNonBlocking(qRef, { currentQuestionIndex: nextIdx, questionStartAt: Date.now() });
    } else {
      updateDocumentNonBlocking(qRef, { status: 'finished' });
    }
  };

  if (isLoadingQuestions) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin h-12 w-12" /></div>;
  if (!currentQuestion) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <AlertDialog open={showViolationWarning} onOpenChange={setShowViolationWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Focus Lost!</AlertDialogTitle>
            <AlertDialogDescription>You left the quiz tab. Stay focused or you will be blocked.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogAction onClick={() => setShowViolationWarning(false)}>Understood</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="w-full max-w-4xl border-primary/20 shadow-xl">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>{quiz.title}</CardTitle>
            <div className="flex items-center gap-2 font-mono text-xl"><Clock className="w-5 h-5" />{timeLeft}s</div>
          </div>
          <Progress value={(timeLeft / currentQuestion.timer) * 100} className="h-2 mt-2" />
          <CardDescription>Question {quiz.currentQuestionIndex + 1} of {quiz.questionCount}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-2xl text-center py-4">{currentQuestion.text}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentQuestion.options.map((opt, i) => (
              <Button
                key={i}
                onClick={() => handleAnswerSubmit(i)}
                disabled={hasAnswered || isTeacher || timeLeft === 0}
                variant={selectedAnswer === i ? 'default' : 'secondary'}
                className={cn("h-16 text-lg", hasAnswered && selectedAnswer !== i && "opacity-50")}
              >
                {String.fromCharCode(65 + i)}. {opt}
              </Button>
            ))}
          </div>
          {isTeacher && (
            <div className="flex justify-end pt-4">
              <Button onClick={handleNext} disabled={isScoring}>
                {isScoring ? <Loader2 className="animate-spin mr-2" /> : <ArrowRight className="mr-2" />}
                {quiz.currentQuestionIndex === quiz.questionCount - 1 ? 'Finish' : 'Next'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      {isTeacher && <LiveLeaderboard quizId={quiz.id} />}
    </div>
  );
}
