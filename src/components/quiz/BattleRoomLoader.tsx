
'use client';

import React, { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useDoc, useCollection, useFirestore } from '@/firebase';
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

  const roomRef = useMemo(() => {
    if (!firestore || !roomCode) return null;
    return doc(firestore, 'battleRooms', roomCode as string);
  }, [firestore, roomCode]);

  const { data: room, isLoading: isRoomLoading, error: roomError } = useDoc<BattleRoom>(roomRef);

  const isTeacher = room && user ? user.id === room.teacherId : false;

  // This is the key change: This hook now runs for BOTH teacher and student when in the waiting room or finished.
  // The security rules have been updated to allow 'list' for anyone in a 'waiting' or 'finished' room.
  // The teacher also gets the list when the game is 'in-progress' for the live leaderboard.
  const participantsRef = useMemo(() => {
    if (!firestore || !roomCode) return null;
    if (room?.status === 'waiting' || room?.status === 'finished' || (isTeacher && room?.status === 'in-progress')) {
      return collection(firestore, `battleRooms/${roomCode}/participants`);
    }
    return null;
  }, [firestore, roomCode, room?.status, isTeacher]);

  const { data: participants, isLoading: areParticipantsLoading } = useCollection<BattleParticipation>(participantsRef);
  
  // This hook is ONLY for the student's individual data during the 'in-progress' state.
  const studentParticipationRef = useMemo(() => {
    if (!firestore || !roomCode || !user || isTeacher || room?.status !== 'in-progress') return null;
    return doc(firestore, 'battleRooms', roomCode as string, 'participants', user.id);
  }, [firestore, roomCode, user, isTeacher, room?.status]);
  
  const { data: studentParticipation, isLoading: isStudentParticipationLoading } = useDoc<BattleParticipation>(studentParticipationRef);

  const handleStartBattle = async () => {
    if (roomRef && isTeacher) {
      updateDocumentNonBlocking(roomRef, { status: 'in-progress', currentQuestionIndex: 0 });
    }
  };

  const handleFinishBattle = async () => {
    if (roomRef && isTeacher) {
      const finalParticipantCount = participants?.length || 0;
      updateDocumentNonBlocking(roomRef, { status: 'finished', participantCount: finalParticipantCount });
    }
  };

  // Simplified loading state
  const isLoading = 
    isAuthLoading || 
    isRoomLoading ||
    (!room) || // if room is not loaded yet, we are loading
    (room?.status === 'waiting' && areParticipantsLoading) ||
    (isTeacher && room?.status === 'in-progress' && areParticipantsLoading) ||
    (!isTeacher && room?.status === 'in-progress' && isStudentParticipationLoading);


  if (isLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Entering the Arena...</p>
      </div>
    );
  }
  
  if (roomError || !room) {
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
  
  // This check is now more robust for students.
  if (!isTeacher && studentParticipation?.isBlocked) {
    router.push('/kicked');
    return null;
  }
  
  // This check prevents students who haven't properly joined from seeing a battle in progress
  if (room.status === 'in-progress' && !isTeacher && !studentParticipation && !isStudentParticipationLoading) {
      router.push('/cheating-detected');
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
          allParticipants={participants} // Pass live participants list to teacher
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
