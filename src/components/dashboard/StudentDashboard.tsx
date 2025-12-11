
"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Swords, BarChart, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';

const StudentDashboard = () => {
  const [roomCode, setRoomCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const firestore = useFirestore();

  const handleJoinBattle = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!code) {
      toast({
        variant: 'destructive',
        title: 'Invalid Code',
        description: 'Please enter a room code.',
      });
      return;
    }

    if (!firestore) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not connect to the database.' });
        return;
    }

    setIsJoining(true);
    try {
        const roomRef = doc(firestore, 'rooms', code);
        const roomSnap = await getDoc(roomRef);

        if (roomSnap.exists()) {
            router.push(`/battle/${code}`);
        } else {
            toast({
                variant: 'destructive',
                title: 'Room Not Found',
                description: 'The battle room code you entered does not exist.',
            });
        }
    } catch (error) {
        console.error("Error checking room:", error);
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Could not verify the room code. Please try again.',
        });
    } finally {
        setIsJoining(false);
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
              placeholder="ENTER ROOM CODE"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              className="max-w-xs text-lg h-12 text-center font-headline tracking-widest uppercase"
              disabled={isJoining}
            />
            <Button type="submit" size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground" disabled={isJoining}>
              {isJoining ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Swords className="mr-2 h-5 w-5" />}
              {isJoining ? 'Verifying...' : 'Join Battle'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentDashboard;
