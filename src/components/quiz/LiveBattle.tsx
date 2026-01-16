
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useFirestore, useDoc, useCollection, updateDocumentNonBlocking } from '@/firebase';
import { doc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { Battle, BattleParticipant, BattleQuestion, User, Violation } from '@/lib/types';
import { usePageFocusChange } from '@/hooks/usePageFocusChange';
import { useAuth } from '@/hooks/useAuth';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Clock, Loader2, Users, ArrowRight, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction } from '../ui/alert-dialog';

interface LiveBattleProps {
  battle: Battle;
  participant: BattleParticipant;
  isTeacher: boolean;
}

const LiveLeaderboard = ({ battleId }: { battleId: string }) => {
    const firestore = useFirestore();
    const participantsRef = useMemo(() => {
        if (!firestore) return null;
        return collection(firestore, 'battles', battleId, 'participants');
    }, [firestore, battleId]);

    const { data: participants } = useCollection<BattleParticipant>(participantsRef);
    
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

export default function LiveBattle({ battle, participant, isTeacher }: LiveBattleProps) {
  const { user } = useAuth();
  const firestore = useFirestore();
  
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [showViolationWarning, setShowViolationWarning] = useState(false);

  // --- Data Fetching ---
  const currentQuestionRef = useMemo(() => {
    if (!firestore || battle.currentQuestionIndex < 0) return null;
    const questionId = battle.title + battle.currentQuestionIndex; // This needs a real ID
    // This part is tricky. We need a way to get the current question ID from the index.
    // This should ideally be part of the battle document or fetched separately.
    // For now, we assume we can construct it, but this is a flaw.
    // A better approach: The Battle document should contain the currentQuestionId.
    return null; // Placeholder until we get the actual question ID
  }, [firestore, battle.currentQuestionIndex, battle.title]);
  // This demonstrates the need for a `questions` subcollection query.
  
  const questionsRef = useMemo(() => collection(firestore, 'battles', battle.id, 'questions'), [firestore, battle.id]);
  const { data: questions, isLoading: isLoadingQuestions } = useCollection<BattleQuestion>(questionsRef);

  const currentQuestion = useMemo(() => {
    if (!questions || battle.currentQuestionIndex < 0 || battle.currentQuestionIndex >= questions.length) return null;
    // This is inefficient. A better way is to have the battle doc store the current question ID.
    // But for this client-driven approach, we sort by a creation order if available.
    // For now, we'll assume the order is stable.
    return questions[battle.currentQuestionIndex];
  }, [questions, battle.currentQuestionIndex]);

  // --- Timer Logic ---
  const [timeLeft, setTimeLeft] = useState(currentQuestion?.timer || battle.timeLimit || 0);

  useEffect(() => {
    if (currentQuestion) {
        const serverStartTime = battle.questionStartAt || Date.now();
        const timeLimit = currentQuestion.timer * 1000;
        const endTime = serverStartTime + timeLimit;

        const updateTimer = () => {
            const now = Date.now();
            const remaining = Math.max(0, endTime - now);
            setTimeLeft(Math.ceil(remaining / 1000));
            if (remaining <= 0 && !hasAnswered && !isTeacher) {
                // Time's up, but don't auto-submit. The server will reject late answers.
            }
        };

        const interval = setInterval(updateTimer, 500);
        updateTimer();
        
        return () => clearInterval(interval);
    }
  }, [currentQuestion, battle.questionStartAt, hasAnswered, isTeacher]);


  // --- State Reset on Question Change ---
  useEffect(() => {
    setSelectedAnswer(null);
    setHasAnswered(false);
  }, [currentQuestion]);
  
  // --- Actions ---

  const onMalpractice = useCallback(() => {
    if (isTeacher || !firestore || !user) return;
    
    // Show warning to user
    setShowViolationWarning(true);

    // Report violation to the server
    const violationRef = collection(firestore, `battles/${battle.id}/violations`);
    addDoc(violationRef, { 
        userId: user.id,
        timestamp: serverTimestamp() 
    });

  }, [isTeacher, firestore, user, battle.id]);

  usePageFocusChange(onMalpractice);

  const handleAnswerSubmit = async (answerIndex: number) => {
    if (hasAnswered || isTeacher || !currentQuestion || !user || !firestore) return;
    
    setHasAnswered(true);
    setSelectedAnswer(answerIndex);

    const answerRef = doc(firestore, `battles/${battle.id}/answers/${user.id}/${currentQuestion.id}`);
    
    // The client does NOT know if the answer is correct or the score.
    // It only submits the chosen option. A Cloud Function will process this.
    try {
        await addDoc(collection(firestore, `battles/${battle.id}/answers/${user.id}`), {
             questionId: currentQuestion.id,
             selectedOption: answerIndex,
             submittedAt: serverTimestamp()
        });
    } catch (error) {
        console.error("Error submitting answer:", error)
        // Re-enable answering if submission fails?
        setHasAnswered(false);
    }
  };
  
  const handleTeacherNextQuestion = () => {
    if (!isTeacher || !firestore) return;

    const nextIndex = battle.currentQuestionIndex + 1;
    const battleRef = doc(firestore, 'battles', battle.id);

    if (nextIndex < battle.questionCount) {
        const nextQuestion = questions?.[nextIndex];
        if (nextQuestion) {
            updateDocumentNonBlocking(battleRef, { 
                currentQuestionIndex: nextIndex,
                questionStartAt: Date.now(), // Not a server timestamp, but better than nothing on client
                timeLimit: nextQuestion.timer
            });
        }
    } else {
      // Last question finished, end the battle
      updateDocumentNonBlocking(battleRef, { state: 'finished' });
    }
  };

  if (isLoadingQuestions || (battle.state === 'live' && !currentQuestion)) {
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
              You navigated away from the quiz. Continued violations will result in being blocked from the battle. Please stay focused to ensure fair play.
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
            <CardTitle className="text-2xl font-headline text-primary">{battle.title}</CardTitle>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-lg font-mono">
                <Clock className="w-5 h-5" />
                {timeLeft}s
              </div>
            </div>
          </div>
          <Progress value={(timeLeft / (currentQuestion?.timer || battle.timeLimit || 1)) * 100} className="w-full h-2 mt-2" />
          <CardDescription>Question {battle.currentQuestionIndex + 1} of {battle.questionCount}</CardDescription>
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
                    {battle.currentQuestionIndex >= battle.questionCount - 1 ? 'Finish Battle' : 'Next Question'}
                    <ArrowRight className="ml-2"/>
                </Button>
            </div>
          )}

        </CardContent>
      </Card>
      
      {isTeacher && <LiveLeaderboard battleId={battle.id} />}

        {!isTeacher && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Shield className="w-4 h-4 text-green-500" />
                <span>Fair play mode is active. Do not switch tabs.</span>
            </div>
        )}
    </div>
  );
}
