
'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useDoc, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, collection } from 'firebase/firestore';
import type { BattleRoom, BattleParticipation } from '@/lib/types';
import { Loader2, ShieldX } from 'lucide-react';
import WaitingRoom from '@/components/quiz/WaitingRoom';
import LiveBattle from '@/components/quiz/LiveBattle';
import QuizResults from '@/components/quiz/QuizResults';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Button } from '../ui/button';

export default function BattleRoomLoader() {
  const { roomCode } = useParams();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const firestore = useFirestore();

  const roomRef = useMemoFirebase(() => {
    if (!firestore || !roomCode) return null;
    return doc(firestore, 'battleRooms', roomCode as string);
  }, [firestore, roomCode]);

  const { data: room, isLoading: isRoomLoading, error: roomError } = useDoc<BattleRoom>(roomRef);

  // This ref is now used by everyone to fetch participants, but rules will control access.
  const participantsRef = useMemoFirebase(() => {
    if (!firestore || !roomCode ) return null;
    return collection(firestore, `battleRooms/${roomCode}/participants`);
  }, [firestore, roomCode]);

  const { data: participants, isLoading: areParticipantsLoading } = useCollection<BattleParticipation>(participantsRef);
  
  // Specific hook for the student's own participation document
  const studentParticipationRef = useMemoFirebase(() => {
    if (!firestore || !roomCode || !user || (room && user.id === room.teacherId)) return null;
    return doc(firestore, 'battleRooms', roomCode as string, 'participants', user.id);
  }, [firestore, roomCode, user, room]);
  
  const { data: studentParticipation, isLoading: isStudentParticipationLoading } = useDoc<BattleParticipation>(studentParticipationRef);

  const localStatus = room?.status || 'loading';
  const isTeacher = !!user && !!room && user.id === room.teacherId;

  const handleStartBattle = async () => {
    if (roomRef) {
      updateDocumentNonBlocking(roomRef, { status: 'in-progress' });
    }
  };

  const handleFinishBattle = async () => {
    if (roomRef) {
      const finalParticipantCount = participants?.length || 0;
      updateDocumentNonBlocking(roomRef, { status: 'finished', participantCount: finalParticipantCount });
    }
  };

  // Consolidate loading states
  const isLoading = isAuthLoading || isRoomLoading || areParticipantsLoading || (!!user && !isTeacher && isStudentParticipationLoading);

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Entering the Arena...</p>
      </div>
    );
  }
  
  if (roomError || (!isRoomLoading && !room)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 text-center">
        <ShieldX className="h-12 w-12 text-destructive" />
        <h1 className="text-2xl font-bold">Room Not Found</h1>
        <p className="text-muted-foreground">This battle room does not exist or has been closed.</p>
        <Button onClick={() => router.push('/')}>Return to Dashboard</Button>
      </div>
    );
  }

  if (!user || !room.quiz) {
     return (
      <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin w-12 h-12"/></div>
     )
  }
  
  if (localStatus === 'finished') {
    return <QuizResults room={room} isTeacher={isTeacher} />;
  }

  if (!isTeacher && !studentParticipation) {
     if (!isStudentParticipationLoading) {
      router.push('/cheating-detected');
      return null;
    }
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
          // The `participants` from useCollection will be live for the teacher.
          // Students will see an empty list (due to rules), but that's okay for the waiting room UI.
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
    default:
      return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin w-12 h-12"/></div>
  }
}
