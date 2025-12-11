
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
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';

export default function BattlePage() {
  const params = useParams<{ roomCode: string }>();
  const { user: authUser, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [isJoining, setIsJoining] = useState(true);
  
  const roomCode = params.roomCode.toUpperCase();

  // This useEffect handles joining the room and adding the user to the participants list.
  // It runs before the useDoc hook tries to fetch the room data.
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
        
        const isParticipant = roomData.studentIds?.includes(authUser.uid);
        const isTeacher = authUser.uid === roomData.teacherId;

        // If the user is a student and not already in the studentIds array, add them.
        if (userProfile.role === 'Student' && !isParticipant) {
           // This single update is what the security rules allow.
           await updateDoc(roomDocRef, {
             studentIds: arrayUnion(authUser.uid)
           });
        }
        
        // If the teacher re-joins, we don't need to do anything as their access is based on teacherId
        if(isTeacher && !isParticipant) {
            await updateDoc(roomDocRef, {
             studentIds: arrayUnion(authUser.uid)
           });
        }
        
      } catch (error) {
        console.error("Error joining room:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not join the battle room.' });
        router.push('/');
      } finally {
        setIsJoining(false); // Finished joining, allow useDoc to proceed
      }
    };

    joinRoom();

  }, [isAuthLoading, firestore, authUser, roomCode, router, toast]);

  const roomRef = useMemoFirebase(() => {
    // Wait until joining is complete before creating the ref
    if (isJoining || !firestore) return null;
    return doc(firestore, 'battleRooms', roomCode);
  }, [isJoining, firestore, roomCode]);

  const { data: room, isLoading: isRoomLoading } = useDoc<Room>(roomRef);
  
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
  
  if (isAuthLoading || isJoining || isRoomLoading || isQuizLoading || !authUser || !room || !quiz) {
    return (
        <div className="flex flex-col items-center justify-center h-screen p-4">
            <h1 className="text-2xl font-headline text-primary mb-4">Entering Arena...</h1>
            <Skeleton className="w-full max-w-lg h-64" />
        </div>
    );
  }
  
  const isTeacher = authUser.uid === room.teacherId;
  const isParticipant = room.studentIds?.includes(authUser.uid);

  // If after joining, the user is still not a participant, there's a problem.
  if (!isParticipant && !isJoining) {
     toast({ variant: "destructive", title: "Access Denied", description: "You are not a participant in this room." });
     router.push('/');
     return null;
  }
  
  const currentUser = isTeacher ? { ...authUser, ...room.participants.find(p => p.id === authUser.uid) } : room.participants.find(p => p.id === authUser.uid);


  if (!currentUser && !isJoining) {
      toast({ variant: "destructive", title: "Error", description: "Your profile could not be loaded for this battle." });
      router.push('/');
      return null;
  }

  if (room.status === 'waiting') {
    return <WaitingRoom room={{...room, id: roomCode}} quiz={quiz} user={currentUser} onStart={handleStartBattle} isTeacherObserver={isTeacher} />;
  }

  if (room.status === 'playing') {
    return <BattleRoom room={{...room, id: roomCode}} quiz={quiz} user={currentUser} onFinish={handleFinishBattle} isTeacherObserver={isTeacher} />;
  }

  if (room.status === 'finished') {
    return <QuizResults room={{...room, id: roomCode}} quiz={quiz} />;
  }

  return notFound();
}
