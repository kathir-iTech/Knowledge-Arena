
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useFirestore, useDoc, useCollection, updateDocumentNonBlocking, FirestorePermissionError, errorEmitter } from '@/firebase';
import { doc, collection, addDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import type { Quiz, QuizParticipant, QuizQuestion, User, Violation } from '@/lib/types';
import { usePageFocusChange } from '@/hooks/usePageFocusChange';
import { useAuth } from '@/hooks/useAuth';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Clock, Loader2, Users, ArrowRight, Shield } from 'lucide-react';
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
  
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [showViolationWarning, setShowViolationWarning] = useState(false);

  // --- Data Fetching ---
  const questionsRef = useMemo(() => collection(firestore, 'quizzes', quiz.id, 'questions'), [firestore, quiz.id]);
  const { data: questions, isLoading: isLoadingQuestions } = useCollection<QuizQuestion>(questionsRef);

  const currentQuestion = useMemo(() => {
    if (!questions || quiz.currentQuestionIndex < 0 || quiz.currentQuestionIndex >= questions.length) return null;
    return questions[quiz.currentQuestionIndex];
  }, [questions, quiz.currentQuestionIndex]);

  // --- Timer Logic ---
  const [timeLeft, setTimeLeft] = useState(currentQuestion?.timer || quiz.timeLimit || 0);

  useEffect(() => {
    if (currentQuestion) {
        const serverStartTime = quiz.questionStartAt || Date.now();
        const timeLimit = currentQuestion.timer * 1000;
        const endTime = serverStartTime + timeLimit;

        const updateTimer = () => {
            const now = Date.now();
            const remaining = Math.max(0, endTime - now);
            setTimeLeft(Math.ceil(remaining / 1000));
        };

        const interval = setInterval(updateTimer, 500);
        updateTimer();
        
        return () => clearInterval(interval);
    }
  }, [currentQuestion, quiz.questionStartAt]);


  // --- State Reset on Question Change ---
  useEffect(() => {
    setSelectedAnswer(null);
    setHasAnswered(false);
  }, [currentQuestion]);
  
  // --- Actions ---

  const onMalpractice = useCallback(() => {
    if (isTeacher || !firestore || !user) return;
    
    setShowViolationWarning(true);

    const violationData: Omit<Violation, 'timestamp'> = {
      userId: user.id
    }
    const violationRef = collection(firestore, `quizzes/${quiz.id}/violations`);
    
    addDoc(violationRef, { ...violationData, timestamp: serverTimestamp() }).catch(error => {
        console.warn("Could not log violation", error.message);
    });

  }, [isTeacher, firestore, user, quiz.id]);

  usePageFocusChange(onMalpractice);

  const handleAnswerSubmit = async (answerIndex: number) => {
    if (hasAnswered || isTeacher || !currentQuestion || !user || !firestore) return;
    
    setHasAnswered(true);
    setSelectedAnswer(answerIndex);

    const submissionRef = doc(firestore, `quizzes/${quiz.id}/submissions/${user.id}/${currentQuestion.id}`);
    const submissionData: Omit<QuizSubmission, 'submittedAt'> = {
        selectedOption: answerIndex
    };
    
    try {
        await setDoc(submissionRef, { ...submissionData, submittedAt: serverTimestamp() });
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
  
  const handleTeacherNextQuestion = () => {
    if (!isTeacher || !firestore) return;

    const nextIndex = quiz.currentQuestionIndex + 1;
    const quizRef = doc(firestore, 'quizzes', quiz.id);

    if (nextIndex < quiz.questionCount) {
        const nextQuestion = questions?.[nextIndex];
        if (nextQuestion) {
            updateDocumentNonBlocking(quizRef, { 
                currentQuestionIndex: nextIndex,
                questionStartAt: serverTimestamp(),
                timeLimit: nextQuestion.timer
            });
        }
    } else {
      updateDocumentNonBlocking(quizRef, { status: 'finished' });
    }
  };

  if (isLoadingQuestions || (quiz.status === 'live' && !currentQuestion)) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin w-12 h-12" /></div>;
  }
  
  if (!currentQuestion) {
      return (
           <div className="flex h-screen flex-col items-center justify-center gap-4 text-center p-4">
             <h1 className="text-2xl font-bold">Waiting for Next Question</h1>
             <p className="text-muted-foreground">The teacher is preparing the next challenge.</p>
           </div>
      )
  }

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
          <Progress value={(timeLeft / (currentQuestion?.timer || quiz.timeLimit || 1)) * 100} className="w-full h-2 mt-2" />
          <CardDescription>Question {quiz.currentQuestionIndex + 1} of {quiz.questionCount}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-xl md:text-2xl text-center font-medium">{currentQuestion.text}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentQuestion.options.map((option, index) => (
              <Button
                key={index}
                onClick={() => handleAnswerSubmit(index)}
                disabled={hasAnswered || isTeacher}
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

          {hasAnswered && !isTeacher && (
             <div className="text-center text-muted-foreground p-4">
                <p className="font-bold">Your answer has been submitted!</p>
                <p>Waiting for the teacher to proceed to the next question...</p>
             </div>
          )}
          
          {isTeacher && (
            <div className='flex justify-end gap-4 mt-6'>
                <Button onClick={handleTeacherNextQuestion} size="lg">
                    {quiz.currentQuestionIndex >= quiz.questionCount - 1 ? 'Finish Quiz' : 'Next Question'}
                    <ArrowRight className="ml-2"/>
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
