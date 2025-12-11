"use client";

import { useCollection, useFirestore } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { User } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Crown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function LeaderboardPage() {
  const firestore = useFirestore();
  const usersRef = collection(firestore, 'users');
  // Firestore queries can be used here to sort and limit
  const { data: users, isLoading } = useCollection<User>(usersRef);

  const sortedUsers = users ? [...users].sort((a, b) => b.xp - a.xp) : [];

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-6 h-6 text-yellow-400" />;
    if (rank === 2) return <Crown className="w-6 h-6 text-slate-400" />;
    if (rank === 3) return <Crown className="w-6 h-6 text-yellow-600" />;
    return <span className="text-sm font-bold">{rank}</span>;
  };

  if (isLoading) {
    return (
        <div className="p-4 md:p-8">
            <header className="mb-8">
                <Skeleton className="h-10 w-1/2" />
                <Skeleton className="h-4 w-1/3 mt-2" />
            </header>
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-1/4" />
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <Skeleton className="h-12 w-12 rounded-full" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-4 w-1/2" />
                                </div>
                                <Skeleton className="h-6 w-1/4" />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-headline tracking-tight text-primary">Top Gladiators</h1>
        <p className="text-muted-foreground">See who reigns supreme in the arena.</p>
      </header>
      <Card className="border-accent/50 shadow-lg shadow-accent/10">
        <CardHeader>
          <CardTitle className="font-headline">Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px] text-center">Rank</TableHead>
                <TableHead>Gladiator</TableHead>
                <TableHead className="text-right">Total XP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedUsers.map((user, index) => (
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
        </CardContent>
      </Card>
    </div>
  );
}
