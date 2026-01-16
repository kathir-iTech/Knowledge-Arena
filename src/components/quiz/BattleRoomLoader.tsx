
'use client';

import React, { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useDoc, useFirestore } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { Battle, BattleParticipant } from '@/lib/types';
import { Loader2, ShieldX } from 'lucide-react';
import LiveBattle from '@/components/quiz/LiveBattle';
import QuizResults from '@/components/quiz/QuizResults';
import WaitingRoom from '@/components/quiz/WaitingRoom';
import { Button } from '../ui/button';

export default function BattleRoomLoader() {
  const { roomCode } = useParams();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const firestore = useFirestore();

  const battleId = roomCode as string;

  // Reference to the main battle document
  const battleRef = useMemo(() => {
    if (!firestore || !battleId) return null;
    return doc(firestore, 'battles', battleId);
  }, [firestore, battleId]);
  const { data: battle, isLoading: isBattleLoading, error: battleError } = useDoc<Battle>(battleRef);

  // Reference to the current user's participant document
  const participantRef = useMemo(() => {
    if (!firestore || !battleId || !user) return null;
    return doc(firestore, `battles/${battleId}/participants`, user.id);
  }, [firestore, battleId, user]);
  const { data: participant, isLoading: isParticipantLoading } = useDoc<BattleParticipant>(participantRef);

  const isTeacher = useMemo(() => participant?.role === 'teacher', [participant]);

  // Redirect if blocked
  React.useEffect(() => {
    if (participant?.status === 'blocked') {
      router.push('/kicked');
    }
  }, [participant, router]);

  const isLoading = isAuthLoading || isBattleLoading || isParticipantLoading;

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Entering the Arena...</p>
      </div>
    );
  }
  
  if (battleError || !battle) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 text-center">
        <ShieldX className="h-12 w-12 text-destructive" />
        <h1 className="text-2xl font-bold">Room Not Found</h1>
        <p className="text-muted-foreground">This battle room does not exist or has been closed.</p>
        <Button onClick={() => router.push('/')}>Return to Dashboard</Button>
      </div>
    );
  }
  
  if (!user || !participant) {
    // This can happen briefly while the participant doc is being created.
    // A loading state is appropriate.
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Joining Battle...</p>
      </div>
    );
  }
  
  // --- Render based on battle state ---

  if (battle.state === 'waiting') {
    return (
      <WaitingRoom
        battle={battle}
        isTeacher={isTeacher}
      />
    );
  }
  
  if (battle.state === 'finished') {
    return <QuizResults battle={battle} />;
  }

  if (battle.state === 'live') {
    return (
        <LiveBattle
            battle={battle}
            participant={participant}
            isTeacher={isTeacher}
        />
    );
  }

  // Fallback for any unknown state
  return (
    <div className="flex h-screen items-center justify-center">
        <p>An unknown error occurred. Please try returning to the dashboard.</p>
        <Button onClick={() => router.push('/')} className='mt-4'>Dashboard</Button>
    </div>
  )
}
