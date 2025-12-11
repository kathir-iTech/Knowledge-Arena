
"use client";

import { useState, useEffect } from 'react';
import { notFound, useRouter, useParams } from 'next/navigation';
import { useUser, useFirestore, useMemoFirebase, useDoc, updateDocumentNonBlocking } from '@/firebase';
import type { Room, Quiz, User } from '@/lib/types';
import WaitingRoom from '@/components/quiz/WaitingRoom';
import BattleRoom from '@/components/quiz/BattleRoom';
import QuizResults from '@/components/quiz/QuizResults';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, updateDoc, arrayUnion, writeBatch } from 'firebase/firestore';

export default function BattlePage() {
  const params = useParams<{ roomCode: string }>();
  const { user: authUser, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [isJoining, setIsJoining] = useState(true);
  
  const roomCode = params.roomCode.toUpperCase();
  const roomRef = useMemoFirebase(() => firestore ? doc(firestore, 'battleRooms', roomCode) : null, [firestore, roomCode]);
  const { data: room, isLoading: isRoomLoading } = useDoc<Room>(roomRef);
  
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [isQuizLoading, setIsQuizLoading] = useState(true);

  useEffect(() => {
    if (isAuthLoading || !firestore || !authUser || !roomCode) return;

    const joinRoom = async () => {
      const userRef = doc(firestore, 'users', authUser.uid);
      const roomDocRef = doc(firestore, 'battleRooms', roomCode);

      try {
        const [userDoc, roomDoc] = await Promise.all([getDoc(userRef), getDoc(roomDocRef)]);

        if (!roomDoc.exists()) {
          toast({ variant: 'destructive', title: 'Error', description: 'This battle room does not exist.' });
          router.push('/');
          return;
        }

        if (!userDoc.exists()) {
          toast({ variant: "destructive", title: "Error", description: "Could not find your user profile." });
          router.push('/');
          return;
        }

        const roomData = roomDoc.data() as Room;
        const userProfile = userDoc.data() as User;
        
        // Add student to participants if they are not already in and are not the teacher
        const isParticipant = roomData.participants.some(p => p.id === authUser.uid);
        if (userProfile.role === 'Student' && !isParticipant) {
           await updateDoc(roomDocRef, {
             participants: arrayUnion(userProfile)
           });
        }
      } catch (error) {
        console.error("Error joining room:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not join the battle room.' });
        router.push('/');
      } finally {
        setIsJoining(false);
      }
    };

    joinRoom();

  }, [isAuthLoading, firestore, authUser, roomCode, router, toast]);

  useEffect(() => {
    if (!room || !firestore) return;

    // Fetch the quiz associated with the room
    if(room.quizId && room.teacherId) {
        const quizRef = doc(firestore, `users/${room.teacherId}/quizzes`, room.quizId);
        getDoc(quizRef).then(quizDoc => {
          if (quizDoc.exists()) {
            setQuiz({ id: quizDoc.id, ...quizDoc.data() } as Quiz);
          } else {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not find the quiz for this room.' });
            router.push('/');
          }
          setIsQuizLoading(false);
        }).catch(err => {
            console.error("Error fetching quiz:", err);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to load the quiz.' });
            router.push('/');
            setIsQuizLoading(false);
        });
    } else if (!isRoomLoading) {
      toast({ variant: 'destructive', title: 'Error', description: 'This room is missing key information.' });
      router.push('/');
    }
  }, [room, isRoomLoading, firestore, router, toast]);


  const handleStartBattle = () => {
    if (roomRef) {
      updateDocumentNonBlocking(roomRef, { status: 'playing', startTime: Date.now(), currentQuestionIndex: 0 });
    }
  };

  const handleFinishBattle = () => {
    if (roomRef) {
      updateDocumentNonBlocking(roomRef, { status: 'finished' });
    }
  };
  
  if (isAuthLoading || isRoomLoading || isJoining || isQuizLoading || !authUser || !room || !quiz) {
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
            <h1 className="text-2xl font-headline text-primary mb-4">Finalizing entry...</h1>
            <Skeleton className="w-full max-w-lg h-64" />
        </div>
    );
  }


  if (room.status === 'waiting') {
    return <WaitingRoom room={{...room, id: roomCode}} quiz={quiz} user={currentUserInRoom} onStart={handleStartBattle} />;
  }

  if (room.status === 'playing') {
    return <BattleRoom room={{...room, id: roomCode}} quiz={quiz} user={currentUserInRoom} onFinish={handleFinishBattle} />;
  }

  if (room.status === 'finished') {
    return <QuizResults room={{...room, id: roomCode}} quiz={quiz} />;
  }

  return notFound();
}
