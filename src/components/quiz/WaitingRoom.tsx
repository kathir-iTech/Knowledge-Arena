
'use client';

import React, { useEffect, useState, useMemo } from 'react';
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

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const setup = () => {
      unsub = participantService.subscribeToParticipants(quiz.id, (parts) => {
        setParticipants(parts);
        setIsLoading(false);
        setTeacherOnline(parts.some(p => p.user_id === quiz.created_by));
        setIsReconnecting(false);
      });
    };

    const handleOffline = () => {
      setIsReconnecting(true);
      reconnectTimer = setTimeout(setup, 3000);
    };

    window.addEventListener('offline', handleOffline);
    setup();

    return () => {
      unsub?.();
      clearTimeout(reconnectTimer);
      window.removeEventListener('offline', handleOffline);
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
        await quizService.updateQuizStatus(quiz.id, 'live');
        await quizService.advanceToQuestion(quiz.id, 0);
    } catch {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to start quiz.' });
    }
  };

  const studentCount = studentParticipants.length;
  const areParticipantsLoading = isLoading;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 md:p-8 space-y-6">
      <header className="text-center">
        <h1 className="text-4xl font-headline text-primary tracking-tight">Quiz Room: {quiz.title}</h1>
        <p className="text-muted-foreground">The quiz will begin shortly. Awaiting the host's command.</p>
      </header>

      {isReconnecting && (
        <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 px-4 py-2 rounded-full text-sm">
          <Loader2 className="animate-spin h-4 w-4" />
          <span>Connection lost. Reconnecting...</span>
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="font-bold">{studentCount}</span>
          <span className="text-muted-foreground">connected</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {teacherOnline ? (
            <><Wifi className="w-4 h-4 text-green-500" /><span className="text-green-500">Teacher Online</span></>
          ) : (
            <><WifiOff className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground">Waiting for Teacher</span></>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl">
        <Card className="md:col-span-2 border-accent/50">
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2">
                <Users />
                Gladiators in the Arena
            </CardTitle>
            <CardDescription>{isTeacher ? `${studentCount} student(s) have joined.` : "See who's ready for battle."}</CardDescription>
          </CardHeader>
          <CardContent>
                <div className="flex flex-wrap gap-4">
                  {areParticipantsLoading && studentCount === 0 ? (
                     Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex flex-col items-center gap-2 text-center">
                        <Skeleton className="h-16 w-16 rounded-full" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                    ))
                  ) : studentParticipants.length > 0 ? studentParticipants.map(p => (
                    <div key={p.user_id} className="flex flex-col items-center gap-2 text-center">
                      <Avatar className="h-16 w-16">
                        <AvatarFallback className="text-3xl bg-secondary">{p.avatar || '🎮'}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium max-w-20 truncate">{p.name || p.user_id.slice(0, 8)}</span>
                    </div>
                  )) : (
                    <p className="text-muted-foreground">Waiting for gladiators to arrive...</p>
                  )}
                </div>
          </CardContent>
        </Card>
        
        <Card className="bg-secondary">
          <CardHeader>
            <CardTitle className="font-headline">Join the Quiz</CardTitle>
            <CardDescription>Use this code or QR to enter the arena.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="text-5xl font-mono font-bold tracking-widest text-primary bg-background/50 p-4 rounded-lg flex items-center gap-2">
              <span>{quiz.id}</span>
              <Button variant="ghost" size="icon" onClick={() => copyToClipboard(quiz.id)}>
                <Copy className="w-6 h-6" />
              </Button>
            </div>
            {shareableLink && (
              <div className="bg-white p-4 rounded-lg">
                <QRCode value={shareableLink} size={Math.min(128, typeof window !== 'undefined' ? window.innerWidth * 0.3 : 128)} />
              </div>
            )}
            {!teacherOnline && !isTeacher && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
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
              className="w-full bg-accent hover:bg-accent/80 text-accent-foreground text-lg py-8" 
              onClick={handleStartQuiz}
              disabled={studentCount === 0 || areParticipantsLoading}
            >
              <ShieldCheck className="mr-3 h-6 w-6" />
               {areParticipantsLoading && studentCount === 0
                ? 'Loading participants...'
                : studentCount === 0 
                ? 'Waiting for students to join...'
                : `Start Quiz for ${studentCount} Gladiator(s)`}
            </Button>
        </div>
      )}
    </div>
  );
}
