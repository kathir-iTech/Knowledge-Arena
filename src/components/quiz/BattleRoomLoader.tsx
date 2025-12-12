'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useDoc, useCollection } from '@/firebase';
import { doc, collection, updateDoc, writeBatch } from 'firebase/firestore';
import type { BattleRoom, BattleParticipation } from '@/lib/types';
import { Loader2, ShieldX } from 'lucide-react';
import WaitingRoom from '@/components/quiz/WaitingRoom';
import LiveBattle from '@/components/quiz/LiveBattle';
import QuizResults from '@/components/quiz/QuizResults';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useMemoFirebase } from '@/firebase';

export default function BattleRoomLoader() {
  const { roomCode } = useParams();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const firestore = useMemoFirebase(() => useFirestore(), []);

  const roomRef = useMemoFirebase(() => {
    if (!firestore || !roomCode) return null;
    return doc(firestore, 'battleRooms', roomCode as string);
  }, [firestore, roomCode]);

  const participantsRef = useMemoFirebase(() => {
    if (!firestore || !roomCode) return null;
    return collection(firestore, `battleRooms/${roomCode}/participants`);
  }, [firestore, roomCode]);

  const { data: room, isLoading: isRoomLoading, error: roomError } = useDoc<BattleRoom>(roomRef);
  const { data: participants, isLoading: areParticipantsLoading } = useCollection<BattleParticipation>(participantsRef);

  const [localStatus, setLocalStatus] = useState<'loading' | 'error' | 'waiting' | 'in-progress' | 'finished'>('loading');

  useEffect(() => {
    if (isRoomLoading || areParticipantsLoading) {
      setLocalStatus('loading');
    } else if (roomError) {
      console.error(roomError);
      setLocalStatus('error');
    } else if (room) {
      setLocalStatus(room.status);
    } else if (!isRoomLoading && !room) {
        // If room isn't loading but is null, it doesn't exist
        setLocalStatus('error');
    }
  }, [room, isRoomLoading, roomError, areParticipantsLoading]);


  const handleStartBattle = async () => {
    if (roomRef) {
      updateDocumentNonBlocking(roomRef, { status: 'in-progress' });
    }
  };

  const handleFinishBattle = async () => {
    if (roomRef) {
      updateDocumentNonBlocking(roomRef, { status: 'finished' });
    }
  };


  if (isAuthLoading || localStatus === 'loading') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Entering the Arena...</p>
      </div>
    );
  }
  
  if (localStatus === 'error' || !room || !user || !room.quiz) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 text-center">
        <ShieldX className="h-12 w-12 text-destructive" />
        <h1 className="text-2xl font-bold">Room Not Found</h1>
        <p className="text-muted-foreground">This battle room does not exist or has been closed.</p>
        <Button onClick={() => router.push('/')}>Return to Dashboard</Button>
      </div>
    );
  }

  const isTeacher = user.id === room.teacherId;
  const studentParticipation = participants?.find(p => p.studentId === user.id);
  
  // If a student who is not in the participants list tries to access, they're not allowed.
  // This can happen if they navigate directly without joining.
  if (!isTeacher && !isAuthLoading && !areParticipantsLoading && !studentParticipation) {
    router.push('/cheating-detected');
    return null;
  }
  
  if (studentParticipation?.isBlocked) {
      router.push('/kicked');
      return null;
  }

  switch (localStatus) {
    case 'waiting':
      return (
        <WaitingRoom
          room={room}
          participants={participants || []}
          onStartBattle={handleStartBattle}
          isTeacher={isTeacher}
        />
      );
    case 'in-progress':
      return (
        <LiveBattle
          room={room}
          user={user}
          participation={studentParticipation}
          onFinishBattle={handleFinishBattle}
          isTeacher={isTeacher}
        />
      );
    case 'finished':
      return <QuizResults room={room} participants={participants || []} />;
    default:
      return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin"/></div>
  }
}
