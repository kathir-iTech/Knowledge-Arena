
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestore } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { BattleRoom, User, BattleParticipation } from '@/lib/types';
import { useVisibilityChange } from '@/hooks/useVisibilityChange';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Clock, Loader2, CheckCircle, XCircle, Shield, Trophy, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';

interface LiveBattleProps {
  room: BattleRoom;
  user: User;
  participation: BattleParticipation | null | undefined;
  allParticipants: BattleParticipation[] | null;
  isTeacher: boolean;
}

export default function LiveBattle({ room, user, participation, allParticipants, isTeacher }: LiveBattleProps) {
  const router = useRouter();
  const firestore = useFirestore();

  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  
  const currentQuestion = useMemo(() => {
    return room.quiz.questions[room.currentQuestionIndex];
  }, [room.currentQuestionIndex, room.quiz.questions]);

  const [timeLeft, setTimeLeft] = useState(currentQuestion?.timer || 0);

  const onMalpractice = useCallback(() => {
    if (isTeacher || !participation || !firestore || participation.isBlocked) return;

    const newMalpracticeCount = (participation.malpracticeCount || 0) + 1;
    const participantRef = doc(firestore, 'battleRooms', room.id, 'participants', user.id);
    
    updateDocumentNonBlocking(participantRef, {
        malpracticeCount: newMalpracticeCount,
        isBlocked: true
    });
    
    router.push('/kicked');

  }, [isTeacher, participation, firestore, room.id, user.id, router]);

  useVisibilityChange(onMalpractice);

  // Effect to reset state when the question changes
  useEffect(() => {
    if(currentQuestion) {
        setTimeLeft(currentQuestion.timer);
        setSelectedAnswer(null);
        setShowResult(false);
    }
  }, [currentQuestion]);
  
  const onFinishBattle = useCallback(() => {
    if (!isTeacher || !firestore) return;
    const roomRef = doc(firestore, 'battleRooms', room.id);
    const finalParticipantCount = allParticipants?.length || 0;
    updateDocumentNonBlocking(roomRef, { status: 'finished', participantCount: finalParticipantCount });
  }, [isTeacher, firestore, room.id, allParticipants]);


  const handleAnswer = useCallback((answerIndex: number | null) => {
    if (showResult || isTeacher || !participation || !firestore || !currentQuestion) return;
    
    setShowResult(true);
    setSelectedAnswer(answerIndex);

    const isCorrect = answerIndex === currentQuestion.correctAnswerIndex;
    let scoreGained = 0;
    if (isCorrect) {
        // Award up to 100 points based on time left.
        scoreGained = Math.floor(100 * (timeLeft / currentQuestion.timer));
    } else {
        // Deduct 50 for incorrect answer
        scoreGained = -50;
    }
    
    const newAnswer = {
      questionId: currentQuestion.id,
      answerIndex,
      isCorrect,
      score: scoreGained,
    };
    
    const newTotalScore = (participation.totalScore || 0) + scoreGained;
    const newAnswers = [...(participation.answers || []), newAnswer];
    
    const participantRef = doc(firestore, 'battleRooms', room.id, 'participants', user.id);
    
    updateDocumentNonBlocking(participantRef, {
      answers: newAnswers,
      totalScore: newTotalScore,
    });
    
    // Auto-advance for teacher after a delay to show result
    const isLastQuestion = room.currentQuestionIndex >= room.quiz.questions.length - 1;
    if (isTeacher) {
        setTimeout(() => {
            if (isLastQuestion) {
                onFinishBattle();
            }
        }, 3000); 
    }

  }, [showResult, isTeacher, participation, firestore, currentQuestion, timeLeft, room.id, user.id, room.currentQuestionIndex, room.quiz.questions.length, onFinishBattle]);
  
  // Timer countdown effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (timeLeft > 0 && !showResult && !isTeacher) {
      timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0 && !showResult && !isTeacher) {
        handleAnswer(null); // Submit timeout as the answer
    }
    return () => clearTimeout(timer);
  }, [timeLeft, showResult, isTeacher, handleAnswer]);


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
    if (!showResult) return 'bg-secondary hover:bg-primary/20';
    
    if (currentQuestion && index === currentQuestion.correctAnswerIndex) return 'bg-green-500/80 ring-2 ring-green-400';
    if (index === selectedAnswer && currentQuestion && index !== currentQuestion.correctAnswerIndex) return 'bg-red-500/80';
    return 'bg-secondary opacity-50';
  };
  
  if (!currentQuestion) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin w-12 h-12" /></div>;
  }

  // This handles the case where a student joins but their participation doc hasn't loaded yet.
  if (!isTeacher && !participation) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Preparing your station...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-4xl border-accent/50 shadow-lg shadow-accent/10">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-2xl font-headline text-primary">{room.quiz.title}</CardTitle>
            {isTeacher ? (
                 <div className="flex items-center gap-2 text-lg font-mono">
                    <Users className="w-5 h-5" />
                    {allParticipants?.length || 0} Gladiators
                </div>
            ) : (
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

          {showResult && !isTeacher && (
            <Card className="mt-6 bg-secondary/50 p-4">
                <div className="flex items-start gap-4">
                    {selectedAnswer === currentQuestion.correctAnswerIndex ? (
                        <CheckCircle className="w-8 h-8 text-green-400 shrink-0" />
                    ) : (
                        <XCircle className="w-8 h-8 text-red-400 shrink-0" />
                    )}
                    <div>
                        <h3 className="font-bold text-lg">
                           {selectedAnswer === currentQuestion.correctAnswerIndex ? 'Correct!' : 'Incorrect'}
                        </h3>
                        <p className="text-sm text-muted-foreground">The correct answer was: {currentQuestion.options[currentQuestion.correctAnswerIndex]}</p>
                    </div>
                </div>
            </Card>
          )}
          
          {isTeacher && (
            <div className='flex flex-col gap-4'>
                <Card className="mt-6 bg-secondary/50 p-4">
                     <div className="flex items-start gap-4">
                        <CheckCircle className="w-8 h-8 text-green-400 shrink-0" />
                        <div>
                            <h3 className="font-bold text-lg">
                                Correct Answer: {currentQuestion.options[currentQuestion.correctAnswerIndex]}
                            </h3>
                        </div>
                    </div>
                </Card>
                 <div className="flex justify-end mt-4">
                    <Button onClick={handleNextQuestion}>
                        {room.currentQuestionIndex < room.quiz.questions.length - 1 ? 'Next Question' : 'Finish Battle'}
                    </Button>
                </div>
            </div>
          )}

        </CardContent>
      </Card>
      
      {isTeacher && allParticipants && (
         <Card className="w-full max-w-4xl mt-4">
            <CardHeader>
                <CardTitle>Live Leaderboard</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap gap-4">
                  {[...allParticipants].sort((a,b) => b.totalScore - a.totalScore).map(p => (
                    <div key={p.id} className="flex items-center gap-3 p-2 rounded-md bg-secondary">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-sm bg-muted">{p.studentAvatar}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium max-w-20 truncate">{p.studentName}</span>
                        <span className='text-xs text-primary font-mono'>{p.totalScore} pts</span>
                      </div>
                    </div>
                  ))}
                </div>
            </CardContent>
         </Card>
      )}

        {!isTeacher && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Shield className="w-4 h-4 text-green-500" />
                <span>Fair play mode is active. Do not switch tabs.</span>
            </div>
        )}
    </div>
  );
}
