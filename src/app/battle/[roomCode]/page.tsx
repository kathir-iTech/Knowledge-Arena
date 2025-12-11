
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
import { doc, getDoc, updateDoc, arrayUnion, collection } from 'firebase/firestore';

export default function BattlePage() {
  const params = useParams<{ roomCode: string }>();
  const { user: authUser, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const roomRef = useMemoFirebase(() => firestore ? doc(firestore, 'battleRooms', params.roomCode) : null, [firestore, params.roomCode]);
  const { data: room, isLoading: isRoomLoading, error: roomError } = useDoc<Room>(roomRef);

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [isJoining, setIsJoining] = useState(true);
  const [isQuizLoading, setIsQuizLoading] = useState(true);

  useEffect(() => {
    if (isAuthLoading || isRoomLoading || !firestore) return;

    if (!room && !isRoomLoading) {
      toast({ variant: 'destructive', title: 'Error', description: 'This battle room does not exist.' });
      router.push('/');
      return;
    }

    if (authUser && room) {
        // Fetch user profile to get latest details
        const userRef = doc(firestore, 'users', authUser.uid);
        getDoc(userRef).then(userDoc => {
             if (!userDoc.exists()) {
                toast({ variant: "destructive", title: "Error", description: "Could not find your user profile." });
                router.push('/');
                return;
            }
            const userProfile = userDoc.data() as User;
            
            // Check if user is already a participant
            if (!room.participants.some(p => p.id === authUser.uid)) {
                 updateDoc(roomRef!, {
                    participants: arrayUnion(userProfile)
                }).catch(err => console.error("Failed to add participant:", err));
            }
            setIsJoining(false);
        });

      // Fetch the quiz associated with the room
      if(room.quizId && room.createdBy) {
          const quizRef = doc(firestore, `users/${room.createdBy}/quizzes`, room.quizId);
          getDoc(quizRef).then(quizDoc => {
            if (quizDoc.exists()) {
              setQuiz({ id: quizDoc.id, ...quizDoc.data() } as Quiz);
            } else {
              toast({ variant: 'destructive', title: 'Error', description: 'Could not find the quiz for this room.' });
              router.push('/');
            }
            setIsQuizLoading(false);
          });
      } else {
         // Backwards compatibility for rooms made before createdBy was added.
         const quizRef = doc(firestore, 'quizzes', room.quizId);
          getDoc(quizRef).then(quizDoc => {
            if (quizDoc.exists()) {
              setQuiz({ id: quizDoc.id, ...quizDoc.data() } as Quiz);
            } else {
              toast({ variant: 'destructive', title: 'Error', description: 'Could not find the quiz for this room.' });
              router.push('/');
            }
            setIsQuizLoading(false);
          });
      }
    }

  }, [room, isRoomLoading, authUser, isAuthLoading, router, toast, firestore, params.roomCode, roomRef]);


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
            <h1 className="text-2xl font-headline text-primary mb-4">Joining battle...</h1>
            <Skeleton className="w-full max-w-lg h-64" />
        </div>
    );
  }


  if (room.status === 'waiting') {
    return <WaitingRoom room={{...room, id: params.roomCode}} quiz={quiz} user={currentUserInRoom} onStart={handleStartBattle} />;
  }

  if (room.status === 'playing') {
    return <BattleRoom room={{...room, id: params.roomCode}} quiz={quiz} user={currentUserInRoom} onFinish={handleFinishBattle} />;
  }

  if (room.status === 'finished') {
    return <QuizResults room={{...room, id: params.roomCode}} quiz={quiz} />;
  }

  return notFound();
}
