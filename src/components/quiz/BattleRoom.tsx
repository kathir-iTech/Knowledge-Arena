"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import type { Room, Quiz, User, Question } from '@/lib/types';
import { useVisibilityChange } from '@/hooks/useVisibilityChange';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, XCircle, Shield, Clock } from 'lucide-react';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { cn } from '@/lib/utils';

interface BattleRoomProps {
  room: Room;
  quiz: Quiz;
  user: User;
  onFinish: () => void;
}

const BattleRoom: React.FC<BattleRoomProps> = ({ room, quiz, user, onFinish }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(room.currentQuestionIndex);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [score, setScore] = useState(room.scores[user.id] || 0);
  const router = useRouter();
  const { addXp } = useAuth();
  const firestore = useFirestore();

  const currentQuestion = quiz.questions[currentQuestionIndex];

  useVisibilityChange(() => {
    if (user.role === 'Student') {
      router.push('/kicked');
    }
  });

  useEffect(() => {
    if (currentQuestion) {
      setTimeLeft(currentQuestion.timer);
    }
  }, [currentQuestion]);
  
  // Sync with Firestore state
  useEffect(() => {
      setCurrentQuestionIndex(room.currentQuestionIndex);
  }, [room.currentQuestionIndex])


  useEffect(() => {
    if (showResult || timeLeft <= 0 || user.role === 'Teacher') {
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, showResult, user.role]);

  const handleAnswer = useCallback((answerIndex: number | null) => {
    if (showResult || user.role === 'Teacher') return;

    setSelectedAnswer(answerIndex);
    setShowResult(true);

    let points = 0;
    if (answerIndex === currentQuestion.correctAnswer) {
      points = 50 + Math.floor(timeLeft * (50 / currentQuestion.timer));
      const newScore = score + points;
      setScore(newScore);
      
      if (firestore) {
        const roomRef = doc(firestore, 'battleRooms', room.id);
        const newScores = { ...room.scores, [user.id]: newScore };
        updateDocumentNonBlocking(roomRef, { scores: newScores });
      }
    }

    setTimeout(() => {
      if (currentQuestionIndex < quiz.questions.length - 1) {
        // Only teacher can advance the question
        // Students wait for the room state to change
      } else {
        addXp(score + points); // final score
        onFinish();
      }
    }, 3000);
  }, [showResult, user.role, currentQuestion, timeLeft, score, firestore, room.id, room.scores, user.id, currentQuestionIndex, quiz.questions.length, addXp, onFinish]);

  useEffect(() => {
    if (timeLeft <= 0 && !showResult && user.role !== 'Teacher') {
      handleAnswer(null);
    }
  }, [timeLeft, showResult, handleAnswer, user.role]);


  const getButtonClass = (index: number) => {
    if (!showResult && user.role !== 'Teacher') return 'bg-secondary hover:bg-primary/20';
    if (index === currentQuestion.correctAnswer) return 'bg-green-500/80 ring-2 ring-green-400';
    if (index === selectedAnswer && user.role === 'Student') return 'bg-red-500/80';
    return 'bg-secondary opacity-50';
  };
  
  if (!currentQuestion) {
    return <div>Loading question...</div>;
  }

  const handleNextQuestion = () => {
    if (user.role === 'Teacher' && firestore) {
      const nextIndex = currentQuestionIndex + 1;
      if (nextIndex < quiz.questions.length) {
         const roomRef = doc(firestore, 'battleRooms', room.id);
         updateDocumentNonBlocking(roomRef, { currentQuestionIndex: nextIndex });
         setShowResult(false); // Reset for next question view
         setSelectedAnswer(null);
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
            {user.role === 'Student' && (
              <div className="flex items-center gap-2 text-lg font-mono">
                <Clock className="w-5 h-5" />
                {timeLeft}s
              </div>
            )}
          </div>
           {user.role === 'Student' && <Progress value={(timeLeft / currentQuestion.timer) * 100} className="w-full h-2" />}
          <CardDescription>Question {currentQuestionIndex + 1} of {quiz.questions.length}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-xl md:text-2xl text-center font-medium">{currentQuestion.text}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentQuestion.options.map((option, index) => (
              <Button
                key={index}
                onClick={() => handleAnswer(index)}
                disabled={showResult || user.role === 'Teacher'}
                className={cn("h-auto min-h-16 text-wrap p-4 text-base justify-start transition-all duration-300", getButtonClass(index))}
              >
                <span className="font-bold mr-4">{String.fromCharCode(65 + index)}.</span>
                {option}
              </Button>
            ))}
          </div>

          {(showResult || user.role === 'Teacher') && (
            <Card className="mt-6 bg-secondary p-4">
                <div className="flex items-start gap-4">
                    {user.role === 'Student' && (
                        selectedAnswer === currentQuestion.correctAnswer ? (
                            <CheckCircle className="w-8 h-8 text-green-400 shrink-0" />
                        ) : (
                            <XCircle className="w-8 h-8 text-red-400 shrink-0" />
                        )
                    )}
                     {user.role === 'Teacher' && <CheckCircle className="w-8 h-8 text-green-400 shrink-0" />}
                    <div>
                        <h3 className="font-bold text-lg">
                           {user.role === 'Teacher' ? `Correct Answer: ${currentQuestion.options[currentQuestion.correctAnswer]}` : (selectedAnswer === currentQuestion.correctAnswer ? 'Correct!' : 'Incorrect')}
                        </h3>
                        <p className="text-muted-foreground">{currentQuestion.explanation}</p>
                    </div>
                </div>
            </Card>
          )}
          
          {user.role === 'Teacher' && (
            <div className="flex justify-end mt-4">
              <Button onClick={handleNextQuestion}>
                {currentQuestionIndex < quiz.questions.length - 1 ? 'Next Question' : 'Finish Battle'}
              </Button>
            </div>
          )}

        </CardContent>
      </Card>
        {user.role === 'Student' && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Shield className="w-4 h-4 text-green-500" />
                <span>Fair play mode is active. Do not switch tabs.</span>
            </div>
        )}
    </div>
  );
};

export default BattleRoom;
