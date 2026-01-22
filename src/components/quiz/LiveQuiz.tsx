
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useFirestore, useCollection, updateDocumentNonBlocking, FirestorePermissionError, errorEmitter } from '@/firebase';
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
    const participantsRef = useMemo(() => {
        if (!firestore) return null;
        return collection(firestore, 'quizzes', quizId, 'participants');
    }, [firestore, quizId]);

    const { data: participants } = useCollection<QuizParticipant>(participantsRef);
    
    const sortedParticipants = useMemo(() => {
        if (!participants) return [];
        return [...participants].sort((a,b) => b.score - a.score);
    }, [participants]);

    return (
        <Card className="w-full max-w-4xl mt-4">
            <CardHeader>
                <CardTitle>Live Leaderboard</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap gap-4">
                    {sortedParticipants.map(p => (
                        <div key={p.id} className="flex items-center gap-3 p-2 rounded-md bg-secondary">
                            <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-sm bg-muted">{p.avatar}</AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                                <span className="text-sm font-medium max-w-20 truncate">{p.name}</span>
                                <span className='text-xs text-primary font-mono'>{p.score} pts</span>
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

  const questionStartTimeMs = useMemo(() => {
    if (!quiz.questionStartAt) return 0;
    // The object from Firestore might not have the toMillis method if it's already a number
    // This handles both server Timestamps and client-side numbers (from older data)
    const startAt = quiz.questionStartAt as any;
    if (startAt && typeof startAt.toMillis === 'function') {
        return startAt.toMillis();
    }
    // Fallback for unexpected data types, like a simple number.
    if (typeof startAt === 'number') {
        return startAt;
    }
    return Date.now(); // Should not be reached in normal flow
  }, [quiz.questionStartAt]);


  // --- Data Fetching ---
  const questionsQuery = useMemo(() => {
      if (!firestore) return null;
      return query(collection(firestore, 'quizzes', quiz.id, 'questions'), orderBy('index'));
  }, [firestore, quiz.id]);
  const { data: questions, isLoading: isLoadingQuestions } = useCollection<QuizQuestion>(questionsQuery);

  const currentQuestion = useMemo(() => {
    if (!questions || quiz.currentQuestionIndex < 0 || quiz.currentQuestionIndex >= questions.length) return null;
    return questions[quiz.currentQuestionIndex];
  }, [questions, quiz.currentQuestionIndex]);

  // --- Timer Logic ---
  const [timeLeft, setTimeLeft] = useState(currentQuestion?.timer || quiz.timeLimit || 0);

  useEffect(() => {
    if (quiz.status !== 'live' || !currentQuestion || !quiz.questionStartAt) return;

    const serverStartTime = questionStartTimeMs;
    const timeLimit = (currentQuestion.timer || 30) * 1000;
    const endTime = serverStartTime + timeLimit;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, endTime - now);
      setTimeLeft(Math.ceil(remaining / 1000));
    };

    const timerId = setInterval(updateTimer, 500);
    updateTimer(); // Initial call

    return () => clearInterval(timerId);
  }, [currentQuestion, quiz.questionStartAt, quiz.status, questionStartTimeMs]);


  // --- State Reset on Question Change ---
  useEffect(() => {
    setSelectedAnswer(null);
    setHasAnswered(false);
  }, [currentQuestion]);
  
  // --- Actions ---

  const onMalpractice = useCallback(() => {
    if (isTeacher || !firestore || !user || participant.status === 'blocked') return;
    
    setShowViolationWarning(true);

    const participantRef = doc(firestore, 'quizzes', quiz.id, 'participants', user.id);
    const newViolationsCount = (participant.violationsCount || 0) + 1;
    
    const updateData: { violationsCount: number; status?: 'blocked' } = {
        violationsCount: newViolationsCount
    };

    if (newViolationsCount >= 2) {
        updateData.status = 'blocked';
    }
    
    updateDocumentNonBlocking(participantRef, updateData);

  }, [isTeacher, firestore, user, quiz.id, participant]);

  usePageFocusChange(onMalpractice, quiz.status === 'live' && !isTeacher);

  const handleAnswerSubmit = async (answerIndex: number) => {
    if (hasAnswered || isTeacher || !currentQuestion || !user || !firestore) return;
    
    setHasAnswered(true);
    setSelectedAnswer(answerIndex);

    const submissionRef = doc(firestore, `quizzes/${quiz.id}/questions/${currentQuestion.id}/submissions/${user.id}`);
    const submissionData: Omit<QuizSubmission, 'id'> = {
        selectedOption: answerIndex,
        submittedAt: Date.now(),
    };
    
    try {
        await setDoc(submissionRef, submissionData);
    } catch (error) {
        setHasAnswered(false); // Allow user to try again
        
        const permissionError = new FirestorePermissionError({
            path: submissionRef.path,
            operation: 'create',
            requestResourceData: submissionData
        });
        errorEmitter.emit('permission-error', permissionError);
    }
  };

  const evaluateCurrentQuestion = async () => {
    if (!isTeacher || !firestore || !questions || quiz.currentQuestionIndex < 0) return;

    setIsScoring(true);
    try {
      const questionIndex = quiz.currentQuestionIndex;
      const question = questions[questionIndex];
      const questionId = question.id;
      const questionStartTime = questionStartTimeMs;
      const questionTimeLimit = question.timer * 1000;

      const answerKeyRef = doc(firestore, `quizzes/${quiz.id}/answerKeys/${questionId}`);
      const answerKeySnap = await getDoc(answerKeyRef);
      if (!answerKeySnap.exists()) {
        throw new Error(`Answer key not found for question: ${questionId}`);
      }
      const correctAnswerIndex = answerKeySnap.data().correctOptionIndex;

      const participantsRef = collection(firestore, `quizzes/${quiz.id}/participants`);
      const participantsSnap = await getDocs(participantsRef);
      const students = participantsSnap.docs
        .map(d => ({ ...d.data(), id: d.id } as QuizParticipant))
        .filter(p => p.role === 'student');

      const batch = writeBatch(firestore);

      for (const student of students) {
        const submissionRef = doc(firestore, `quizzes/${quiz.id}/questions/${questionId}/submissions/${student.id}`);
        const submissionSnap = await getDoc(submissionRef);

        if (submissionSnap.exists()) {
          const submissionData = submissionSnap.data() as QuizSubmission;
          if (submissionData.selectedOption === correctAnswerIndex) {
            const timeTaken = submissionData.submittedAt - questionStartTime;
            let points = 0;
            if (timeTaken <= questionTimeLimit) {
              const basePoints = 500;
              const timeBonus = Math.floor((1 - timeTaken / questionTimeLimit) * 500);
              points = basePoints + timeBonus;
            }
            const participantRef = doc(firestore, `quizzes/${quiz.id}/participants/${student.id}`);
            const newScore = (student.score || 0) + points;
            batch.update(participantRef, { score: newScore });
          }
        }
      }

      await batch.commit();
      toast({ title: 'Question Evaluated', description: 'Scores have been updated.' });
    } catch (error: any) {
      console.error("Error evaluating question:", error);
      toast({ variant: 'destructive', title: 'Evaluation Failed', description: error.message });
    } finally {
      setIsScoring(false);
    }
  };
  
  const handleTeacherNextQuestion = async () => {
    if (!isTeacher || !firestore || !questions || isScoring) return;

    await evaluateCurrentQuestion();

    const nextIndex = quiz.currentQuestionIndex + 1;
    const quizRef = doc(firestore, 'quizzes', quiz.id);

    if (nextIndex < quiz.questionCount) {
      updateDocumentNonBlocking(quizRef, { 
        currentQuestionIndex: nextIndex,
        questionStartAt: serverTimestamp(),
      });
    } else {
      updateDocumentNonBlocking(quizRef, { status: 'finished' });
    }
  };

  if (isLoadingQuestions || (quiz.status === 'live' && !currentQuestion)) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin w-12 h-12" /></div>;
  }
  
  if (!currentQuestion && quiz.status === 'live') {
      return (
           <div className="flex h-screen flex-col items-center justify-center gap-4 text-center p-4">
             <h1 className="text-2xl font-bold">Waiting for Next Question</h1>
             <p className="text-muted-foreground">The teacher is preparing the next challenge.</p>
             {isTeacher && <LiveLeaderboard quizId={quiz.id} />}
           </div>
      )
  }
  
  if (!currentQuestion) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <AlertDialog open={showViolationWarning} onOpenChange={setShowViolationWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Warning: Focus Lost</AlertDialogTitle>
            <AlertDialogDescription>
              You navigated away from the quiz. Continued violations will result in being blocked from the quiz. Please stay focused to ensure fair play.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowViolationWarning(false)}>I Understand</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="w-full max-w-4xl border-accent/50 shadow-lg shadow-accent/10">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <CardTitle className="text-2xl font-headline text-primary">{quiz.title}</CardTitle>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-lg font-mono">
                <Clock className="w-5 h-5" />
                {timeLeft}s
              </div>
            </div>
          </div>
          <Progress value={(timeLeft / (currentQuestion?.timer || 1)) * 100} className="w-full h-2 mt-2" />
          <CardDescription>Question {quiz.currentQuestionIndex + 1} of {quiz.questionCount}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-xl md:text-2xl text-center font-medium">{currentQuestion.text}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentQuestion.options.map((option, index) => (
              <Button
                key={index}
                onClick={() => handleAnswerSubmit(index)}
                disabled={hasAnswered || isTeacher || timeLeft === 0}
                className={cn("h-auto min-h-16 text-wrap p-4 text-base justify-start transition-all duration-300", 
                    hasAnswered && selectedAnswer === index ? 'bg-primary ring-2 ring-primary-foreground' : 'bg-secondary hover:bg-primary/20',
                    hasAnswered && selectedAnswer !== index ? 'opacity-50' : ''
                )}
              >
                <span className="font-bold mr-4">{String.fromCharCode(65 + index)}.</span>
                {option}
              </Button>
            ))}
          </div>

          {(hasAnswered || timeLeft === 0) && !isTeacher && (
             <div className="text-center text-muted-foreground p-4 rounded-md bg-background/50">
                <p className="font-bold">{timeLeft === 0 && !hasAnswered ? "Time's up!" : "Your answer has been submitted!"}</p>
                <p>Waiting for the teacher to proceed to the next question...</p>
             </div>
          )}
          
          {isTeacher && (
            <div className='flex justify-end gap-4 mt-6'>
                <Button onClick={handleTeacherNextQuestion} size="lg" disabled={isScoring}>
                    {isScoring && <Loader2 className="mr-2 animate-spin"/>}
                    {isScoring ? 'Evaluating...' : (quiz.currentQuestionIndex >= quiz.questionCount - 1 ? 'Finish Quiz' : 'Next Question')}
                    {!isScoring && <ArrowRight className="ml-2"/>}
                </Button>
            </div>
          )}

        </CardContent>
      </Card>
      
      {isTeacher && <LiveLeaderboard quizId={quiz.id} />}

        {!isTeacher && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Shield className="w-4 h-4 text-green-500" />
                <span>Fair play mode is active. Do not switch tabs.</span>
            </div>
        )}
    </div>
  );
}
