
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import type { Room, Quiz, User, Question, BattleResult } from '@/lib/types';
import { useVisibilityChange } from '@/hooks/useVisibilityChange';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, XCircle, Shield, Clock, Loader2 } from 'lucide-react';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc, writeBatch, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';

interface BattleRoomProps {
  room: Room;
  quiz: Quiz;
  user: User;
  onFinish: () => void;
  isTeacherObserver: boolean;
}

const BattleRoom: React.FC<BattleRoomProps> = ({ room, quiz, user, onFinish, isTeacherObserver }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(room.currentQuestionIndex);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [score, setScore] = useState(0);
  const router = useRouter();
  const { addXp } = useAuth();
  const firestore = useFirestore();

  const isTeacher = user.role === 'Teacher' || isTeacherObserver;
  const currentQuestion = quiz.questions[currentQuestionIndex];

  useVisibilityChange(() => {
    if (!isTeacher) {
      router.push('/kicked');
    }
  });

  useEffect(() => {
    if (currentQuestion) {
      setTimeLeft(currentQuestion.timer);
    }
  }, [currentQuestion]);
  
  useEffect(() => {
      setCurrentQuestionIndex(room.currentQuestionIndex);
      setShowResult(false);
      setSelectedAnswer(null);
      if(quiz.questions[room.currentQuestionIndex]) {
        setTimeLeft(quiz.questions[room.currentQuestionIndex].timer);
      }
  }, [room.currentQuestionIndex, quiz.questions]);


  useEffect(() => {
    if (showResult || timeLeft <= 0 || isTeacher) {
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft(prev => prev > 0 ? prev - 1 : 0);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, showResult, isTeacher]);

  const finishBattle = useCallback(async (finalScore: number) => {
    if (!firestore || isTeacher) {
      onFinish();
      return;
    }

    try {
      const batch = writeBatch(firestore);
      
      const resultId = uuidv4();
      const resultRef = doc(firestore, 'battleResults', resultId);
      const newResult: Omit<BattleResult, 'completedAt'> & { completedAt: any } = {
        id: resultId,
        battleRoomId: room.id,
        studentId: user.id,
        teacherId: room.teacherId,
        studentName: user.name,
        studentAvatar: user.avatar,
        score: finalScore,
        completedAt: serverTimestamp(),
      };
      batch.set(resultRef, newResult);

      const roomRef = doc(firestore, 'battleRooms', room.id);
      batch.update(roomRef, {
        battleResultIds: arrayUnion(resultId),
      });
      
      await batch.commit();
      addXp(finalScore);
    } catch (error) {
      console.error("Failed to save battle result:", error);
    } finally {
      onFinish();
    }

  }, [firestore, user, room.id, room.teacherId, onFinish, addXp, isTeacher]);


  const handleAnswer = useCallback((answerIndex: number | null) => {
    if (showResult || isTeacher) return;

    setSelectedAnswer(answerIndex);
    setShowResult(true);

    let currentPoints = 0;
    if (answerIndex === currentQuestion.correctAnswerIndex) {
      currentPoints = 50 + Math.floor(timeLeft * (50 / currentQuestion.timer));
      const newScore = score + currentPoints;
      setScore(newScore);
    }
    
    const isLastQuestion = currentQuestionIndex >= quiz.questions.length - 1;

    setTimeout(() => {
      if (isLastQuestion) {
        finishBattle(score + currentPoints);
      }
    }, 3000);

  }, [showResult, isTeacher, currentQuestion, timeLeft, score, currentQuestionIndex, quiz.questions.length, finishBattle]);


  useEffect(() => {
    if (timeLeft <= 0 && !showResult && !isTeacher) {
      handleAnswer(null);
    }
  }, [timeLeft, showResult, handleAnswer, isTeacher]);


  const getButtonClass = (index: number) => {
    if (!showResult && !isTeacher) return 'bg-secondary hover:bg-primary/20';
    if (index === currentQuestion.correctAnswerIndex) return 'bg-green-500/80 ring-2 ring-green-400';
    if (index === selectedAnswer && !isTeacher) return 'bg-red-500/80';
    return 'bg-secondary opacity-50';
  };
  
  if (!currentQuestion) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <p className="text-muted-foreground mt-4">Waiting for next question...</p>
        </div>
    );
  }

  const handleNextQuestion = () => {
    if (isTeacher && firestore) {
      const nextIndex = currentQuestionIndex + 1;
      if (nextIndex < quiz.questions.length) {
         const roomRef = doc(firestore, 'battleRooms', room.id);
         updateDocumentNonBlocking(roomRef, { currentQuestionIndex: nextIndex });
      } else {
        onFinish();
      }
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-4xl border-accent/50 shadow-lg shadow-accent/10">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-2xl font-headline text-primary">{quiz.topic}</CardTitle>
            {!isTeacher && (
              <div className="flex items-center gap-2 text-lg font-mono">
                <Clock className="w-5 h-5" />
                {timeLeft}s
              </div>
            )}
          </div>
           {!isTeacher && <Progress value={(timeLeft / currentQuestion.timer) * 100} className="w-full h-2" />}
          <CardDescription>Question {currentQuestionIndex + 1} of {quiz.questions.length}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-xl md:text-2xl text-center font-medium">{currentQuestion.text}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentQuestion.answerOptions.map((option, index) => (
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
            <Card className="mt-6 bg-secondary p-4">
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
                           {isTeacher ? `Correct Answer: ${currentQuestion.answerOptions[currentQuestion.correctAnswerIndex]}` : (selectedAnswer === currentQuestion.correctAnswerIndex ? 'Correct!' : 'Incorrect')}
                        </h3>
                        <p className="text-muted-foreground">{currentQuestion.explanation}</p>
                    </div>
                </div>
            </Card>
          )}
          
          {isTeacher && (
            <div className="flex justify-end mt-4">
              <Button onClick={handleNextQuestion}>
                {currentQuestionIndex < quiz.questions.length - 1 ? 'Next Question' : 'Finish Battle'}
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
};

export default BattleRoom;
