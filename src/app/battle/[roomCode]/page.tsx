
"use client";

import { useState, useEffect } from 'react';
import { notFound, useRouter, useParams } from 'next/navigation';
import { useAuth as useAppAuth } from '@/hooks/useAuth';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import type { Room } from '@/lib/types';
import WaitingRoom from '@/components/quiz/WaitingRoom';
import BattleRoom from '@/components/quiz/BattleRoom';
import QuizResults from '@/components/quiz/QuizResults';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';

export default function BattlePage() {
  const params = useParams<{ roomCode: string }>();
  const { user: appUser, isLoading: isAuthLoading } = useAppAuth();
  const { firestore } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const [isJoining, setIsJoining] = useState(true);
  
  const roomCode = params.roomCode.toUpperCase();

  useEffect(() => {
    if (isAuthLoading || !firestore || !appUser || !roomCode) return;

    if (appUser.role === 'Teacher') {
        setIsJoining(false);
        return;
    }

    const joinRoom = async () => {
      const roomDocRef = doc(firestore, 'battleRooms', roomCode);
      const studentId = appUser.id;

      try {
        const roomSnap = await getDoc(roomDocRef);
        if (!roomSnap.exists()) {
             toast({ variant: 'destructive', title: 'Room Not Found', description: 'This battle room does not exist.' });
             router.push('/student/dashboard');
             return;
        }
        
        const roomData = roomSnap.data() as Room;
        if(roomData.studentIds.includes(studentId)) {
            setIsJoining(false);
            return;
        }

        await updateDoc(roomDocRef, {
          studentIds: arrayUnion(studentId)
        });
        setIsJoining(false);
      } catch (err: any) {
        console.error('Failed to add student to room:', err);
        toast({ variant: 'destructive', title: 'Could not join battle', description: 'You may not have permission to join this room, or it may no longer be active.' });
        router.push('/cheating-detected');
      }
    };

    joinRoom();

  }, [isAuthLoading, firestore, appUser, roomCode, router, toast]);

  const roomRef = useMemoFirebase(() => {
    if (isJoining || !firestore) return null;
    return doc(firestore, 'battleRooms', roomCode);
  }, [isJoining, firestore, roomCode]);

  const { data: room, isLoading: isRoomLoading, error: roomError } = useDoc<Room>(roomRef);

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
  
  if (isAuthLoading || isJoining || isRoomLoading || !appUser) {
    return (
        <div className="flex flex-col items-center justify-center h-screen p-4">
            <h1 className="text-2xl font-headline text-primary mb-4">Entering Arena...</h1>
            <Skeleton className="w-full max-w-lg h-64" />
        </div>
    );
  }
  
  if (!room) {
    return (
       <div className="flex flex-col items-center justify-center h-screen p-4">
            <h1 className="text-2xl font-headline text-destructive mb-4">Battle Not Found</h1>
            <p className="text-muted-foreground">The room <span className="font-mono text-primary">{roomCode}</span> could not be found.</p>
            <Button onClick={() => router.push('/')} className="mt-4">Go to Dashboard</Button>
        </div>
    )
  }

  if (appUser.role === 'Teacher' && appUser.id !== room.teacherId) {
    toast({ variant: "destructive", title: "Access Denied", description: "You cannot join a battle created by another teacher." });
    router.push('/teacher/dashboard');
    return null;
  }
  
  const isTeacherObserver = appUser.id === room.teacherId;
  const quiz = room.quiz;
  
  if (!quiz) {
     return (
       <div className="flex flex-col items-center justify-center h-screen p-4">
            <h1 className="text-2xl font-headline text-destructive mb-4">Quiz Data Missing</h1>
            <p className="text-muted-foreground">The quiz for this battle room could not be loaded.</p>
        </div>
    )
  }

  if (room.status === 'waiting') {
    return <WaitingRoom room={{...room, id: roomCode}} quiz={quiz} user={appUser} onStart={handleStartBattle} isTeacherObserver={isTeacherObserver} />;
  }

  if (room.status === 'playing') {
    return <BattleRoom room={{...room, id: roomCode}} quiz={quiz} user={appUser} onFinish={handleFinishBattle} isTeacherObserver={isTeacherObserver} />;
  }

  if (room.status === 'finished') {
    return <QuizResults room={{...room, id: roomCode}} quiz={quiz} />;
  }

  return notFound();
}
