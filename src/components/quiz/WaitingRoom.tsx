
'use client';

import React, { useEffect, useState, useMemo } from 'react';
import QRCode from 'react-qr-code';
import type { Quiz, QuizParticipant } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Copy, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '../ui/skeleton';
import { useFirestore, useCollection, updateDocumentNonBlocking } from '@/firebase';
import { collection, doc, serverTimestamp } from 'firebase/firestore';

interface WaitingRoomProps {
  quiz: Quiz;
  isTeacher: boolean;
}

export default function WaitingRoom({ quiz, isTeacher }: WaitingRoomProps) {
  const [shareableLink, setShareableLink] = useState('');
  const { toast } = useToast();
  const firestore = useFirestore();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShareableLink(window.location.href);
    }
  }, []);

  const participantsRef = useMemo(() => 
    collection(firestore, 'quizzes', quiz.id, 'participants'), 
    [firestore, quiz.id]
  );
  const { data: participants, isLoading: areParticipantsLoading } = useCollection<QuizParticipant>(participantsRef);
  
  const studentParticipants = useMemo(() => {
      return participants?.filter(p => p.role === 'student') || [];
  }, [participants]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: 'Copied!', description: `${text} copied to your clipboard.` });
    });
  };

  const handleStartQuiz = () => {
    if (!isTeacher || !firestore) return;
    const quizRef = doc(firestore, 'quizzes', quiz.id);
    updateDocumentNonBlocking(quizRef, { 
        status: 'live',
        currentQuestionIndex: 0,
        questionStartAt: serverTimestamp(),
    });
  };

  const studentCount = studentParticipants.length;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 md:p-8 space-y-6">
      <header className="text-center">
        <h1 className="text-4xl font-headline text-primary tracking-tight">Quiz Room: {quiz.title}</h1>
        <p className="text-muted-foreground">The quiz will begin shortly. Awaiting the host's command.</p>
      </header>
      
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
                    <div key={p.id} className="flex flex-col items-center gap-2 text-center">
                      <Avatar className="h-16 w-16">
                        <AvatarFallback className="text-3xl bg-secondary">{p.avatar}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium max-w-20 truncate">{p.name}</span>
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
                <QRCode value={shareableLink} size={128} />
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
};
