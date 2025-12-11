"use client";

import { useState, useEffect } from 'react';
import { notFound, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getRoom, getQuiz, joinRoom, updateRoom } from '@/lib/mock-data';
import type { Room, Quiz, User } from '@/lib/types';
import WaitingRoom from '@/components/quiz/WaitingRoom';
import BattleRoom from '@/components/quiz/BattleRoom';
import QuizResults from '@/components/quiz/QuizResults';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

export default function BattlePage({ params }: { params: { roomCode: string } }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (isAuthLoading || !user) return;

    const roomId = params.roomCode;
    const initialRoom = getRoom(roomId);
    
    if (!initialRoom) {
      toast({ variant: 'destructive', title: 'Error', description: 'This battle room does not exist.' });
      router.push('/');
      return;
    }

    const initialQuiz = getQuiz(initialRoom.quizId);
    if (!initialQuiz) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not find the quiz for this room.' });
        router.push('/');
        return;
    }

    const updatedRoom = joinRoom(roomId, user);
    setRoom(updatedRoom || initialRoom);
    setQuiz(initialQuiz);
    setIsLoading(false);

    const interval = setInterval(() => {
        const currentRoomState = getRoom(roomId);
        if (currentRoomState) {
            setRoom(currentRoomState);
        }
    }, 1000); // Poll for updates every second

    return () => clearInterval(interval);

  }, [params.roomCode, user, isAuthLoading, router, toast]);
  
  const handleStartBattle = () => {
    const updated = updateRoom(params.roomCode, { status: 'playing', startTime: Date.now() });
    if (updated) setRoom(updated);
  };
  
  const handleFinishBattle = () => {
    const updated = updateRoom(params.roomCode, { status: 'finished' });
    if (updated) setRoom(updated);
  }

  if (isLoading || isAuthLoading || !user || !room || !quiz) {
    return (
        <div className="flex flex-col items-center justify-center h-screen p-4">
            <h1 className="text-2xl font-headline text-primary mb-4">Entering Arena...</h1>
            <Skeleton className="w-full max-w-lg h-64" />
        </div>
    );
  }

  if (room.status === 'waiting') {
    return <WaitingRoom room={room} quiz={quiz} user={user} onStart={handleStartBattle} />;
  }

  if (room.status === 'playing') {
    return <BattleRoom room={room} quiz={quiz} user={user} onFinish={handleFinishBattle} />;
  }

  if (room.status === 'finished') {
    return <QuizResults room={room} quiz={quiz} />;
  }
  
  return notFound();
}
