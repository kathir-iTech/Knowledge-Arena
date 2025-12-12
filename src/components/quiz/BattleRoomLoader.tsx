
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

  // Determine if the user is the teacher for this room *after* room data is loaded.
  const isTeacher = room && user ? user.id === room.teacherId : false;

  // This collection listener is now for BOTH teacher and student, to get live updates for the room.
  const participantsRef = useMemoFirebase(() => {
    if (!firestore || !roomCode || !isTeacher) return null;
    // Only fetch the collection if the user is a teacher.
    return collection(firestore, `battleRooms/${roomCode}/participants`);
  }, [firestore, roomCode, isTeacher]);

  const { data: participants, isLoading: areParticipantsLoading } = useCollection<BattleParticipation>(participantsRef);
  
  const studentParticipationRef = useMemoFirebase(() => {
    if (!firestore || !roomCode || !user || isTeacher) return null;
    return doc(firestore, 'battleRooms', roomCode as string, 'participants', user.id);
  }, [firestore, roomCode, user, isTeacher]);
  
  const { data: studentParticipation, isLoading: isStudentParticipationLoading } = useDoc<BattleParticipation>(studentParticipationRef);

  const handleStartBattle = async () => {
    if (roomRef) {
      updateDocumentNonBlocking(roomRef, { status: 'in-progress', currentQuestionIndex: 0 });
    }
  };

  const handleFinishBattle = async () => {
    if (roomRef) {
      const finalParticipantCount = participants?.length || 0;
      updateDocumentNonBlocking(roomRef, { status: 'finished', participantCount: finalParticipantCount });
    }
  };

  // Consolidate loading states
  const isLoading = isAuthLoading || isRoomLoading || (!isTeacher && isStudentParticipationLoading);


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
  
  if (!isTeacher && studentParticipation?.isBlocked) {
    router.push('/kicked');
    return null;
  }
  
  // This check is for students joining a battle that has already started, or if their participation doc failed to create.
  if (room.status !== 'waiting' && !isTeacher && !studentParticipation && !isStudentParticipationLoading) {
      router.push('/cheating-detected'); // Or a different page like "Battle in Progress"
      return null;
  }
  
  switch (room.status) {
    case 'waiting':
      return (
        <WaitingRoom
          room={room}
          participants={participants || []}
          onStartBattle={handleStartBattle}
          isTeacher={isTeacher}
          areParticipantsLoading={areParticipantsLoading}
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
       return <QuizResults room={room} isTeacher={isTeacher} />;
    default:
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 text-center">
            <h1 className="text-2xl font-bold">Invalid Room State</h1>
            <Button onClick={() => router.push('/')}>Return to Dashboard</Button>
      </div>
      )
  }
}
