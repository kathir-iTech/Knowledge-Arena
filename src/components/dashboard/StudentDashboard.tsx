
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2, Swords } from 'lucide-react';
import type { BattleRoom, BattleParticipation } from '@/lib/types';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';

export default function StudentDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();

  const [roomCode, setRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleJoinBattle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim() || !firestore || !user) return;

    setIsLoading(true);
    const roomCodeUpper = roomCode.trim().toUpperCase();

    try {
      const roomRef = doc(firestore, 'battleRooms', roomCodeUpper);
      const roomSnap = await getDoc(roomRef);

      if (!roomSnap.exists()) {
        toast({
          variant: 'destructive',
          title: 'Room Not Found',
          description: `The battle room with code "${roomCodeUpper}" does not exist.`,
        });
        setIsLoading(false);
        return;
      }
      
      const roomData = roomSnap.data() as BattleRoom;
      if (roomData.status === 'finished') {
        toast({
            variant: 'destructive',
            title: 'Battle Finished',
            description: `This battle has already ended.`,
        });
        setIsLoading(false);
        return;
      }
      
      const participantRef = doc(firestore, 'battleRooms', roomCodeUpper, 'participants', user.id);
      const participantSnap = await getDoc(participantRef);

      if (participantSnap.exists()) {
          const participantData = participantSnap.data() as BattleParticipation;
          if (participantData.isBlocked) {
              toast({
                  variant: 'destructive',
                  title: 'Action Denied',
                  description: 'You are blocked from this battle due to malpractice. Please ask your teacher to reset your attempt.',
              });
              setIsLoading(false);
              return;
          }
          if (participantData.status === 'finished') {
            toast({
                variant: 'destructive',
                title: 'Battle Already Completed',
                description: 'You have already completed this battle. You cannot re-enter.',
            });
            setIsLoading(false);
            return;
        }
      }
      
      const newParticipant: BattleParticipation = {
        id: user.id,
        studentId: user.id,
        studentName: user.name,
        studentAvatar: user.avatar,
        battleRoomId: roomCodeUpper,
        status: 'playing',
        answers: [],
        totalScore: 0,
        malpracticeCount: 0,
        isBlocked: false,
        currentQuestionIndex: 0,
      };

      setDocumentNonBlocking(participantRef, newParticipant, { merge: true });
      
      router.push(`/battle/${roomCodeUpper}`);

    } catch (error: any) {
       console.error("Failed to join battle:", error);
       if (error.code === 'permission-denied') {
            router.push('/cheating-detected');
       } else {
            toast({
                variant: 'destructive',
                title: 'Error Joining Battle',
                description: 'An unexpected error occurred. Please try again.',
            });
       }
       setIsLoading(false);
    }
  };

  if (!user) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="w-16 h-16 animate-spin" /></div>;
  }

  return (
    <div className="p-4 md:p-8 space-y-8">
       <header>
        <h1 className="text-4xl font-headline tracking-tight text-primary">Student Dashboard</h1>
        <p className="text-muted-foreground">Welcome, Gladiator {user.name}. Your next challenge awaits.</p>
      </header>

       <div className="flex justify-center px-4">
         <Card className="w-full max-w-md border-accent/50 shadow-lg shadow-accent/10">
          <CardHeader>
            <CardTitle className="font-headline text-center text-2xl">Enter the Arena</CardTitle>
            <CardDescription className="text-center">Enter the code provided by your teacher to join the battle.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoinBattle} className="space-y-4">
              <Input
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                placeholder="ROOM CODE"
                className="text-center text-2xl h-14 tracking-widest font-mono uppercase"
                maxLength={6}
                autoCapitalize="characters"
              />
              <Button type="submit" className="w-full text-lg h-12" disabled={isLoading || roomCode.length < 6}>
                {isLoading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Swords className="mr-2 h-5 w-5" />
                )}
                Join Battle
              </Button>
            </form>
          </CardContent>
        </Card>
       </div>
    </div>
  );
}
