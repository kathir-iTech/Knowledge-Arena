'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { quizService } from '@/services/quiz.service';
import { participantService } from '@/services/participant.service';
import { Loader2, Swords, UserCircle, History, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function GladiatorDashboard({ initialRoomCode }: { initialRoomCode?: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const codeSource = useRef<'url' | 'session' | 'none'>('none');
  const [roomCode, setRoomCode] = useState(() => {
    if (initialRoomCode) {
      codeSource.current = 'url';
      return initialRoomCode;
    }
    if (typeof window !== 'undefined') {
      const pending = sessionStorage.getItem('pendingRoomCode');
      if (pending) {
        sessionStorage.removeItem('pendingRoomCode');
        codeSource.current = 'session';
        return pending;
      }
    }
    return '';
  });
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<Array<{ quizId: string; title: string; score: number; status: string; created_at: number }>>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const autoJoinTriggered = useRef(false);

  useEffect(() => {
    if (!user) return;
    participantService.getStudentHistory(user.id)
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [user]);

  useEffect(() => {
    const code = roomCode.trim().toUpperCase();
    if (!code || autoJoinTriggered.current || !user) return;
    if (codeSource.current === 'none') return;
    autoJoinTriggered.current = true;
    setIsLoading(true);
    quizService.getQuizById(code)
      .then(async (quiz) => {
        if (quiz.status === 'finished') throw new Error('Battle has ended');
        const participants = await participantService.getAllParticipants(code);
        const existing = participants.find(p => p.user_id === user.id);
        if (!existing) {
          await participantService.joinQuiz(code, user.id, user.name);
        } else if (existing.status === 'blocked') {
          throw new Error('You are blocked from this arena');
        }
        router.push(`/battle/${code}`);
      })
      .catch((err) => {
        toast({ variant: 'destructive', title: 'Join Failed', description: err instanceof Error ? err.message : 'Unknown error' });
        setIsLoading(false);
      });
  }, [roomCode, user, toast, router]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!code || !user) return;
    setIsLoading(true);

    try {
      const quiz = await quizService.getQuizById(code);
      if (quiz.status === 'finished') throw new Error('Battle has ended');

      const participants = await participantService.getAllParticipants(code);
      const existing = participants.find(p => p.user_id === user.id);

      if (!existing) {
        await participantService.joinQuiz(code, user.id, user.name);
      } else if (existing.status === 'blocked') {
        throw new Error('You are blocked from this arena');
      }

      router.push(`/battle/${code}`);
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Join Failed', description: err instanceof Error ? err.message : "Unknown error" });
      setIsLoading(false);
    }
  };

  return (
    <div className="page-container safe-bottom animate-in">
      <header className="page-section safe-top">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-page-title font-headline tracking-tight">Hello, {user?.name || 'Gladiator'}.</h1>
            <p className="text-base text-muted-foreground">Ready for your next battle?</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/gladiator/profile"><UserCircle className="mr-2 h-4 w-4" /> Profile</Link>
          </Button>
        </div>
      </header>

      <section className="page-section">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-9 h-9 rounded-[10px] bg-primary/10 shrink-0">
                <Swords className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">Join Arena</h2>
                <p className="text-xs text-muted-foreground">Enter the 6-digit room code to join a battle.</p>
              </div>
            </div>
            <form id="join-form" onSubmit={handleJoin} className="flex gap-3">
              <Input
                value={roomCode}
                onChange={e => setRoomCode(e.target.value)}
                className="text-center text-lg font-mono tracking-[0.25em] uppercase flex-1 h-12"
                maxLength={6}
                placeholder="000000"
                aria-label="Room code"
              />
              <Button type="submit" className="shrink-0 h-12 px-6" disabled={isLoading || roomCode.length < 6}>
                {isLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Swords className="mr-2 h-4 w-4" />}
                Join
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="page-section">
        <div className="flex items-center gap-2.5 mb-4">
          <History className="w-4 h-4 text-primary" />
          <h2 className="text-section-title tracking-tight">Battle History</h2>
          {!historyLoading && <span className="text-xs text-muted-foreground ml-auto">{history.length} battle{history.length !== 1 ? 's' : ''}</span>}
        </div>

        {historyLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : history.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-border/50 rounded-[12px]">
            <Swords className="w-6 h-6 text-muted-foreground mx-auto mb-4" />
            <p className="text-base text-muted-foreground mb-4">No battles fought yet.</p>
            <Button variant="outline" size="sm" asChild><Link href="/gladiator/history">View Full History</Link></Button>
          </div>
        ) : (
          <div className="space-y-1">
            {[...history].sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice(0, 20).map((h) => (
              <Link key={h.quizId} href={`/battle/${h.quizId}`} className="block">
                <div className={cn(
                  "flex items-center gap-3 p-3 rounded-[10px] border transition-colors",
                  "border-border/30 hover:border-primary/20 hover:bg-primary/[0.02]"
                )}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{h.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(h.created_at).toLocaleDateString()} · {new Date(h.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <Badge variant={h.status === 'finished' ? 'outline' : 'secondary'} className="h-5 text-[10px] shrink-0">
                    {h.status === 'finished' ? 'DONE' : h.status === 'live' ? 'LIVE' : 'WAITING'}
                  </Badge>
                  <span className="text-sm font-bold font-mono text-primary tabular-nums shrink-0">{h.score}<span className="text-[10px] text-muted-foreground font-normal ml-0.5">pts</span></span>
                  <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
                </div>
              </Link>
            ))}
            {history.length > 20 && (
              <div className="pt-2 text-center">
                <Button variant="ghost" size="sm" asChild className="text-xs">
                  <Link href="/gladiator/history">View all {history.length} battles</Link>
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

    </div>
  );
}
