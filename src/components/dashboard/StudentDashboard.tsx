"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Swords, BarChart } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';

const StudentDashboard = () => {
  const [roomCode, setRoomCode] = useState('');
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const firestore = useFirestore();

  const handleJoinBattle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.trim() && firestore) {
      const roomRef = doc(firestore, 'battleRooms', roomCode.trim());
      const roomSnap = await getDoc(roomRef);

      if (roomSnap.exists()) {
        router.push(`/battle/${roomCode.trim()}`);
      } else {
        toast({
          variant: 'destructive',
          title: 'Room not found',
          description: 'The battle room code you entered is invalid.',
        });
      }
    }
  };
  
  return (
    <div className="p-4 md:p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-headline tracking-tight">Welcome, Gladiator <span className="text-primary">{user?.name}</span></h1>
        <p className="text-muted-foreground">The arena awaits. Join a battle to test your might.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
         <Card className="border-primary/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total XP</CardTitle>
            <BarChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{user?.xp || 0}</div>
            <p className="text-xs text-muted-foreground">Your current experience points</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gradient-to-br from-secondary to-background border-accent">
        <CardHeader>
          <CardTitle className="font-headline text-2xl">Enter the Arena</CardTitle>
          <CardDescription>Enter the code from your teacher to join the battle.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleJoinBattle} className="flex flex-col sm:flex-row items-center gap-4">
            <Input
              type="text"
              placeholder="Enter Room Code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              className="max-w-xs text-lg h-12 text-center font-headline tracking-widest"
            />
            <Button type="submit" size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground">
              <Swords className="mr-2 h-5 w-5" />
              Join Battle
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentDashboard;
