'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { quizService } from '@/services/quiz.service';
import { participantService } from '@/services/participant.service';
import { Swords, Users, Calendar, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import type { ValidatedQuiz, ValidatedParticipant } from '@/lib/schemas';

export default function CommanderHistoryPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<ValidatedQuiz[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQuizzes = useCallback(() => {
    if (!user) return;
    quizService.getQuizzesByCreator(user.id)
      .then(setQuizzes)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { fetchQuizzes(); }, [fetchQuizzes]);

  const finishedQuizzes = quizzes.filter(q => q.status === 'finished' && !q.archived);

  if (loading) return <LoadingScreen message="Loading battle history..." />;

  return (
    <div className="page-container safe-bottom animate-in">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.push('/commander/dashboard')} aria-label="Back to dashboard">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-page-title font-headline tracking-tight">Battle History</h1>
        <span className="text-sm text-muted-foreground ml-auto">{finishedQuizzes.length} battle{finishedQuizzes.length !== 1 ? 's' : ''}</span>
      </div>

      {finishedQuizzes.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-border/50 rounded-[18px]">
          <Swords className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <p className="text-base text-muted-foreground mb-4">No completed battles yet.</p>
          <Button asChild><Link href="/commander/dashboard">Create an Arena</Link></Button>
        </div>
      ) : (
        <div className="space-y-4">
          {finishedQuizzes.map(q => (
            <BattleHistoryCard key={q.id} quiz={q} />
          ))}
        </div>
      )}
    </div>
  );
}

function BattleHistoryCard({ quiz }: { quiz: ValidatedQuiz }) {
  const [participants, setParticipants] = useState<ValidatedParticipant[]>([]);

  useEffect(() => {
    const sub = participantService.subscribeToParticipants(quiz.id, setParticipants);
    return () => sub();
  }, [quiz.id]);

  const studentParticipants = participants.filter(p => p.user_id !== quiz.created_by);
  const participantCount = studentParticipants.length;
  const completedCount = studentParticipants.filter(p => p.status === 'finished').length;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Link href={`/battle/${quiz.id}`} className="text-card-title font-headline tracking-tight hover:text-primary transition-colors truncate">
              {quiz.title}
            </Link>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5">
              <span className="font-mono text-[11px] bg-muted/50 px-2 py-0.5 rounded-[6px]">{quiz.id}</span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {participantCount} gladiator{participantCount !== 1 ? 's' : ''}
              </span>
              {!!quiz.created_at && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(quiz.created_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={`/battle/${quiz.id}`}>View Results</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
