
"use client";

import { useState, useEffect } from 'react';
import { notFound, useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import type { Room, Quiz, User } from '@/lib/types';
import WaitingRoom from '@/components/quiz/WaitingRoom';
import BattleRoom from '@/components/quiz/BattleRoom';
import QuizResults from '@/components/quiz/QuizResults';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, updateDoc, arrayUnion, addDoc, collection, serverTimestamp } from 'firebase/firestore';

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
    
    // Teachers don't need to join, they are already in.
    if(appUser.role === 'Teacher') {
        setIsJoining(false);
        return;
    }

    const joinRoom = async () => {
      if (!firestore) return;
      const roomDocRef = doc(firestore, 'rooms', roomCode);
      const studentId = appUser.id;

      try {
        await updateDoc(roomDocRef, {
          studentIds: arrayUnion(studentId)
        });
        // success — proceed as normal
        setIsJoining(false);
      } catch (err: any) {
        console.error('Failed to add student to room:', err);
        toast({ variant: 'destructive', title: 'Could not join battle', description: 'You may not have permission to join this room, or it may not exist.' });
        router.push('/student/dashboard');
        return;
      }
    };

    joinRoom();

  }, [isAuthLoading, firestore, appUser, roomCode, router, toast]);

  const roomRef = useMemoFirebase(() => {
    if (isJoining || !firestore) return null;
    return doc(firestore, 'rooms', roomCode);
  }, [isJoining, firestore, roomCode]);

  const { data: room, isLoading: isRoomLoading, error: roomError } = useDoc<Room>(roomRef);

  const [participants, setParticipants] = useState<User[]>([]);
  const [areParticipantsLoading, setAreParticipantsLoading] = useState(true);

  useEffect(() => {
    if (!room || !firestore || !room.studentIds || room.studentIds.length === 0) {
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
      updateDoc(roomRef, { status: 'playing', startTime: Date.now(), currentQuestionIndex: 0 });
    }
  };

  const handleFinishBattle = () => {
    if (roomRef && firestore) {
      updateDoc(roomRef, { status: 'finished' });
    }
  };
  
  useEffect(() => {
      if(roomError) {
        toast({ variant: "destructive", title: "Access Denied", description: "You do not have permission to access this room." });
        router.push('/');
      }
  }, [roomError, router, toast]);
  
  // Explicitly check for room and room.quiz before rendering children
  if (isAuthLoading || isJoining || isRoomLoading || areParticipantsLoading || !appUser || !room || !room.quiz) {
    return (
        <div className="flex flex-col items-center justify-center h-screen p-4">
            <h1 className="text-2xl font-headline text-primary mb-4">Entering Arena...</h1>
            <Skeleton className="w-full max-w-lg h-64" />
        </div>
    );
  }

  // If a teacher tries to access a room that is not theirs, deny access.
  if (appUser.role === 'Teacher' && appUser.id !== room.teacherId) {
    toast({ variant: "destructive", title: "Access Denied", description: "You cannot join a battle created by another teacher." });
    router.push('/teacher/dashboard');
    return null;
  }
  
  const isTeacherObserver = appUser.id === room.teacherId;
  const quiz = room.quiz; // The quiz is now embedded in the room document
  
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
