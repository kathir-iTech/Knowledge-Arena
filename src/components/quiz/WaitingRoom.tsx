
'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import QRCode from 'react-qr-code';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Copy, Users, Clock, Loader2, CheckCircle2, Hand } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '../ui/skeleton';
import { ValidatedQuiz, ValidatedParticipant } from '@/lib/schemas';
import { quizService } from '@/services/quiz.service';
import { participantService } from '@/services/participant.service';
import { battleService } from '@/services/battle.service';
import { battleLogService } from '@/services/battle-log.service';
import { presenceService, type PresenceMap } from '@/services/presence.service';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface WaitingRoomProps {
  quiz: ValidatedQuiz;
  isTeacher: boolean;
  joinError?: string | null;
  onRetryJoin?: () => void;
  isRetryingJoin?: boolean;
}

export default function WaitingRoom({ quiz, isTeacher, joinError, onRetryJoin, isRetryingJoin }: WaitingRoomProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [shareableLink, setShareableLink] = useState('');
  const { toast } = useToast();
  const [participants, setParticipants] = useState<ValidatedParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [presence, setPresence] = useState<PresenceMap | null>(null);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [selfReady, setSelfReady] = useState(false);
  const [isReadyToggling, setIsReadyToggling] = useState(false);
  const [requireAllReady, setRequireAllReady] = useState(quiz.start_config?.require_all_ready ?? false);
  const [independentMode, setIndependentMode] = useState(quiz.battle_mode === 'independent');
  const [isUpdatingConfig, setIsUpdatingConfig] = useState(false);
  const joinedLoggedRef = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.origin + `/battle/${quiz.id}`);
      setShareableLink(url.toString());
    }
  }, [quiz.id]);

  useEffect(() => {
    let mounted = true;
    const unsub = presenceService.subscribeToPresence(quiz.id, (p) => {
      if (mounted) setPresence(p);
    });
    return () => { mounted = false; unsub(); };
  }, [quiz.id]);

  const unsubRef = useRef<(() => void) | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const subscribe = () => {
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = participantService.subscribeToParticipants(quiz.id, (parts) => {
        if (!mountedRef.current) return;
        setParticipants(parts);
        if (!isTeacher && user) {
          const self = parts.find(p => p.user_id === user.id);
          if (self) {
            setSelfReady(self.ready === true);
            if (!joinedLoggedRef.current && self.status !== 'blocked') {
              joinedLoggedRef.current = true;
              battleLogService.record({
                quizId: quiz.id,
                event: 'gladiator_joined',
                actor: user.id,
                actorRole: 'gladiator',
                timestamp: Date.now(),
              });
            }
          }
        }
        setIsLoading(false);
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
      // RTDB presence is re-applied automatically by the `.info/connected`
      // watcher in presenceService; only the Firestore roster needs to re-sync.
      subscribe();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    window.addEventListener('pageshow', handlePageShow);

    const unsubQuiz = quizService.subscribeToQuiz(quiz.id, () => {}, () => {
      if (!mountedRef.current) return;
      setIsReconnecting(true);
    });

    return () => {
      mountedRef.current = false;
      if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('pageshow', handlePageShow);
      unsubQuiz();
    };
  }, [quiz.id, quiz.created_by, isTeacher, user?.id]);

  const studentParticipants = useMemo(() => {
    return participants.filter(p => {
      if (p.user_id === quiz.created_by) return false;
      if (p.status === 'blocked') return false;
      // RTDB presence: only gladiators actively connected count as in the room.
      if (presence == null) return true;
      return presence[p.user_id] != null;
    });
  }, [participants, presence, quiz.created_by]);

  const teacherOnline = useMemo(() => {
    // The Commander's own RTDB presence node is the same signal used by the
    // live battle banner, so waiting-room and live room agree.
    if (presence == null) return true;
    return presence[quiz.created_by] != null;
  }, [presence, quiz.created_by]);

  const blockedParticipants = useMemo(() => {
    return participants.filter(p => p.user_id !== quiz.created_by && p.status === 'blocked');
  }, [participants, quiz.created_by]);

  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [kickingId, setKickingId] = useState<string | null>(null);
  const [isKicking, setIsKicking] = useState(false);

  useEffect(() => {
    if (!isTeacher && user) {
      const selfPart = participants.find(p => p.user_id === user.id);
      if (selfPart && selfPart.status === 'blocked') {
        router.push('/kicked');
      }
    }
  }, [participants, isTeacher, user, router]);

  const handleKick = async () => {
    if (!kickingId || !isTeacher) return;
    setIsKicking(true);
    try {
      await participantService.blockParticipant(quiz.id, kickingId);
      await battleLogService.record({
        quizId: quiz.id,
        event: 'gladiator_blocked',
        actor: user?.id || '',
        actorRole: 'commander',
        timestamp: Date.now(),
        metadata: { target: kickingId },
      });
      toast({ title: 'Gladiator Kicked', description: 'Participant has been removed from this arena.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to kick gladiator.' });
    } finally {
      setIsKicking(false);
      setKickingId(null);
    }
  };

  const handleUnblock = async (userId: string) => {
    setUnblockingId(userId);
    try {
      await participantService.unblockParticipant(quiz.id, userId);
      await battleLogService.record({
        quizId: quiz.id,
        event: 'gladiator_unblocked',
        actor: user?.id || '',
        actorRole: 'commander',
        timestamp: Date.now(),
        metadata: { target: userId },
      });
      toast({ title: 'Unblocked', description: 'Gladiator has been unblocked.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to unblock gladiator.' });
    } finally {
      setUnblockingId(null);
    }
  };

  const handleToggleReady = async () => {
    if (!user || isReadyToggling) return;
    const next = !selfReady;
    setIsReadyToggling(true);
    setSelfReady(next);
    try {
      await participantService.setReady(quiz.id, user.id, next);
      await battleLogService.record({
        quizId: quiz.id,
        event: 'gladiator_ready',
        actor: user.id,
        actorRole: 'gladiator',
        timestamp: Date.now(),
        metadata: { ready: next },
      });
    } catch {
      setSelfReady(!next);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update readiness.' });
    } finally {
      setIsReadyToggling(false);
    }
  };

  const handleRequireAllReadyChange = async (next: boolean) => {
    if (!isTeacher || isUpdatingConfig) return;
    setIsUpdatingConfig(true);
    const prev = requireAllReady;
    setRequireAllReady(next);
    try {
      await quizService.updateQuiz(quiz.id, { start_config: { require_all_ready: next } });
    } catch {
      setRequireAllReady(prev);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update battle configuration.' });
    } finally {
      setIsUpdatingConfig(false);
    }
  };

  const handleModeChange = async (next: boolean) => {
    if (!isTeacher || isUpdatingConfig) return;
    setIsUpdatingConfig(true);
    const prev = independentMode;
    setIndependentMode(next);
    try {
      await quizService.updateQuiz(quiz.id, { battle_mode: next ? 'independent' : 'synchronized' });
      toast({ title: 'Mode Updated', description: next ? 'Independent mode: each gladiator progresses at their own pace.' : 'Synchronized mode: everyone shares the same question flow.' });
    } catch {
      setIndependentMode(prev);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update battle mode.' });
    } finally {
      setIsUpdatingConfig(false);
    }
  };

  const handleLeave = async () => {
    if (isTeacher || !user || isLeaving) return;
    setIsLeaving(true);
    try {
      await participantService.leaveQuiz(quiz.id, user.id);
      await battleLogService.record({
        quizId: quiz.id,
        event: 'gladiator_left',
        actor: user.id,
        actorRole: 'gladiator',
        timestamp: Date.now(),
      });
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
    navigator.clipboard.writeText(text)
      .then(() => {
        toast({ title: 'Copied!', description: `${text} copied to your clipboard.` });
      })
      .catch(() => {
        toast({ variant: 'destructive', title: "Couldn't Copy", description: 'Copy failed — try copying the code manually.' });
      });
  };

  const handleStartQuiz = async () => {
    if (!isTeacher || !user || isStarting) return;
    if (requireAllReady && readyCount < studentCount) return;
    setIsStarting(true);
    try {
      await battleService.startBattle(quiz.id);
      setIsStarting(false);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to start battle.' });
      setIsStarting(false);
    }
  };

  const studentCount = studentParticipants.length;
  const areParticipantsLoading = isLoading;
  const readyCount = studentParticipants.filter(p => p.ready === true).length;
  const readyGate = requireAllReady && readyCount < studentCount;

  return (
    <div className="flex flex-col items-center min-h-screen p-4 md:p-8 animate-in safe-top safe-bottom">
      <div className="w-full max-w-lg space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-display font-headline text-foreground tracking-tight">{quiz.title}</h1>
          <p className="text-base text-muted-foreground">{isTeacher ? 'Share the room code below to invite gladiators.' : 'Awaiting the Commander to start the battle.'}</p>
        </header>

        {joinError && !isTeacher && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-destructive/10 border border-destructive/25 px-4 py-3 rounded-[12px] text-sm" role="alert" aria-live="assertive">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" aria-hidden="true" />
              <span className="text-destructive font-medium">Could not join the arena: {joinError}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 touch-target"
              onClick={onRetryJoin}
              disabled={isRetryingJoin}
              aria-label="Retry joining the arena"
            >
              {isRetryingJoin ? <Loader2 className="animate-spin mr-1.5 h-3.5 w-3.5" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              {isRetryingJoin ? 'Retrying...' : 'Retry Join'}
            </Button>
          </div>
        )}

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
          {isTeacher && (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <span className="font-semibold">{readyCount}</span>
              <span className="text-muted-foreground">ready</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm">
              {teacherOnline ? (
                <><span className="w-2 h-2 rounded-full bg-success" /><span className="text-success font-medium">Commander Online</span></>
              ) : (
                <><span className="w-2 h-2 rounded-full bg-muted-foreground/30" /><span className="text-muted-foreground">Waiting for Commander</span></>
              )}
          </div>
        </div>

        <Card className="shadow-elevation-small">
          <CardContent className="flex flex-col sm:flex-row items-center justify-center gap-6 py-8">
            <div className="flex flex-col items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Room Code</span>
              <div className="text-4xl md:text-5xl font-mono font-bold tracking-[0.15em] text-primary">
                <span>{quiz.id}</span>
              </div>
              <Button variant="ghost" size="sm" className="h-10 touch-target text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all" onClick={() => copyToClipboard(quiz.id)} aria-label="Copy room code">
                <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy Code
              </Button>
            </div>
            {shareableLink && (
              <div className="hidden sm:block w-px h-16 bg-border/50" />
            )}
            {shareableLink && (
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs text-muted-foreground">Or scan to join</span>
                <div className="bg-white p-3 rounded-[12px] shadow-elevation-small ring-1 ring-black/5">
                  <QRCode value={shareableLink} size={120} aria-label={`QR code to join quiz ${quiz.id}`} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-elevation-small">
          <CardHeader className="pb-4 text-center">
            <CardTitle className="font-headline flex items-center justify-center gap-2.5 text-xl">
                <Users className="w-5 h-5 text-primary" />
                Participants
            </CardTitle>
            <CardDescription className="text-sm">{isTeacher ? `${studentCount} gladiator${studentCount !== 1 ? 's' : ''} have joined. ${readyCount} ready.` : "See who's ready for battle."}</CardDescription>
          </CardHeader>
          <CardContent>
                <div className="flex flex-wrap justify-center gap-4">
                  {areParticipantsLoading && studentCount === 0 ? (
                     Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex flex-col items-center gap-2 text-center">
                        <Skeleton className="h-14 w-14 rounded-full" />
                        <Skeleton className="h-3 w-16 rounded" />
                      </div>
                    ))
                  ) : studentParticipants.length > 0 ? studentParticipants.map(p => (
                    <div key={p.user_id} className="flex flex-col items-center gap-2 text-center group">
                      <div className="relative">
                        <Avatar className={cn("h-14 w-14 md:h-16 md:w-16 ring-2 ring-offset-2 ring-offset-card shadow-elevation-small", p.ready ? "ring-success/60" : "ring-border")}>
                          <AvatarFallback className="text-2xl bg-secondary">{p.avatar || '🎮'}</AvatarFallback>
                        </Avatar>
                        {p.ready ? (
                          <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center w-5 h-5 bg-success rounded-full border-2 border-card" title="Ready">
                            <CheckCircle2 className="w-3 h-3 text-white" />
                          </span>
                        ) : (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-muted-foreground/40 rounded-full border-2 border-card" title="Not ready" />
                        )}
                      </div>
                      <span className="text-xs font-medium max-w-20 truncate">{p.name || p.user_id.slice(0, 8)}</span>
                      <span className={cn("text-[10px] font-semibold", p.ready ? "text-success" : "text-muted-foreground")}>
                        {p.ready ? 'READY' : 'NOT READY'}
                      </span>
                      {isTeacher && p.user_id !== quiz.created_by && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="touch-target h-7 px-2 text-[10px] md:opacity-0 md:group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300"
                          onClick={() => setKickingId(p.user_id)}
                        >
                          Kick
                        </Button>
                      )}
                    </div>
                  )                  ) : (
                    <div className="flex flex-col items-center gap-2 py-8 text-center" role="status">
                      <div className="w-12 h-12 rounded-[14px] bg-muted/40 flex items-center justify-center">
                        <Users className="w-5 h-5 text-muted-foreground/60" aria-hidden="true" />
                      </div>
                      <p className="text-sm text-muted-foreground">Waiting for participants to arrive...</p>
                      <p className="text-xs text-muted-foreground/60">{isTeacher ? 'Share the room code above to invite gladiators.' : 'Once others join, they will appear here.'}</p>
                    </div>
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
          <Card className="shadow-elevation-small">
            <CardHeader className="pb-3">
              <CardTitle className="font-headline flex items-center gap-2.5 text-lg">
                <ShieldCheck className="w-5 h-5 text-primary" />
                Battle Configuration
              </CardTitle>
              <CardDescription className="text-sm">Configure how this battle starts and how gladiators progress.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-4 rounded-[12px] border border-border/50 p-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Require everyone ready</p>
                  <p className="text-xs text-muted-foreground">Only allow start when every gladiator is ready. {readyCount}/{studentCount} ready.</p>
                </div>
                <button
                  role="switch"
                  aria-checked={requireAllReady}
                  aria-label="Require all gladiators ready before starting"
                  disabled={isUpdatingConfig}
                  onClick={() => handleRequireAllReadyChange(!requireAllReady)}
                  className={cn(
                    "relative shrink-0 w-11 h-6 rounded-full transition-colors duration-300 disabled:opacity-50 p-2.5 -m-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                    requireAllReady ? "bg-primary" : "bg-muted-foreground/30"
                  )}
                >
                  <span className={cn(
                    "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background shadow-elevation-small transition-transform duration-300 pointer-events-none",
                    requireAllReady && "translate-x-5"
                  )} />
                </button>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-[12px] border border-border/50 p-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Independent mode</p>
                  <p className="text-xs text-muted-foreground">Each gladiator gets their own timer and question flow. Question order and options are shuffled.</p>
                </div>
                <button
                  role="switch"
                  aria-checked={independentMode}
                  aria-label="Enable independent battle mode"
                  disabled={isUpdatingConfig}
                  onClick={() => handleModeChange(!independentMode)}
                  className={cn(
                    "relative shrink-0 w-11 h-6 rounded-full transition-colors duration-300 disabled:opacity-50 p-2.5 -m-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                    independentMode ? "bg-primary" : "bg-muted-foreground/30"
                  )}
                >
                  <span className={cn(
                    "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background shadow-elevation-small transition-transform duration-300 pointer-events-none",
                    independentMode && "translate-x-5"
                  )} />
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {isTeacher && (
          <Button 
            size="lg" 
            className="w-full text-base font-headline font-semibold touch-target" 
            onClick={handleStartQuiz}
            disabled={studentCount === 0 || areParticipantsLoading || isStarting || readyGate}
          >
            {isStarting ? <Loader2 className="mr-2.5 h-5 w-5 animate-spin" /> : <ShieldCheck className="mr-2.5 h-5 w-5" />}
             {isStarting
              ? 'Starting battle...'
              : areParticipantsLoading && studentCount === 0
              ? 'Loading participants...'
              : studentCount === 0 
              ? 'Waiting for gladiators to join...'
              : readyGate
              ? `Waiting for ${studentCount - readyCount} more gladiator${studentCount - readyCount !== 1 ? 's' : ''} to be ready...`
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
            <Button
              size="lg"
              variant={selfReady ? 'default' : 'outline'}
              className="w-full text-base font-headline font-semibold touch-target"
              onClick={handleToggleReady}
              disabled={isReadyToggling}
            >
              {isReadyToggling ? <Loader2 className="mr-2.5 h-5 w-5 animate-spin" /> : selfReady ? <CheckCircle2 className="mr-2.5 h-5 w-5" /> : <Hand className="mr-2.5 h-5 w-5" />}
              {selfReady ? "Ready! Awaiting the Commander..." : "I'm Ready"}
            </Button>
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

        <AlertDialog open={!!kickingId} onOpenChange={(open) => { if (!open && !isKicking) setKickingId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this Gladiator from this Arena?</AlertDialogTitle>
              <AlertDialogDescription>
                The gladiator will be removed immediately and redirected to the kicked screen. They will not be able to rejoin this specific arena.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isKicking}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); void handleKick(); }}
                disabled={isKicking}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isKicking ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
                Remove Gladiator
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
