
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore } from '@/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Loader2, Swords } from 'lucide-react';

export default function StudentDashboard({ initialRoomCode }: { initialRoomCode?: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const [roomCode, setRoomCode] = useState(initialRoomCode || '');
  const [isLoading, setIsLoading] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!code || !firestore || !user) return;
    setIsLoading(true);

    try {
      const qSnap = await getDoc(doc(firestore, 'quizzes', code));
      if (!qSnap.exists()) throw new Error('Room not found');
      if (qSnap.data().status === 'finished') throw new Error('Quiz has ended');

      const pRef = doc(firestore, 'quizzes', code, 'participants', user.id);
      const pSnap = await getDoc(pRef);
      if (!pSnap.exists()) {
        await setDoc(pRef, { name: user.name, avatar: user.avatar, role: 'student', score: 0, status: 'playing', violationsCount: 0 });
      } else if (pSnap.data().status === 'blocked') {
        throw new Error('You are blocked from this room');
      }

      router.push(`/battle/${code}`);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Join Failed', description: err.message });
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-8">
      <h1 className="text-4xl font-headline text-primary text-center">Gladiator Dashboard</h1>
      <div className="flex justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Enter the Arena</CardTitle>
            <CardDescription className="text-center">Enter the 6-digit code to join the battle.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoin} className="space-y-4">
              <Input
                value={roomCode}
                onChange={e => setRoomCode(e.target.value)}
                className="text-center text-3xl h-16 font-mono tracking-widest uppercase"
                maxLength={6}
                placeholder="000000"
              />
              <Button type="submit" className="w-full h-12 text-lg" disabled={isLoading || roomCode.length < 6}>
                {isLoading ? <Loader2 className="animate-spin" /> : <Swords className="mr-2" />}
                Join Battle
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
