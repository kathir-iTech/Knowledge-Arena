
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
        const roomDoc = await getDoc(roomDocRef);

        if (!roomDoc.exists()) {
          toast({ variant: 'destructive', title: 'Error', description: 'This battle room does not exist.' });
          router.push('/');
          return;
        }

        const roomData = roomDoc.data() as Room;
        const isParticipant = roomData.studentIds?.includes(appUser.id);
        const isTeacher = appUser.id === roomData.teacherId;
        
        // If the user is a student and not already in the studentIds array, add them.
        if (appUser.role === 'Student' && !isParticipant) {
           // This single update is what the security rules allow.
           await updateDoc(roomDocRef, {
             studentIds: arrayUnion(appUser.id)
           });
        }
        
        // If a teacher re-joins, their access is based on teacherId, but we add them to studentIds for consistency in participation tracking
        if(isTeacher && !isParticipant) {
           await updateDoc(roomDocRef, {
             studentIds: arrayUnion(appUser.id)
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

  }, [isAuthLoading, firestore, appUser, roomCode, router, toast]);

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
      const participantData = participantDocs.filter(doc => doc.exists()).map(doc => doc.data() as User);
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
  
  if (isAuthLoading || isJoining || isRoomLoading || isQuizLoading || areParticipantsLoading || !appUser || !room || !quiz) {
    return (
        <div className="flex flex-col items-center justify-center h-screen p-4">
            <h1 className="text-2xl font-headline text-primary mb-4">Entering Arena...</h1>
            <Skeleton className="w-full max-w-lg h-64" />
        </div>
    );
  }
  
  const isTeacher = appUser.role === 'Teacher';
  
  // After all loading, if the user is not in the studentIds array, they don't have access.
  if (!room.studentIds.includes(appUser.id)) {
     toast({ variant: "destructive", title: "Access Denied", description: "You do not have permission to access this room." });
     router.push('/');
     return null;
  }
  
  if (room.status === 'waiting') {
    return <WaitingRoom room={{...room, id: roomCode, participants: participants}} quiz={quiz} user={appUser} onStart={handleStartBattle} isTeacherObserver={isTeacher} />;
  }

  if (room.status === 'playing') {
    return <BattleRoom room={{...room, id: roomCode}} quiz={quiz} user={appUser} onFinish={handleFinishBattle} isTeacherObserver={isTeacher} />;
  }

  if (room.status === 'finished') {
    return <QuizResults room={{...room, id: roomCode, participants: participants}} quiz={quiz} />;
  }

  return notFound();
}
