"use client";

import { useState, useEffect } from 'react';
import { notFound, useRouter } from 'next/navigation';
import { useUser, useFirestore, useMemoFirebase, useDoc, updateDocumentNonBlocking } from '@/firebase';
import type { Room, Quiz, User } from '@/lib/types';
import WaitingRoom from '@/components/quiz/WaitingRoom';
import BattleRoom from '@/components/quiz/BattleRoom';
import QuizResults from '@/components/quiz/QuizResults';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';

export default function BattlePage({ params }: { params: { roomCode: string } }) {
  const { user: authUser, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const roomRef = useMemoFirebase(() => firestore ? doc(firestore, 'battleRooms', params.roomCode) : null, [firestore, params.roomCode]);
  const { data: room, isLoading: isRoomLoading } = useDoc<Room>(roomRef);

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isAuthLoading || !authUser || !room) return;

    if (room && !isRoomLoading) {
      if (!room.participants.some(p => p.id === authUser.uid)) {
        updateDoc(roomRef!, {
          participants: arrayUnion({
            id: authUser.uid,
            name: authUser.displayName,
            email: authUser.email,
            avatar: '👤', // Default avatar, will be updated from user profile
            role: 'Student', // Assuming anyone joining is a student
            xp: 0 // XP will be updated from user profile
          })
        });
      }

      const quizRef = doc(firestore, 'quizzes', room.quizId);
      getDoc(quizRef).then(quizDoc => {
        if (quizDoc.exists()) {
          setQuiz({ id: quizDoc.id, ...quizDoc.data() } as Quiz);
        } else {
          toast({ variant: 'destructive', title: 'Error', description: 'Could not find the quiz for this room.' });
          router.push('/');
        }
        setIsLoading(false);
      });
    } else if (!isRoomLoading) {
       toast({ variant: 'destructive', title: 'Error', description: 'This battle room does not exist.' });
       router.push('/');
    }

  }, [room, isRoomLoading, authUser, isAuthLoading, router, toast, firestore, params.roomCode, roomRef]);

  const handleStartBattle = () => {
    if (roomRef) {
      updateDocumentNonBlocking(roomRef, { status: 'playing', startTime: Date.now() });
    }
  };

  const handleFinishBattle = () => {
    if (roomRef) {
      updateDocumentNonBlocking(roomRef, { status: 'finished' });
    }
  };
  
  if (isLoading || isRoomLoading || isAuthLoading || !authUser || !room || !quiz) {
    return (
        <div className="flex flex-col items-center justify-center h-screen p-4">
            <h1 className="text-2xl font-headline text-primary mb-4">Entering Arena...</h1>
            <Skeleton className="w-full max-w-lg h-64" />
        </div>
    );
  }
  
  const currentUserInRoom = room.participants.find(p => p.id === authUser.uid);

  if (!currentUserInRoom) {
     return (
        <div className="flex flex-col items-center justify-center h-screen p-4">
            <h1 className="text-2xl font-headline text-primary mb-4">Joining battle...</h1>
            <Skeleton className="w-full max-w-lg h-64" />
        </div>
    );
  }


  if (room.status === 'waiting') {
    return <WaitingRoom room={room} quiz={quiz} user={currentUserInRoom} onStart={handleStartBattle} />;
  }

  if (room.status === 'playing') {
    return <BattleRoom room={room} quiz={quiz} user={currentUserInRoom} onFinish={handleFinishBattle} />;
  }

  if (room.status === 'finished') {
    return <QuizResults room={room} quiz={quiz} />;
  }

  return notFound();
}
