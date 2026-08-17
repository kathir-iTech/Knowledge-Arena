'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import {
  BookOpen, CheckCircle2, AlertTriangle, RefreshCw, Trash2, Clock, Tag, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuestionDetail {
  id: string;
  text: string;
  options: string[];
  correctAnswerIndex: number | null;
  explanation?: string;
  category: string;
  difficulty: string;
  tags: string;
  source: string;
  createdBy?: string | null;
  createdAt?: number | null;
  updatedAt?: number | null;
}

const difficultyColors: Record<string, string> = {
  easy: 'text-success bg-success/10 border-success/25 dark:bg-success/20',
  medium: 'text-warning bg-warning/10 border-warning/25 dark:bg-warning/20',
  hard: 'text-destructive bg-destructive/10 border-destructive/25 dark:bg-destructive/20',
};

function formatDate(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

export default function ExecutiveQuestionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter();
  const [question, setQuestion] = useState<QuestionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    params.then(p => setId(p.id));
  }, [params]);

  const fetchQuestion = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`/api/executive/question-bank/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setQuestion(data.question || null);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to load question.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [auth, id]);

  useEffect(() => {
    if (!user || !id) return;
    fetchQuestion();
  }, [user, id, fetchQuestion]);

  const handleDelete = async () => {
    if (!window.confirm('Delete this question permanently? This cannot be undone.')) return;
    try {
      setDeleting(true);
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`/api/executive/question-bank/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast({ title: data?.error || 'Failed to delete question', variant: 'destructive' });
        return;
      }
      toast({ title: 'Question deleted' });
      router.push('/executive/question-bank');
    } catch {
      toast({ title: 'Failed to delete question', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container animate-in space-y-6">
        <div className="space-y-1.5">
          <Skeleton className="h-10 w-44" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !question) {
    return (
      <div className="page-container animate-in space-y-4 safe-bottom">
        <Card className="border-destructive/40">
          <CardContent className="py-16 text-center">
            <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-4" />
            <p className="text-base font-medium mb-1">Failed to load question</p>
            <p className="text-sm text-muted-foreground mb-4">{error || 'Question not found.'}</p>
            <Button onClick={fetchQuestion}><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-container animate-in space-y-6 safe-bottom">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-page-title font-headline tracking-tight">Question Details</h1>
            <Badge variant="outline" className={cn('text-[10px] h-5 capitalize', difficultyColors[question.difficulty] || '')}>
              {question.difficulty}
            </Badge>
          </div>
          <p className="text-base text-muted-foreground">{question.category}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchQuestion} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="w-4 h-4 mr-2" /> {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetaChip icon={Tag} label="Source" value={question.source || 'manual'} />
        <MetaChip icon={Clock} label="Created" value={formatDate(question.createdAt)} />
        <MetaChip icon={Clock} label="Updated" value={formatDate(question.updatedAt)} />
        <MetaChip icon={User} label="Created By" value={question.createdBy ? question.createdBy.slice(0, 16) : '—'} />
      </div>

      {/* Question */}
      <Card className="card-hover">
        <CardHeader className="border-b border-border/30 pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" /> Question
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <p className="text-base font-medium">{question.text || 'No question text'}</p>
          {question.tags && (
            <div className="flex items-center gap-2 flex-wrap">
              {question.tags.split(',').map((tag, i) => (
                <Badge key={i} variant="outline" className="text-[10px]">{tag.trim()}</Badge>
              ))}
            </div>
          )}
          <div className="space-y-2">
            {question.options.map((opt, oi) => (
              <div key={oi} className={cn(
                'flex items-start gap-2.5 p-3 rounded-[10px] text-sm border',
                question.correctAnswerIndex === oi
                  ? 'bg-success/10 border-success/25 dark:bg-success/20'
                  : 'bg-muted/30 border-border/50'
              )}>
                <div className={cn(
                  'shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                  question.correctAnswerIndex === oi ? 'bg-success text-background' : 'bg-background text-muted-foreground'
                )}>
                  {String.fromCharCode(65 + oi)}
                </div>
                <span className="min-w-0 flex-1">{opt}</span>
                {question.correctAnswerIndex === oi && (
                  <span className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-success">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Correct
                  </span>
                )}
              </div>
            ))}
          </div>
          {question.explanation && (
            <div className="p-3 rounded-[10px] bg-accent/10 border border-accent/25 dark:bg-accent/15 text-sm">
              <p className="text-[10px] font-semibold text-accent uppercase tracking-wider mb-1">Explanation</p>
              <p className="text-muted-foreground">{question.explanation}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetaChip({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <Card className="card-hover">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-semibold truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
