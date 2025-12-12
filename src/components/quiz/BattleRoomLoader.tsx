
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

  // For Teachers (or anyone viewing results): Reference to the entire participants collection
  const participantsCollectionRef = useMemo(() => {
    if (!firestore || !roomCode) return null;
    // Allow fetching only if teacher, or if the room is finished.
    // A student who finishes early cannot see the full leaderboard until the entire room is 'finished'.
    if (isTeacher || room?.status === 'finished') {
       return collection(firestore, `battleRooms/${roomCode}/participants`);
    }
    return null;
  }, [firestore, roomCode, isTeacher, room?.status]);
  const { data: allParticipants, isLoading: areParticipantsLoading } = useCollection<BattleParticipation>(participantsCollectionRef);
  
  useEffect(() => {
    // Redirect logic for invalid states, moved to a useEffect
    if (!isRoomLoading && !isAuthLoading) {
      if (room?.status === 'waiting') {
        if (isTeacher) {
          router.push('/teacher/dashboard');
        } else {
          router.push('/student/dashboard');
        }
      } else if (!isTeacher && studentParticipation?.isBlocked) {
        router.push('/kicked');
      }
    }
  }, [room?.status, isTeacher, router, isRoomLoading, isAuthLoading, studentParticipation?.isBlocked]);


  const isLoading = isAuthLoading || isRoomLoading || (isTeacher && areParticipantsLoading) || (!isTeacher && isStudentPartLoading);

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
    // Should be caught by ClientLayout, but as a fallback
    return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin w-12 h-12"/></div>
  }
  
  // If the overall battle is finished, show results to everyone.
  if (room.status === 'finished') {
    return <QuizResults room={room} isTeacher={isTeacher} participants={allParticipants || []} isLoading={areParticipantsLoading} />;
  }

  // If a student has finished their questions, but the overall battle is still in-progress, show them the results page early.
  // They will see their own rank, and the leaderboard will update as other players finish.
  if (studentParticipation?.status === 'finished') {
    // Pass only their own data if the full leaderboard isn't available yet.
    const participantsToShow = allParticipants || [studentParticipation];
    return <QuizResults room={room} isTeacher={isTeacher} participants={participantsToShow} isLoading={areParticipantsLoading} />;
  }

  // If we reach here, the battle is 'in-progress' and the student is 'playing'.
  return (
    <LiveBattle
      room={room}
      user={user}
      participation={studentParticipation}
      allParticipants={allParticipants} // Teacher gets the live list
      isTeacher={isTeacher}
    />
  );
}
