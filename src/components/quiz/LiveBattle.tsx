'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { BattleRoom, User, BattleParticipation } from '@/lib/types';
import { useVisibilityChange } from '@/hooks/useVisibilityChange';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Clock, Loader2, CheckCircle, XCircle, Shield, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface LiveBattleProps {
  room: BattleRoom;
  user: User;
  participation: BattleParticipation | undefined;
  onFinishBattle: () => void;
  isTeacher: boolean;
}

export default function LiveBattle({ room, user, participation, onFinishBattle, isTeacher }: LiveBattleProps) {
  const router = useRouter();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  
  const currentQuestion = useMemo(() => {
    return room.quiz.questions[room.currentQuestionIndex];
  }, [room.currentQuestionIndex, room.quiz.questions]);

  const [timeLeft, setTimeLeft] = useState(currentQuestion.timer);

  const onMalpractice = useCallback(() => {
    if (isTeacher || !participation || !firestore) return;

    const newMalpracticeCount = (participation.malpracticeCount || 0) + 1;
    const participantRef = doc(firestore, 'battleRooms', room.id, 'participants', user.id);
    
    // Non-blocking update
    updateDocumentNonBlocking(participantRef, {
        malpracticeCount: newMalpracticeCount,
        isBlocked: newMalpracticeCount >= 1 // Block on first offense
    });

    toast({
        variant: 'destructive',
        title: 'Malpractice Detected!',
        description: 'You have been blocked for navigating away from the quiz.'
    });

    router.push('/kicked');

  }, [isTeacher, participation, firestore, room.id, user.id, router, toast]);

  useVisibilityChange(onMalpractice);

  // Reset state when question changes
  useEffect(() => {
    setTimeLeft(currentQuestion.timer);
    setSelectedAnswer(null);
    setShowResult(false);
  }, [currentQuestion]);
  
  // Timer countdown
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (timeLeft > 0 && !showResult && !isTeacher) {
      timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0 && !showResult && !isTeacher) {
        // Auto-submit when timer runs out
        handleAnswer(null);
    }
    return () => clearTimeout(timer);
  }, [timeLeft, showResult, isTeacher]);

  const handleAnswer = useCallback((answerIndex: number | null) => {
    if (showResult || isTeacher || !participation || !firestore) return;
    
    setShowResult(true);
    setSelectedAnswer(answerIndex);

    const isCorrect = answerIndex === currentQuestion.correctAnswerIndex;
    const scoreGained = isCorrect ? 50 + Math.floor(timeLeft * (50 / currentQuestion.timer)) : 0;
    
    const newAnswer = {
      questionId: currentQuestion.id,
      answerIndex,
      isCorrect,
      score: scoreGained,
    };
    
    const newTotalScore = participation.totalScore + scoreGained;
    const newAnswers = [...participation.answers, newAnswer];
    
    const participantRef = doc(firestore, 'battleRooms', room.id, 'participants', user.id);
    
    updateDocumentNonBlocking(participantRef, {
      answers: newAnswers,
      totalScore: newTotalScore,
    });

    // Let teacher control next question
  }, [showResult, isTeacher, participation, firestore, currentQuestion, timeLeft, room.id, user.id]);

  const handleNextQuestion = () => {
    if (!isTeacher || !firestore) return;

    const nextIndex = room.currentQuestionIndex + 1;
    const roomRef = doc(firestore, 'battleRooms', room.id);

    if (nextIndex < room.quiz.questions.length) {
      updateDocumentNonBlocking(roomRef, { currentQuestionIndex: nextIndex });
    } else {
      onFinishBattle();
    }
  };

  const getButtonClass = (index: number) => {
    if (!showResult && !isTeacher) return 'bg-secondary hover:bg-primary/20';
    
    // After answering (or for teacher view)
    if (index === currentQuestion.correctAnswerIndex) return 'bg-green-500/80 ring-2 ring-green-400';
    if (index === selectedAnswer && index !== currentQuestion.correctAnswerIndex) return 'bg-red-500/80';
    return 'bg-secondary opacity-50';
  };
  
  if (!currentQuestion) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin w-12 h-12" /></div>;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-4xl border-accent/50 shadow-lg shadow-accent/10">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-2xl font-headline text-primary">{room.quiz.title}</CardTitle>
            {!isTeacher && (
              <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2 text-lg font-mono text-yellow-400">
                    <Trophy className="w-5 h-5" />
                    {participation?.totalScore || 0}
                  </div>
                 <div className="flex items-center gap-2 text-lg font-mono">
                  <Clock className="w-5 h-5" />
                  {timeLeft}s
                </div>
              </div>
            )}
          </div>
          <Progress value={currentQuestion.timer > 0 ? (timeLeft / currentQuestion.timer) * 100 : 0} className="w-full h-2 mt-2" />
          <CardDescription>Question {room.currentQuestionIndex + 1} of {room.quiz.questions.length}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-xl md:text-2xl text-center font-medium">{currentQuestion.text}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentQuestion.options.map((option, index) => (
              <Button
                key={index}
                onClick={() => handleAnswer(index)}
                disabled={showResult || isTeacher}
                className={cn("h-auto min-h-16 text-wrap p-4 text-base justify-start transition-all duration-300", getButtonClass(index))}
              >
                <span className="font-bold mr-4">{String.fromCharCode(65 + index)}.</span>
                {option}
              </Button>
            ))}
          </div>

          {(showResult || isTeacher) && (
            <Card className="mt-6 bg-secondary/50 p-4">
                <div className="flex items-start gap-4">
                    {!isTeacher && (
                        selectedAnswer === currentQuestion.correctAnswerIndex ? (
                            <CheckCircle className="w-8 h-8 text-green-400 shrink-0" />
                        ) : (
                            <XCircle className="w-8 h-8 text-red-400 shrink-0" />
                        )
                    )}
                     {isTeacher && <CheckCircle className="w-8 h-8 text-green-400 shrink-0" />}
                    <div>
                        <h3 className="font-bold text-lg">
                           {isTeacher ? `Correct Answer: ${currentQuestion.options[currentQuestion.correctAnswerIndex]}` : (selectedAnswer === currentQuestion.correctAnswerIndex ? 'Correct!' : 'Incorrect')}
                        </h3>
                    </div>
                </div>
            </Card>
          )}
          
          {isTeacher && (
            <div className="flex justify-end mt-4">
              <Button onClick={handleNextQuestion}>
                {room.currentQuestionIndex < room.quiz.questions.length - 1 ? 'Next Question' : 'Finish Battle'}
              </Button>
            </div>
          )}

        </CardContent>
      </Card>
        {!isTeacher && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Shield className="w-4 h-4 text-green-500" />
                <span>Fair play mode is active. Do not switch tabs.</span>
            </div>
        )}
    </div>
  );
}
