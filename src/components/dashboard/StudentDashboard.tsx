
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { quizService } from '@/services/quiz.service';
import { participantService } from '@/services/participant.service';
import { Loader2, Swords, History, UserCircle, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function StudentDashboard({ initialRoomCode }: { initialRoomCode?: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [roomCode, setRoomCode] = useState(initialRoomCode || '');
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<Array<{ quizId: string; title: string; score: number; status: string; created_at: number }>>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    participantService.getStudentHistory(user.id)
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [user]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!code || !user) return;
    setIsLoading(true);

    try {
      const quiz = await quizService.getQuizById(code);
      if (quiz.status === 'finished') throw new Error('Quiz has ended');

      const participants = await participantService.getAllParticipants(code);
      const existing = participants.find(p => p.user_id === user.id);

      if (!existing) {
        await participantService.joinQuiz(code, user.id, user.name);
      } else if (existing.status === 'blocked') {
        throw new Error('You are blocked from this room');
      }

      router.push(`/battle/${code}`);
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Join Failed', description: err instanceof Error ? err.message : "Unknown error" });
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-4xl mx-auto safe-bottom">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-headline text-primary">Gladiator Dashboard</h1>
          <p className="text-muted-foreground">Welcome, {user?.name || 'Gladiator'}.</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/student/profile"><UserCircle className="mr-2 h-4 w-4" aria-hidden="true" /> Profile</Link>
        </Button>
      </div>

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
                aria-label="Room code"
              />
              <Button type="submit" className="w-full h-12 text-lg" disabled={isLoading || roomCode.length < 6}>
                {isLoading ? <Loader2 className="animate-spin" /> : <Swords className="mr-2" />}
                Join Battle
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-headline text-primary">Battle History</h2>
        </div>

        {historyLoading ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3"><Loader2 className="animate-spin h-8 w-8 text-primary" /><p className="text-sm text-muted-foreground animate-pulse">Loading battle history...</p></div>
        ) : history.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No battles fought yet. Join an arena above!</p>
        ) : (
          <div className="space-y-3">
            {history.map(h => (
              <Card key={h.quizId} className="hover:bg-secondary/20 transition-colors">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-bold">{h.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={h.status === 'finished' ? 'outline' : h.status === 'live' ? 'default' : 'secondary'} className="text-[10px]">
                          {h.status.toUpperCase()}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-mono text-xl font-bold text-primary">{h.score}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">pts</p>
                    </div>
                    {h.status === 'finished' && (
                      <Button variant="ghost" size="icon" asChild aria-label="View results for {h.title}">
                        <Link href={`/battle/${h.quizId}`}><ExternalLink className="w-4 h-4" aria-hidden="true" /></Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
