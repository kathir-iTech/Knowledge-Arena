
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
import { Loader2, Swords, History, UserCircle, ExternalLink, Trophy } from 'lucide-react';
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

  const totalScore = history.reduce((sum, h) => sum + h.score, 0);

  return (
    <div className="page-container safe-bottom animate-in">
      <header className="flex items-center justify-between page-section">
        <div className="space-y-1">
          <h1 className="text-page-title font-headline tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Welcome back, {user?.name || 'Student'}.</p>
        </div>
        <Button variant="outline" size="sm" asChild className="h-9">
          <Link href="/student/profile"><UserCircle className="mr-2 h-4 w-4" /> Profile</Link>
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 page-section">
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Swords className="w-4 h-4 text-primary" />
              Enter the Arena
            </CardTitle>
            <CardDescription className="text-xs">Enter the 6-digit room code to join a battle.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoin} className="flex gap-3">
              <Input
                value={roomCode}
                onChange={e => setRoomCode(e.target.value)}
                className="text-center text-lg font-mono tracking-[0.25em] uppercase flex-1"
                maxLength={6}
                placeholder="000000"
                aria-label="Room code"
              />
              <Button type="submit" className="shrink-0" disabled={isLoading || roomCode.length < 6}>
                {isLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Swords className="mr-2 h-4 w-4" />}
                Join
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center h-full gap-1">
            <Trophy className="w-5 h-5 text-amber-400" />
            <span className="text-xs text-muted-foreground">Total Score</span>
            <span className="text-3xl font-semibold tracking-tight">{totalScore}</span>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          <h2 className="text-section-title tracking-tight">Battle History</h2>
        </div>

        {historyLoading ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3"><Loader2 className="animate-spin h-6 w-6 text-muted-foreground" /><p className="text-sm text-muted-foreground">Loading battle history...</p></div>
        ) : history.length === 0 ? (
          <div className="py-16 text-center border-2 border-dashed border-muted/30 rounded-[14px]">
            <Swords className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">No battles fought yet.</p>
            <p className="text-xs text-muted-foreground/70">Enter a room code above to join a battle.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th scope="col" className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">#</th>
                  <th scope="col" className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Title</th>
                  <th scope="col" className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                  <th scope="col" className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Date</th>
                  <th scope="col" className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Score</th>
                  <th scope="col" className="text-center p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Review</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, idx) => (
                  <tr key={h.quizId} className={cn("border-b border-border/40 transition-colors hover:bg-muted/20", idx % 2 === 0 ? "bg-background" : "bg-muted/[0.03]")}>
                    <td className="p-3">
                      <span className="flex items-center justify-center w-7 h-7 rounded-[8px] bg-primary/10 text-primary font-mono text-xs font-bold">{idx + 1}</span>
                    </td>
                    <td className="p-3 font-medium text-sm">{h.title}</td>
                    <td className="p-3">
                      <Badge variant={h.status === 'finished' ? 'outline' : h.status === 'live' ? 'default' : 'secondary'} className="text-[10px] h-5">
                        {h.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{new Date(h.created_at).toLocaleDateString()}</td>
                    <td className="p-3 text-right">
                      <span className="font-semibold text-sm text-primary">{h.score}</span>
                      <span className="text-[10px] text-muted-foreground ml-0.5">pts</span>
                    </td>
                    <td className="p-3 text-center">
                      {h.status === 'finished' ? (
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild aria-label={`View results for ${h.title}`}>
                          <Link href={`/battle/${h.quizId}`}><ExternalLink className="w-3.5 h-3.5" /></Link>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
