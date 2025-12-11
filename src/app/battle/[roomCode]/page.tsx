
"use client";

import { useState, useEffect } from 'react';
import { notFound, useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useFirestore, useMemoFirebase, useDoc, updateDocumentNonBlocking } from '@/firebase';
import type { Room, Quiz, User } from '@/lib/types';
import WaitingRoom from '@/components/quiz/WaitingRoom';
import BattleRoom from '@/components/quiz/BattleRoom';
import QuizResults from '@/components/quiz/QuizResults';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';

export default function BattlePage() {
  const params = useParams<{ roomCode: string }>();
  const { user: appUser, isLoading: isAuthLoading } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [isJoining, setIsJoining] = useState(true);
  
  const roomCode = params.roomCode.toUpperCase();

  // This useEffect handles joining the room and adding the user to the participants list.
  useEffect(() => {
    // Wait until we have the user and their role
    if (isAuthLoading || !firestore || !appUser || !roomCode) return;

    const joinRoom = async () => {
      const roomDocRef = doc(firestore, 'battleRooms', roomCode);

      try {
        // Optimistically try to add the user to the room.
        // `arrayUnion` is idempotent, so it won't add duplicates.
        // This is the only write operation needed for a user to join.
        // The security rules allow users to add themselves to the studentIds array.
        // We no longer need to read the document first to check for participation.
        await updateDoc(roomDocRef, {
          studentIds: arrayUnion(appUser.id)
        });

      } catch (error: any) {
        // If the update fails, it might be because the room doesn't exist
        // or a more restrictive security rule is in place.
        // Let's check if the room exists for a better error message.
        try {
            const roomDoc = await getDoc(roomDocRef);
            if (!roomDoc.exists()) {
                toast({ variant: 'destructive', title: 'Error', description: 'This battle room does not exist.' });
                router.push('/');
                return;
            }
        } catch (getErr) {
            console.error("Error checking room existence:", getErr);
        }

        console.error("Error joining room:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not join the battle room. You may not have permission.' });
        router.push('/');

      } finally {
        // Whether we succeeded or failed, the joining attempt is over.
        // This allows the useDoc hook below to proceed and fetch the room data.
        // If joining failed, useDoc will likely fail with a permission error,
        // which is expected and handled later in the component.
        setIsJoining(false);
      }
    };

    joinRoom();

  }, [isAuthLoading, firestore, appUser, roomCode, router, toast]);

  const roomRef = useMemoFirebase(() => {
    // Wait until joining attempt is complete before creating the ref
    if (isJoining || !firestore) return null;
    return doc(firestore, 'battleRooms', roomCode);
  }, [isJoining, firestore, roomCode]);

  const { data: room, isLoading: isRoomLoading, error: roomError } = useDoc<Room>(roomRef);
  
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [isQuizLoading, setIsQuizLoading] = useState(true);

  useEffect(() => {
    if (!room || !firestore) return;

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

  const [participants, setParticipants] = useState<User[]>([]);
  const [areParticipantsLoading, setAreParticipantsLoading] = useState(true);

  useEffect(() => {
    if (!room || !firestore || room.studentIds.length === 0) {
      if(room) setAreParticipantsLoading(false);
      return;
    };
    
    setAreParticipantsLoading(true);
    const participantPromises = room.studentIds.map(id => getDoc(doc(firestore, 'users', id)));
    Promise.all(participantPromises).then(participantDocs => {
      const participantData = participantDocs.filter(doc => doc.exists()).map(doc => ({ id: doc.id, ...doc.data() } as User));
      setParticipants(participantData);
      setAreParticipantsLoading(false);
    }).catch(err => {
      console.error("Error fetching participants:", err);
      setAreParticipantsLoading(false);
    })

  }, [room, firestore]);


  const handleStartBattle = () => {
    if (roomRef && firestore) {
      updateDocumentNonBlocking(roomRef, { status: 'playing', startTime: Date.now(), currentQuestionIndex: 0 });
    }
  };

  const handleFinishBattle = () => {
    if (roomRef && firestore) {
      updateDocumentNonBlocking(roomRef, { status: 'finished' });
    }
  };
  
  // Handle case where useDoc failed after joining attempt
  useEffect(() => {
      if(roomError) {
        toast({ variant: "destructive", title: "Access Denied", description: "You do not have permission to access this room." });
        router.push('/');
      }
  }, [roomError, router, toast]);
  
  if (isAuthLoading || isJoining || isRoomLoading || isQuizLoading || areParticipantsLoading || !appUser || !room || !quiz) {
    return (
        <div className="flex flex-col items-center justify-center h-screen p-4">
            <h1 className="text-2xl font-headline text-primary mb-4">Entering Arena...</h1>
            <Skeleton className="w-full max-w-lg h-64" />
        </div>
    );
  }
  
  const isTeacherObserver = appUser.id === room.teacherId;
  
  if (room.status === 'waiting') {
    return <WaitingRoom room={{...room, id: roomCode, participants: participants}} quiz={quiz} user={appUser} onStart={handleStartBattle} isTeacherObserver={isTeacherObserver} />;
  }

  if (room.status === 'playing') {
    return <BattleRoom room={{...room, id: roomCode}} quiz={quiz} user={appUser} onFinish={handleFinishBattle} isTeacherObserver={isTeacherObserver} />;
  }

  if (room.status === 'finished') {
    return <QuizResults room={{...room, id: roomCode, participants: participants}} quiz={quiz} />;
  }

  return notFound();
}
