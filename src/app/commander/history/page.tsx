'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { quizService } from '@/services/quiz.service';
import { participantService } from '@/services/participant.service';
import { Swords, Users, Calendar, ArrowLeft, Search, Download, Star, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import type { ValidatedQuiz, ValidatedParticipant } from '@/lib/schemas';

export default function CommanderHistoryPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [quizzes, setQuizzes] = useState<ValidatedQuiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchQuizzes = useCallback(() => {
    if (!user) return;
    quizService.getQuizzesByCreator(user.id)
      .then(setQuizzes)
      .catch(() => { toast({ variant: 'destructive', title: 'Error', description: 'Failed to load battle history.' }); })
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { fetchQuizzes(); }, [fetchQuizzes]);

  const finishedQuizzes = useMemo(() => {
    let result = quizzes.filter(q => q.status === 'finished' && !q.archived);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(quiz => quiz.title.toLowerCase().includes(q) || quiz.id.toLowerCase().includes(q));
    }
    return result.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  }, [quizzes, search]);

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

      <div className="relative max-w-md mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or room code..."
          className="pl-9"
        />
      </div>

      {finishedQuizzes.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-border/50 rounded-[18px]">
          <Swords className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <p className="text-base text-muted-foreground mb-4">
            {search ? 'No battles match your search.' : 'No completed battles yet.'}
          </p>
          {!search && <Button asChild><Link href="/commander/dashboard">Create an Arena</Link></Button>}
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
  const sorted = [...studentParticipants].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const avgScore = sorted.length > 0 ? Math.round(sorted.reduce((s, p) => s + p.score, 0) / sorted.length) : 0;

  const exportCSV = () => {
    const rows = [['Rank', 'Name', 'Score', 'Status']];
    sorted.forEach((p, i) => {
      rows.push([String(i + 1), p.name || p.user_id.slice(0, 8), String(p.score), p.status]);
    });
    const csv = rows.map(r => `"${r.map(c => c.replace(/"/g, '""')).join('","')}"`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arena-${quiz.id}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-card-title font-headline tracking-tight truncate block">{quiz.title}</span>
              <Badge variant="outline" className="text-[10px] shrink-0">COMPLETED</Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5 flex-wrap">
              <span className="font-mono text-[11px] bg-muted/50 px-2 py-0.5 rounded-[6px]">{quiz.id}</span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {participantCount} participant{participantCount !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(quiz.created_at || 0).toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1">
                <Star className="w-3 h-3" />
                Avg: {avgScore}
              </span>
              {winner && (
                <span className="flex items-center gap-1">
                  <Trophy className="w-3 h-3 text-amber-500" />
                  {winner.name || winner.user_id.slice(0, 8)} ({winner.score} pts)
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={exportCSV}>
              <Download className="w-3.5 h-3.5 mr-1" /> CSV
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/battle/${quiz.id}`}>View</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
