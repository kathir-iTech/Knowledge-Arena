
"use client";

import { useState, useEffect } from 'react';
import { notFound, useRouter, useParams } from 'next/navigation';
import { useUser, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
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

        // If the user is a student and not already in the studentIds array, add them.
        if (userProfile.role === 'Student' && !isParticipant) {
           await updateDoc(roomDocRef, {
             studentIds: arrayUnion(authUser.uid),
             // Also add their profile to the participants array for display purposes
             participants: arrayUnion({
                id: userProfile.id,
                name: userProfile.name,
                email: userProfile.email,
                avatar: userProfile.avatar,
                role: userProfile.role,
                xp: userProfile.xp,
             })
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
      updateDoc(roomRef, { status: 'playing', startTime: Date.now(), currentQuestionIndex: 0 });
    }
  };

  const handleFinishBattle = () => {
    if (roomRef && firestore) {
      updateDoc(roomRef, { status: 'finished' });
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
  const currentUserInRoom = room.participants.find(p => p.id === authUser.uid);

  // If after joining, the user is still not in the participant list (and is not the teacher), there's a problem.
  if (!isTeacher && !room.studentIds?.includes(authUser.uid) && !isJoining) {
     toast({ variant: "destructive", title: "Access Denied", description: "You are not a participant in this room." });
     router.push('/');
     return null;
  }
  
  // The teacher can observe but their full profile might not be in the `participants` if they rejoined.
  // We allow them to proceed if they are the teacher.
  // For students, their `currentUserInRoom` profile is required.
  if (!currentUserInRoom && !isTeacher) {
      if (!isJoining) {
        toast({ variant: "destructive", title: "Error", description: "Your profile could not be loaded for this battle." });
        router.push('/');
        return null;
      }
      return (
        <div className="flex flex-col items-center justify-center h-screen p-4">
            <h1 className="text-2xl font-headline text-primary mb-4">Finalizing Entry...</h1>
            <Skeleton className="w-full max-w-lg h-64" />
        </div>
      );
  }

  if (room.status === 'waiting') {
    return <WaitingRoom room={{...room, id: roomCode}} quiz={quiz} user={currentUserInRoom || user} onStart={handleStartBattle} isTeacherObserver={isTeacher} />;
  }

  if (room.status === 'playing') {
    return <BattleRoom room={{...room, id: roomCode}} quiz={quiz} user={currentUserInRoom || user} onFinish={handleFinishBattle} isTeacherObserver={isTeacher} />;
  }

  if (room.status === 'finished') {
    return <QuizResults room={{...room, id: roomCode}} quiz={quiz} />;
  }

  return notFound();
}
