
'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import QRCode from 'react-qr-code';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Copy, Users, Wifi, WifiOff, Clock, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '../ui/skeleton';
import { ValidatedQuiz, ValidatedParticipant } from '@/lib/schemas';
import { quizService } from '@/services/quiz.service';
import { participantService } from '@/services/participant.service';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface WaitingRoomProps {
  quiz: ValidatedQuiz;
  isTeacher: boolean;
}

export default function WaitingRoom({ quiz, isTeacher }: WaitingRoomProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [shareableLink, setShareableLink] = useState('');
  const { toast } = useToast();
  const [participants, setParticipants] = useState<ValidatedParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [teacherOnline, setTeacherOnline] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.origin + `/battle/${quiz.id}`);
      setShareableLink(url.toString());
    }
  }, [quiz.id]);

  useEffect(() => {
    const interval = setInterval(() => setPresenceNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);

  const unsubRef = useRef<(() => void) | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    if (isTeacher && user) {
      const send = () => {
        quizService.commanderHeartbeat(quiz.id).catch(() => {});
      };
      send();
      heartbeatRef.current = setInterval(send, 15000);
    } else if (!isTeacher && user) {
      const send = () => {
        participantService.heartbeat(quiz.id, user.id).catch(() => {});
      };
      send();
      heartbeatRef.current = setInterval(send, 15000);
    }

    const subscribe = () => {
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = participantService.subscribeToParticipants(quiz.id, (parts) => {
        if (!mountedRef.current) return;
        setParticipants(parts);
        setIsLoading(false);
        if (parts.some(p => p.user_id === quiz.created_by)) {
          setTeacherOnline(true);
        }
        setIsReconnecting(false);
      }, () => {
        if (!mountedRef.current) return;
        setIsReconnecting(true);
      });
    };

    subscribe();

    const handleOffline = () => {
      if (!mountedRef.current) return;
      setIsReconnecting(true);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) subscribe();
      }, 3000);
    };

    const handleOnline = () => {
      if (!mountedRef.current) return;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      subscribe();
    };

    const handlePageShow = () => {
      if (!mountedRef.current) return;
      if (isTeacher && user) {
        quizService.commanderHeartbeat(quiz.id).catch(() => {});
      } else if (!isTeacher && user) {
        participantService.heartbeat(quiz.id, user.id).catch(() => {});
      }
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      const hbUserId = user?.id;
      if (hbUserId) {
        const send = isTeacher
          ? () => quizService.commanderHeartbeat(quiz.id).catch(() => {})
          : () => participantService.heartbeat(quiz.id, hbUserId).catch(() => {});
        send();
        heartbeatRef.current = setInterval(send, 15000);
      }
      subscribe();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    window.addEventListener('pageshow', handlePageShow);

    const unsubQuiz = quizService.subscribeToQuiz(quiz.id, (q) => {
      if (!mountedRef.current) return;
      if (!q) { setTeacherOnline(false); return; }
      setTeacherOnline(q.status === 'waiting' || q.status === 'live');
    }, () => {
      if (!mountedRef.current) return;
      setIsReconnecting(true);
    });

    return () => {
      mountedRef.current = false;
      if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('pageshow', handlePageShow);
      unsubQuiz();
    };
  }, [quiz.id, quiz.created_by, isTeacher, user]);

  const studentParticipants = useMemo(() => {
    return participants.filter(p => {
      if (p.user_id === quiz.created_by) return false;
      if (p.status === 'blocked') return false;
      const lastSeen = p.lastSeen;
      if (!lastSeen) return true;
      const ts = typeof lastSeen === 'number' ? lastSeen : (lastSeen as any).toMillis?.();
      if (!ts) return true;
      return presenceNow - ts < 30000;
    });
  }, [participants, presenceNow, quiz.created_by]);

  const blockedParticipants = useMemo(() => {
    return participants.filter(p => p.user_id !== quiz.created_by && p.status === 'blocked');
  }, [participants, quiz.created_by]);

  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const handleUnblock = async (userId: string) => {
    setUnblockingId(userId);
    try {
      await participantService.unblockParticipant(quiz.id, userId);
      toast({ title: 'Unblocked', description: 'Gladiator has been unblocked.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to unblock gladiator.' });
    } finally {
      setUnblockingId(null);
    }
  };

  const handleLeave = async () => {
    if (isTeacher || !user || isLeaving) return;
    setIsLeaving(true);
    try {
      await participantService.leaveQuiz(quiz.id, user.id);
      toast({ title: 'Arena Left', description: 'You can rejoin this arena from the dashboard.' });
      router.push('/gladiator/dashboard');
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to leave the arena.' });
    } finally {
      setIsLeaving(false);
      setShowLeaveDialog(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: 'Copied!', description: `${text} copied to your clipboard.` });
    });
  };

  const handleStartQuiz = async () => {
    if (!isTeacher || !user || isStarting) return;
    setIsStarting(true);
    try {
        await quizService.startQuiz(quiz.id);
        setIsStarting(false);
    } catch {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to start quiz.' });
        setIsStarting(false);
    }
  };

  const studentCount = studentParticipants.length;
  const areParticipantsLoading = isLoading;

  return (
    <div className="flex flex-col items-center min-h-screen p-4 md:p-8 animate-in safe-top safe-bottom">
      <div className="w-full max-w-lg space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-display font-headline text-foreground tracking-tight">{quiz.title}</h1>
          <p className="text-base text-muted-foreground">{isTeacher ? 'Share the room code below to invite gladiators.' : 'Awaiting the Commander to start the battle.'}</p>
        </header>

        {isReconnecting && (
          <div className="flex items-center justify-center gap-2 bg-warning/5 border border-warning/10 px-4 py-2.5 rounded-[12px] text-sm" role="alert" aria-live="assertive">
            <Loader2 className="animate-spin h-4 w-4 text-warning" />
            <span className="text-warning font-medium">Connection lost. Reconnecting...</span>
          </div>
        )}

        <div className="flex items-center justify-center gap-6">
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold">{studentCount}</span>
            <span className="text-muted-foreground">connected</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
              {teacherOnline ? (
                <><span className="w-2 h-2 rounded-full bg-success" /><span className="text-success font-medium">Commander Online</span></>
              ) : (
                <><span className="w-2 h-2 rounded-full bg-muted-foreground/30" /><span className="text-muted-foreground">Waiting for Commander</span></>
              )}
          </div>
        </div>

        <Card>
          <CardContent className="flex flex-col sm:flex-row items-center justify-center gap-6 py-8">
            <div className="flex flex-col items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Room Code</span>
              <div className="text-4xl md:text-5xl font-mono font-bold tracking-[0.15em] text-primary">
                <span>{quiz.id}</span>
              </div>
              <Button variant="ghost" size="sm" className="h-10 touch-target text-xs text-muted-foreground hover:text-foreground" onClick={() => copyToClipboard(quiz.id)} aria-label="Copy room code">
                <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy Code
              </Button>
            </div>
            {shareableLink && (
              <div className="hidden sm:block w-px h-16 bg-border/50" />
            )}
            {shareableLink && (
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs text-muted-foreground">Or scan to join</span>
                <div className="bg-white p-3 rounded-[12px] shadow-elevation-small">
                  <QRCode value={shareableLink} size={120} aria-label={`QR code to join quiz ${quiz.id}`} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4 text-center">
            <CardTitle className="font-headline flex items-center justify-center gap-2.5 text-xl">
                <Users className="w-5 h-5 text-primary" />
                Participants
            </CardTitle>
            <CardDescription className="text-sm">{isTeacher ? `${studentCount} gladiator${studentCount !== 1 ? 's' : ''} have joined.` : "See who's ready for battle."}</CardDescription>
          </CardHeader>
          <CardContent>
                <div className="flex flex-wrap justify-center gap-4">
                  {areParticipantsLoading && studentCount === 0 ? (
                     Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex flex-col items-center gap-2 text-center">
                        <Skeleton className="h-14 w-14 rounded-full" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    ))
                  ) : studentParticipants.length > 0 ? studentParticipants.map(p => (
                    <div key={p.user_id} className="flex flex-col items-center gap-2 text-center group">
                      <div className="relative">
                        <Avatar className="h-14 w-14 md:h-16 md:w-16 ring-2 ring-border ring-offset-2 ring-offset-card">
                          <AvatarFallback className="text-2xl bg-secondary">{p.avatar || '🎮'}</AvatarFallback>
                        </Avatar>
                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-success rounded-full border-2 border-card" />
                      </div>
                      <span className="text-xs font-medium max-w-20 truncate">{p.name || p.user_id.slice(0, 8)}</span>
                    </div>
                  )                  ) : (
                    <p className="text-sm text-muted-foreground">Waiting for participants to arrive...</p>
                  )}
                </div>
          </CardContent>
          {isTeacher && blockedParticipants.length > 0 && (
            <CardContent className="border-t border-border/50 pt-4">
              <h4 className="text-sm font-semibold text-destructive mb-3">Blocked Gladiators</h4>
              <div className="space-y-2">
                {blockedParticipants.map(p => (
                  <div key={p.user_id} className="flex items-center justify-between py-2 px-3 rounded-[12px] bg-destructive/5 border border-destructive/10">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-secondary">{p.avatar || '🎮'}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{p.name || p.user_id.slice(0, 8)}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnblock(p.user_id)}
                      disabled={unblockingId === p.user_id}
                    >
                      {unblockingId === p.user_id ? <Loader2 className="animate-spin h-3 w-3" /> : 'Unblock'}
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>

        {isTeacher && (
          <Button 
            size="lg" 
            className="w-full text-base font-headline font-semibold touch-target" 
            onClick={handleStartQuiz}
            disabled={studentCount === 0 || areParticipantsLoading || isStarting}
          >
            {isStarting ? <Loader2 className="mr-2.5 h-5 w-5 animate-spin" /> : <ShieldCheck className="mr-2.5 h-5 w-5" />}
             {isStarting
              ? 'Starting battle...'
              : areParticipantsLoading && studentCount === 0
              ? 'Loading participants...'
              : studentCount === 0 
              ? 'Waiting for gladiators to join...'
               : `Start Battle for ${studentCount} Gladiator${studentCount !== 1 ? 's' : ''}`}
          </Button>
        )}

        {!teacherOnline && !isTeacher && (
          <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>Quiz starting soon...</span>
          </div>
        )}

        {!isTeacher && (
          <>
            <Button variant="outline" className="w-full" onClick={() => setShowLeaveDialog(true)} disabled={isLeaving}>
              Leave Arena
            </Button>
            <AlertDialog open={showLeaveDialog} onOpenChange={(open) => { if (!isLeaving) setShowLeaveDialog(open); }}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Leave Arena?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You will be removed from the waiting room. You can rejoin later with the room code.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isLeaving}>Stay</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(event) => { event.preventDefault(); void handleLeave(); }}
                    disabled={isLeaving}
                  >
                    {isLeaving ? 'Leaving...' : 'Leave Arena'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </div>
  );
}
