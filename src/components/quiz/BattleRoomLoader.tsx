
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

  const isTeacher = useMemo(() => room && user ? user.id === room.teacherId : false, [room, user]);

  const participantsRef = useMemo(() => {
    if (!firestore || !roomCode) return null;
    return collection(firestore, `battleRooms/${roomCode}/participants`);
  }, [firestore, roomCode]);

  const { data: participants, isLoading: areParticipantsLoading } = useCollection<BattleParticipation>(participantsRef);
  
  const studentParticipation = useMemo(() => {
    if (isTeacher || !participants || !user) return undefined;
    return participants.find(p => p.studentId === user.id);
  }, [participants, user, isTeacher]);

  const handleFinishBattle = () => {
    if (roomRef && isTeacher) {
      const finalParticipantCount = participants?.length || 0;
      updateDocumentNonBlocking(roomRef, { status: 'finished', participantCount: finalParticipantCount });
    }
  };

  useEffect(() => {
    if (isRoomLoading || isAuthLoading || !room || !user) return;

    // Handle redirects as a side effect
    if (room.status === 'waiting') {
      if (isTeacher) {
        router.push('/teacher/dashboard');
      } else {
        router.push('/student/dashboard');
      }
    } else if (room.status === 'in-progress') {
      if (!isTeacher && studentParticipation?.isBlocked) {
        router.push('/kicked');
      } else if (!isTeacher && !studentParticipation && !areParticipantsLoading) {
        router.push('/cheating-detected');
      }
    }
  }, [room, user, isTeacher, studentParticipation, isRoomLoading, isAuthLoading, areParticipantsLoading, router]);


  const isLoading = isAuthLoading || isRoomLoading;

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

  // Render a loading state while redirecting
  if (room.status === 'waiting' || (room.status === 'in-progress' && !isTeacher && (studentParticipation?.isBlocked || (!studentParticipation && !areParticipantsLoading)))) {
      return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin w-12 h-12"/></div>;
  }
  
  switch (room.status) {
    case 'in-progress':
      return (
        <LiveBattle
          room={room}
          user={user}
          participation={studentParticipation}
          allParticipants={participants}
          onFinishBattle={handleFinishBattle}
          isTeacher={isTeacher}
        />
      );
    case 'finished':
       return <QuizResults room={room} isTeacher={isTeacher} participants={participants || []} isLoading={areParticipantsLoading} />;
    default:
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 text-center">
            <h1 className="text-2xl font-bold">Invalid Room State</h1>
            <Button onClick={() => router.push('/')}>Return to Dashboard</Button>
      </div>
      )
  }
}
