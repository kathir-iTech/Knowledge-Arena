
"use client";

import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import type { User } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Crown, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function LeaderboardPage() {
  const firestore = useFirestore();
  
  const usersQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'users'), where('role', '==', 'Student'), orderBy('xp', 'desc')) : null),
    [firestore]
  );

  const { data: users, isLoading } = useCollection<User>(usersQuery);

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-6 h-6 text-yellow-400" />;
    if (rank === 2) return <Crown className="w-6 h-6 text-slate-400" />;
    if (rank === 3) return <Crown className="w-6 h-6 text-yellow-600" />;
    return <span className="text-sm font-bold">{rank}</span>;
  };

  return (
    <div className="p-4 md:p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-headline tracking-tight text-primary">Top Gladiators</h1>
        <p className="text-muted-foreground">See who reigns supreme in the arena based on total XP.</p>
      </header>
      <Card className="border-accent/50 shadow-lg shadow-accent/10">
        <CardHeader>
          <CardTitle className="font-headline">Overall Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
             <div className="flex justify-center items-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
             </div>
          )}
          {!isLoading && users && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px] text-center">Rank</TableHead>
                <TableHead>Gladiator</TableHead>
                <TableHead className="text-right">Total XP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user, index) => (
                <TableRow key={user.id} className={index < 3 ? 'bg-secondary' : ''}>
                  <TableCell>
                    <div className="flex items-center justify-center h-full">
                        {getRankIcon(index + 1)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-4">
                      <Avatar className="h-10 w-10">
                         <AvatarFallback className="bg-muted text-xl">{user.avatar}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{user.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-primary font-bold">{user.xp}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
           {!isLoading && !users && (
            <p className="text-center text-muted-foreground p-8">Could not load leaderboard data.</p>
           )}
        </CardContent>
      </Card>
    </div>
  );
}
