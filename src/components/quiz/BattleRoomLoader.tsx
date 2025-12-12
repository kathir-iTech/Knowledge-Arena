
'use client';

import React, { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useDoc, useCollection, useFirestore } from '@/firebase';
import { doc, collection } from 'firebase/firestore';
import type { BattleRoom, BattleParticipation } from '@/lib/types';
import { Loader2, ShieldX } from 'lucide-react';
import LiveBattle from '@/components/quiz/LiveBattle';
import QuizResults from '@/components/quiz/QuizResults';
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

  const isTeacher = useMemo(() => room && user ? user.id === room.teacherId : false, [room, user]);

  // For Students: Reference to their own participation document
  const studentParticipationRef = useMemo(() => {
    if (!firestore || !roomCode || !user || isTeacher) return null;
    return doc(firestore, `battleRooms/${roomCode}/participants`, user.id);
  }, [firestore, roomCode, user, isTeacher]);
  const { data: studentParticipation, isLoading: isStudentPartLoading } = useDoc<BattleParticipation>(studentParticipationRef);

  // For Teachers: Reference to the entire participants collection
  const participantsCollectionRef = useMemo(() => {
    if (!firestore || !roomCode || !isTeacher) return null;
    return collection(firestore, `battleRooms/${roomCode}/participants`);
  }, [firestore, roomCode, isTeacher]);
  const { data: allParticipants, isLoading: areParticipantsLoading } = useCollection<BattleParticipation>(participantsCollectionRef);
  
   // For finished rooms, everyone can see the participants
  const finishedParticipantsCollectionRef = useMemo(() => {
    if (!firestore || !roomCode || room?.status !== 'finished') return null;
    return collection(firestore, `battleRooms/${roomCode}/participants`);
  }, [firestore, roomCode, room?.status]);
  const { data: finishedParticipants, isLoading: areFinishedParticipantsLoading } = useCollection<BattleParticipation>(finishedParticipantsCollectionRef);


  useEffect(() => {
    if (isRoomLoading || isAuthLoading || !room || !user || isStudentPartLoading) return;

    if (room.status === 'in-progress') {
      // If student is blocked, kick them.
      if (!isTeacher && studentParticipation?.isBlocked) {
        router.push('/kicked');
      }
      // If a student tries to join a valid room but doesn't have a participation doc created yet, it's fine.
      // They are in the process of joining. The check in StudentDashboard handles creation.
      // An explicit redirect here can cause loops.
    }
  }, [room, user, isTeacher, studentParticipation, isRoomLoading, isAuthLoading, isStudentPartLoading, router]);


  const isLoading = isAuthLoading || isRoomLoading || (isTeacher && areParticipantsLoading) || (!isTeacher && isStudentPartLoading) || (room?.status === 'finished' && areFinishedParticipantsLoading);

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
  
  if (!user) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin w-12 h-12"/></div>
  }
  
  switch (room.status) {
    case 'in-progress':
      return (
        <LiveBattle
          room={room}
          user={user}
          participation={studentParticipation}
          allParticipants={allParticipants}
          isTeacher={isTeacher}
        />
      );
    case 'finished':
       return <QuizResults room={room} isTeacher={isTeacher} participants={finishedParticipants || []} isLoading={areFinishedParticipantsLoading} />;
    default:
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 text-center">
            <h1 className="text-2xl font-bold">Invalid Room State</h1>
             <p className="text-muted-foreground">This room is in an unexpected state ({room.status}).</p>
            <Button onClick={() => router.push('/')}>Return to Dashboard</Button>
      </div>
      )
  }
}
