
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

interface WaitingRoomProps {
  quiz: ValidatedQuiz;
  isTeacher: boolean;
}

export default function WaitingRoom({ quiz, isTeacher }: WaitingRoomProps) {
  const [shareableLink, setShareableLink] = useState('');
  const { toast } = useToast();
  const [participants, setParticipants] = useState<ValidatedParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [teacherOnline, setTeacherOnline] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.origin);
      url.searchParams.set('roomCode', quiz.id);
      setShareableLink(url.toString());
    }
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
        setIsLoading(false);
        if (parts.some(p => p.user_id === quiz.created_by)) {
          setTeacherOnline(true);
        }
        setIsReconnecting(false);
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

    window.addEventListener('offline', handleOffline);

    const unsubQuiz = quizService.subscribeToQuiz(quiz.id, (q) => {
      if (mountedRef.current) setTeacherOnline(q.status === 'waiting' || q.status === 'live');
    });

    return () => {
      mountedRef.current = false;
      if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      window.removeEventListener('offline', handleOffline);
      unsubQuiz();
    };
  }, [quiz.id, quiz.created_by]);

  const studentParticipants = useMemo(() => {
      return participants.filter(p => p.user_id !== quiz.created_by) || [];
  }, [participants, quiz.created_by]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: 'Copied!', description: `${text} copied to your clipboard.` });
    });
  };

  const handleStartQuiz = async () => {
    if (!isTeacher) return;
    try {
        await quizService.startQuiz(quiz.id);
    } catch {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to start quiz.' });
    }
  };

  const studentCount = studentParticipants.length;
  const areParticipantsLoading = isLoading;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 md:p-8 space-y-8 animate-in">
      <header className="text-center space-y-2">
        <h1 className="text-display font-headline text-foreground tracking-tight">{quiz.title}</h1>
        <p className="text-base text-muted-foreground">The quiz will begin shortly. Awaiting the host&apos;s command.</p>
      </header>

      {isReconnecting && (
        <div className="flex items-center gap-2 bg-warning/5 border border-warning/10 px-4 py-2.5 rounded-[10px] text-sm" role="alert" aria-live="assertive">
          <Loader2 className="animate-spin h-4 w-4 text-warning" />
          <span className="text-warning font-medium">Connection lost. Reconnecting...</span>
        </div>
      )}

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-sm">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="font-semibold">{studentCount}</span>
          <span className="text-muted-foreground">connected</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {teacherOnline ? (
            <><Wifi className="w-4 h-4 text-success" /><span className="text-success font-medium">Teacher Online</span></>
          ) : (
            <><WifiOff className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground">Waiting for Teacher</span></>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl">
        <Card className="md:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="font-headline flex items-center gap-2.5 text-base">
                <Users className="w-5 h-5 text-primary" />
                Participants
            </CardTitle>
            <CardDescription className="text-sm">{isTeacher ? `${studentCount} student${studentCount !== 1 ? 's' : ''} have joined.` : "See who's ready for battle."}</CardDescription>
          </CardHeader>
          <CardContent>
                <div className="flex flex-wrap gap-4">
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
                  )) : (
                    <p className="text-sm text-muted-foreground">Waiting for participants to arrive...</p>
                  )}
                </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Join Quiz</CardTitle>
            <CardDescription className="text-sm">Use this code or scan QR to enter.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-5">
            <div className="text-3xl md:text-4xl font-mono font-bold tracking-widest text-primary bg-muted/30 px-5 py-3.5 rounded-[12px] flex items-center gap-3">
              <span>{quiz.id}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => copyToClipboard(quiz.id)} aria-label="Copy room code">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            {shareableLink && (
              <div className="bg-white p-3.5 rounded-[12px] shadow-elevation-small">
                <QRCode value={shareableLink} size={Math.min(130, typeof window !== 'undefined' ? window.innerWidth * 0.25 : 130)} aria-label={`QR code to join quiz ${quiz.id}`} />
              </div>
            )}
            {!teacherOnline && !isTeacher && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>Quiz starting soon...</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {isTeacher && (
        <div className="w-full max-w-6xl">
            <Button 
              size="lg" 
              className="w-full text-base font-headline font-semibold" 
              onClick={handleStartQuiz}
              disabled={studentCount === 0 || areParticipantsLoading}
            >
              <ShieldCheck className="mr-2.5 h-5 w-5" />
               {areParticipantsLoading && studentCount === 0
                ? 'Loading participants...'
                : studentCount === 0 
                ? 'Waiting for students to join...'
                : `Start Quiz for ${studentCount} Participant${studentCount !== 1 ? 's' : ''}`}
            </Button>
        </div>
      )}
    </div>
  );
}
