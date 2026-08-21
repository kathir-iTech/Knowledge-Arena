'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ChevronLeft, ChevronDown, Trash2, Pencil, Copy, Download, Send, Archive, FolderOpen,
  Loader2, CheckCircle2, BookOpen, Clock, User, RefreshCw, AlertTriangle, Plus, X, Sparkles, FileText, Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuestionPreviewModal } from '@/components/quiz/QuestionPreviewModal';

interface SetQuestion {
  id: string;
  text: string;
  options: string[];
  correctAnswerIndex: number | null;
  explanation: string;
  category: string;
  difficulty: string;
  tags: string;
  source: string;
  createdBy: string | null;
  createdAt: number | null;
  updatedAt: number | null;
}

interface QuizSet {
  setId: string;
  title: string;
  category: string;
  source: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number | null;
  questionCount: number;
  difficulties: Record<string, number>;
  tags: string;
  status: 'published' | 'archived' | null;
  questions: SetQuestion[];
}

const DIFFICULTY_OPTIONS = ['easy', 'moderate', 'medium', 'hard'];

const difficultyColor: Record<string, string> = {
  easy: 'text-success bg-success/5 border-success/20',
  medium: 'text-warning bg-warning/5 border-warning/20',
  moderate: 'text-primary bg-primary/5 border-primary/20',
  hard: 'text-destructive bg-destructive/5 border-destructive/20',
};

const difficultyDot: Record<string, string> = {
  easy: 'bg-success',
  medium: 'bg-warning',
  moderate: 'bg-primary',
  hard: 'bg-destructive',
};

function formatDate(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function SourceBadge({ source }: { source: string }) {
  const isForge = source === 'ai_pdf_forge';
  return (
    <Badge variant="outline" className={cn('text-[10px] h-5', isForge ? 'text-warning bg-warning/5 border-warning/20' : 'text-primary bg-primary/5 border-primary/20')}>
      {isForge ? <Sparkles className="w-3 h-3 mr-1" /> : <FileText className="w-3 h-3 mr-1" />}
      {source === 'ai_pdf_forge' ? 'AI Forge' : source}
    </Badge>
  );
}

export default function QuizSetDetailPage({ params }: { params: Promise<{ setId: string }> }) {
  const { auth } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();

  const [set, setSet] = useState<QuizSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');

  const [editing, setEditing] = useState<SetQuestion | null>(null);
  const [editForm, setEditForm] = useState<SetQuestion | null>(null);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Preview as Gladiator state
  const [previewQuestion, setPreviewQuestion] = useState<SetQuestion | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  useEffect(() => {
    params.then(p => setId(p.setId));
  }, [params]);

  const getToken = useCallback(async () => {
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
    if (!token) throw new Error('UNAUTHORIZED');
    return token;
  }, [auth]);

  const fetchSet = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const token = await getToken();
      const res = await fetch(`/api/executive/question-bank/sets/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to load quiz set (${res.status})`);
      }
      const data = await res.json();
      setSet(data.set || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [auth, id, getToken]);

  useEffect(() => {
    if (id) fetchSet();
  }, [id, fetchSet]);

  const patchSet = async (body: Record<string, unknown>) => {
    const token = await getToken();
    const res = await fetch(`/api/executive/question-bank/sets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || `Request failed (${res.status})`);
    }
  };

  const saveRename = async () => {
    if (!renameTitle.trim()) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'Title is required.' });
      return;
    }
    try {
      setBusy(true);
      await patchSet({ title: renameTitle.trim() });
      toast({ title: 'Set Renamed' });
      setRenameOpen(false);
      fetchSet();
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Rename Failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (status: 'published' | 'archived' | null) => {
    try {
      setBusy(true);
      await patchSet({ status });
      toast({
        title: status === 'archived' ? 'Set Archived' : status === 'published' ? 'Set Published' : 'Set Restored',
        description: status === 'archived' ? 'This set is hidden from the active library.' : status === 'published' ? 'This set is marked as published.' : 'This set is active again.',
      });
      fetchSet();
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Update Failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setBusy(false);
    }
  };

  const duplicateSet = async () => {
    try {
      setBusy(true);
      const token = await getToken();
      const res = await fetch(`/api/executive/question-bank/sets/${id}/duplicate`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Duplicate failed (${res.status})`);
      }
      const data = await res.json();
      toast({ title: 'Set Duplicated', description: 'A copy of this set was created.' });
      router.push(`/executive/question-bank/sets/${data.setId}`);
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Duplicate Failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setBusy(false);
    }
  };

  const exportSet = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/executive/question-bank/sets/${id}/export`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') || '';
      a.download = (cd.match(/filename="?([^"]+)"?/)?.[1]) || `quiz-set-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export Ready', description: 'Quiz set exported as JSON.' });
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Export Failed', description: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  const deleteSet = async () => {
    if (!set) return;
    if (!window.confirm(`Delete the quiz set "${set.title}" (${set.questionCount} questions) permanently? This cannot be undone.`)) return;
    try {
      setBusy(true);
      const token = await getToken();
      const res = await fetch(`/api/executive/question-bank/sets/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Delete failed (${res.status})`);
      }
      toast({ title: 'Set Deleted', description: `${set.questionCount} questions removed.` });
      router.push('/executive/question-bank');
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Delete Failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setBusy(false);
    }
  };

  const startEditing = (q: SetQuestion) => {
    setEditing(q);
    setEditForm({ ...q, options: [...q.options], correctAnswerIndex: q.correctAnswerIndex ?? 0, difficulty: q.difficulty || 'medium', category: q.category || 'General', tags: q.tags || '', explanation: q.explanation || '' });
  };

  const openPreview = (q: SetQuestion, idx: number) => {
    setPreviewQuestion(q);
    setPreviewIndex(idx);
    setPreviewOpen(true);
  };

  const saveQuestion = async () => {
    if (!editing || !editForm) return;
    if (editForm.text.trim().length < 5) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'Question text must be at least 5 characters.' });
      return;
    }
    if (editForm.options.filter(o => o.trim()).length < 2) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'At least 2 non-empty options are required.' });
      return;
    }
    if (editForm.correctAnswerIndex == null || editForm.correctAnswerIndex < 0 || editForm.correctAnswerIndex >= editForm.options.length) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'Please select a valid correct answer.' });
      return;
    }
    try {
      setSavingQuestion(true);
      const token = await getToken();
      const res = await fetch(`/api/executive/question-bank/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          text: editForm.text,
          options: editForm.options.filter(o => o.trim()),
          correctAnswerIndex: editForm.correctAnswerIndex,
          explanation: editForm.explanation,
          category: editForm.category,
          difficulty: editForm.difficulty,
          tags: editForm.tags,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to update question');
      }
      toast({ title: 'Question Updated' });
      setEditing(null);
      setEditForm(null);
      fetchSet();
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Update Failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setSavingQuestion(false);
    }
  };

  const deleteQuestion = async (q: SetQuestion) => {
    if (!window.confirm('Delete this question permanently? This cannot be undone.')) return;
    try {
      setDeletingId(q.id);
      const token = await getToken();
      const res = await fetch(`/api/executive/question-bank/${q.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to delete question');
      }
      toast({ title: 'Question Deleted' });
      fetchSet();
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Delete Failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="page-container animate-in space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !set) {
    return (
      <div className="page-container animate-in space-y-4">
        <Card className="border-destructive/40">
          <CardContent className="py-16 text-center">
            <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-4" />
            <p className="text-base font-medium mb-1">Failed to load quiz set</p>
            <p className="text-sm text-muted-foreground mb-4">{error || 'Quiz set not found.'}</p>
            <Button onClick={fetchSet}><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button>
            <Button variant="ghost" asChild className="ml-2"><Link href="/executive/question-bank">Back to Library</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const difficultyEntries = DIFFICULTY_OPTIONS.filter(d => (set.difficulties[d] || 0) > 0);

  return (
    <div className="page-container animate-in space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1">
            <Link href="/executive/question-bank"><ChevronLeft className="w-4 h-4 mr-1" /> Quiz Library</Link>
          </Button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-page-title font-headline tracking-tight break-words">{set.title}</h1>
            {set.status === 'published' && (
              <Badge variant="outline" className="text-[10px] h-5 text-success bg-success/5 border-success/20">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Published
              </Badge>
            )}
            {set.status === 'archived' && (
              <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground"><Archive className="w-3 h-3 mr-1" /> Archived</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px] h-5">{set.category}</Badge>
            <SourceBadge source={set.source} />
            {difficultyEntries.map(d => (
              <Badge key={d} variant="outline" className={cn('text-[10px] h-5 capitalize', difficultyColor[d] || '')}>
                {set.difficulties[d]} {d}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button variant="outline" size="sm" onClick={() => { setRenameOpen(true); setRenameTitle(set.title); }}>
            <Pencil className="w-4 h-4 mr-1.5" /> Rename
          </Button>
          <Button variant="outline" size="sm" onClick={duplicateSet} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Copy className="w-4 h-4 mr-1.5" />} Duplicate
          </Button>
          <Button variant="outline" size="sm" onClick={exportSet}>
            <Download className="w-4 h-4 mr-1.5" /> Export
          </Button>
          {set.status !== 'published' ? (
            <Button variant="outline" size="sm" onClick={() => toggleStatus('published')} disabled={busy}>
              <Send className="w-4 h-4 mr-1.5" /> Publish
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => toggleStatus(null)} disabled={busy}>
              <CheckCircle2 className="w-4 h-4 mr-1.5" /> Unpublish
            </Button>
          )}
          {set.status !== 'archived' ? (
            <Button variant="outline" size="sm" onClick={() => toggleStatus('archived')} disabled={busy}>
              <Archive className="w-4 h-4 mr-1.5" /> Archive
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => toggleStatus(null)} disabled={busy}>
              <FolderOpen className="w-4 h-4 mr-1.5" /> Restore
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={deleteSet} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />} Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tabular-nums">{set.questionCount}</p>
              <p className="text-xs text-muted-foreground">Questions</p>
            </div>
          </CardContent>
        </Card>
        {difficultyEntries.map(d => (
          <Card key={d} className="card-hover">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn('w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0', difficultyDot[d] || 'bg-muted')}>
                <span className="text-[10px] font-bold text-white uppercase">{d.slice(0, 1)}</span>
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold tabular-nums">{set.difficulties[d]}</p>
                <p className="text-xs text-muted-foreground capitalize">{d}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="card-hover">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="w-4 h-4 shrink-0" /> Created by <span className="font-medium text-foreground truncate">{set.createdBy ? set.createdBy.slice(0, 16) : '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-4 h-4 shrink-0" /> Created <span className="font-medium text-foreground">{formatDate(set.createdAt)}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <RefreshCw className="w-4 h-4 shrink-0" /> Updated <span className="font-medium text-foreground">{formatDate(set.updatedAt)}</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="font-headline font-bold text-lg">Questions</h2>
        <Button variant="ghost" size="sm" onClick={fetchSet} disabled={loading}>
          <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} /> Refresh
        </Button>
      </div>

      {set.questions.length === 0 ? (
        <EmptyState icon={BookOpen} title="No Questions in This Set" description="This set has no questions. It may have been emptied." />
      ) : (
        <ul className="space-y-3">
          {set.questions.map((q, qi) => {
            const expanded = expandedId === q.id;
            return (
              <Card key={q.id} className="card-hover overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : q.id)}
                  className="w-full text-left p-4 flex items-start justify-between gap-3 hover:bg-secondary/10 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="shrink-0 w-7 h-7 rounded-[8px] bg-primary/10 text-primary flex items-center justify-center text-xs font-bold mt-0.5">
                      {qi + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-relaxed">{q.text}</p>
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={cn('text-[10px] h-5 capitalize', difficultyColor[q.difficulty] || '')}>{q.difficulty}</Badge>
                        <span className="text-[11px] text-muted-foreground">{q.options.length} options</span>
                      </div>
                    </div>
                  </div>
                  <ChevronDown className={cn('w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform', expanded && 'rotate-180')} />
                </button>
                {expanded && (
                  <div className="px-4 pb-4 space-y-4 animate-in">
                    <div className="space-y-2">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className={cn(
                          'flex items-start gap-2.5 p-3 rounded-[10px] text-sm border',
                          q.correctAnswerIndex === oi
                            ? 'bg-success/5 border-success/20'
                            : 'bg-muted/30 border-border/50'
                        )}>
                          <div className={cn(
                            'shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                            q.correctAnswerIndex === oi ? 'bg-success text-success-foreground' : 'bg-background text-muted-foreground'
                          )}>
                            {String.fromCharCode(65 + oi)}
                          </div>
                          <span className="min-w-0 flex-1">{opt}</span>
                          {q.correctAnswerIndex === oi && (
                            <span className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-success">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Correct
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    {q.explanation && (
                      <div className="p-3 rounded-[10px] bg-muted/30 border border-border/50 text-sm">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Explanation</p>
                        <p className="text-muted-foreground">{q.explanation}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => openPreview(q, qi)}>
                        <Eye className="w-3.5 h-3.5 mr-1.5" /> Preview as Gladiator
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => startEditing(q)}>
                        <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteQuestion(q)} disabled={deletingId === q.id}>
                        {deletingId === q.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />} Delete
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </ul>
      )}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Quiz Set</DialogTitle>
            <DialogDescription>Update the title of this quiz set.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="rename-title">Title</Label>
            <Input id="rename-title" value={renameTitle} onChange={e => setRenameTitle(e.target.value)} maxLength={120} />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setRenameOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={saveRename} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={open => { if (!open) { setEditing(null); setEditForm(null); } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Question</DialogTitle>
            <DialogDescription>Update the question, options, and metadata below.</DialogDescription>
          </DialogHeader>
          {editForm && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="q-edit-text">Question Text</Label>
                <Textarea id="q-edit-text" value={editForm.text} onChange={e => setEditForm({ ...editForm, text: e.target.value })} rows={3} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Options</Label>
                  <Button variant="ghost" size="sm" onClick={() => setEditForm(prev => prev && { ...prev, options: [...prev.options, ''] })}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Option
                  </Button>
                </div>
                {editForm.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <Button
                      type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0 text-xs font-bold"
                      onClick={() => setEditForm(prev => prev && { ...prev, correctAnswerIndex: oi })}
                      title="Mark as correct answer"
                    >
                      {editForm.correctAnswerIndex === oi ? '✓' : String.fromCharCode(65 + oi)}
                    </Button>
                    <Input
                      value={opt}
                      onChange={e => setEditForm(prev => prev && { ...prev, options: prev.options.map((o, i) => (i === oi ? e.target.value : o)) })}
                      placeholder={`Option ${oi + 1}`}
                    />
                    {editForm.options.length > 2 && (
                      <Button
                        type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-destructive"
                        onClick={() => setEditForm(prev => prev && {
                          ...prev,
                          options: prev.options.filter((_, i) => i !== oi),
                          correctAnswerIndex: prev.correctAnswerIndex === oi
                            ? 0
                            : (prev.correctAnswerIndex ?? 0) > oi
                              ? (prev.correctAnswerIndex ?? 0) - 1
                              : (prev.correctAnswerIndex ?? 0),
                        })}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground">Click a letter button to mark the correct answer.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="q-edit-category">Category</Label>
                  <Input id="q-edit-category" value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Difficulty</Label>
                  <Select value={editForm.difficulty} onValueChange={v => setEditForm(prev => prev && { ...prev, difficulty: v })}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Difficulty" /></SelectTrigger>
                    <SelectContent>
                      {DIFFICULTY_OPTIONS.map(d => <SelectItem key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="q-edit-tags">Tags (comma separated)</Label>
                <Input id="q-edit-tags" value={editForm.tags} onChange={e => setEditForm({ ...editForm, tags: e.target.value })} placeholder="e.g. finance, leadership" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="q-edit-explanation">Explanation</Label>
                <Textarea id="q-edit-explanation" value={editForm.explanation} onChange={e => setEditForm({ ...editForm, explanation: e.target.value })} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => { setEditing(null); setEditForm(null); }} disabled={savingQuestion}>Cancel</Button>
            <Button onClick={saveQuestion} disabled={savingQuestion || !editForm}>
              {savingQuestion ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuestionPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        question={
          previewQuestion
            ? {
                text: previewQuestion.text,
                options: previewQuestion.options,
                correctAnswerIndex: previewQuestion.correctAnswerIndex,
                explanation: previewQuestion.explanation,
                difficulty: previewQuestion.difficulty,
                tags: previewQuestion.tags,
                timer: 30,
              }
            : null
        }
        questionIndex={previewIndex}
        totalQuestions={set?.questionCount}
      />
    </div>
  );
}
