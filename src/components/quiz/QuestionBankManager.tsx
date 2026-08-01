'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
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
  Database, Search, RefreshCw, Pencil, Trash2, Eye, ChevronLeft, ChevronRight, Plus, X, Loader2, Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuestionListItem {
  id: string;
  text: string;
  category: string;
  difficulty: string;
  source: string;
  createdBy: string | null;
  createdAt: number | null;
  questionCount: number | null;
}

interface QuestionDetail extends QuestionListItem {
  options: string[];
  correctAnswerIndex: number | null;
  explanation: string;
  tags: string;
}

interface PageData {
  questions: QuestionListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface Filters {
  q: string;
  category: string;
  difficulty: string;
}

const DIFFICULTY_OPTIONS = ['easy', 'moderate', 'hard', 'medium'];

const difficultyColor: Record<string, string> = {
  easy: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800',
  medium: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800',
  moderate: 'text-blue-600 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800',
  hard: 'text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
};

function formatDate(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function QuestionBankManager({ refreshKey = 0 }: { refreshKey?: number }) {
  const { auth } = useFirebase();
  const { toast } = useToast();

  const [pages, setPages] = useState<PageData[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ q: '', category: 'all', difficulty: 'all' });
  const [searchInput, setSearchInput] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [totalLoaded, setTotalLoaded] = useState(0);

  const [editing, setEditing] = useState<QuestionDetail | null>(null);
  const [editForm, setEditForm] = useState<QuestionDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const cursorsRef = useRef<(string | null)[]>([]);

  const getToken = useCallback(async () => {
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
    if (!token) throw new Error('UNAUTHORIZED');
    return token;
  }, [auth]);

  const fetchCategories = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/executive/question-bank/categories', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch {
      // categories are optional; the filter just won't list unknown ones
    }
  }, [getToken]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(prev => (prev.q === searchInput.trim() ? prev : { ...prev, q: searchInput.trim() }));
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchPage = useCallback(async (targetPage: number) => {
    const f = filtersRef.current;
    try {
      setLoading(true);
      setError(null);
      const token = await getToken();
      const params = new URLSearchParams();
      if (f.q) params.set('q', f.q);
      if (f.category && f.category !== 'all') params.set('category', f.category);
      if (f.difficulty && f.difficulty !== 'all') params.set('difficulty', f.difficulty);
      if (targetPage > 0) {
        const cursor = cursorsRef.current[targetPage - 1] ?? null;
        if (cursor) params.set('cursor', cursor);
      }
      const res = await fetch(`/api/executive/question-bank?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to load questions (${res.status})`);
      }
      const data = await res.json();
      const pageData: PageData = {
        questions: data.questions || [],
        nextCursor: data.nextCursor || null,
        hasMore: !!data.hasMore,
      };
      cursorsRef.current[targetPage] = pageData.nextCursor;
      setPages(prev => {
        const next = [...prev];
        next[targetPage] = pageData;
        return next;
      });
      setPage(targetPage);
      setTotalLoaded(prev => (targetPage === 0 ? pageData.questions.length : prev + pageData.questions.length));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      toast({ variant: 'destructive', title: 'Failed to Load Questions', description: msg });
    } finally {
      setLoading(false);
    }
  }, [getToken, toast]);

  useEffect(() => {
    cursorsRef.current = [];
    setPages([]);
    setPage(0);
    setTotalLoaded(0);
    fetchPage(0);
  }, [filters, refreshKey, fetchPage]);

  const updateLocalItem = (updated: QuestionDetail) => {
    setPages(prev => prev.map(p => ({
      ...p,
      questions: p.questions.map(q => (q.id === updated.id ? { ...q, ...updated } : q)),
    })));
  };

  const startEditing = async (item: QuestionListItem) => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/executive/question-bank/${item.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to load question');
      }
      const data = await res.json();
      const q: QuestionDetail = data.question;
      setEditing(q);
      setEditForm({
        ...q,
        options: [...(q.options?.length ? q.options : ['', ''])],
        correctAnswerIndex: q.correctAnswerIndex ?? 0,
        category: q.category || 'General',
        difficulty: q.difficulty || 'medium',
        tags: q.tags || '',
        explanation: q.explanation || '',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast({ variant: 'destructive', title: 'Failed to Load Question', description: msg });
    }
  };

  const saveEditing = async () => {
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
      setSaving(true);
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
      updateLocalItem(editForm);
      toast({ title: 'Question Updated', description: 'Changes saved to the question bank.' });
      setEditing(null);
      setEditForm(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast({ variant: 'destructive', title: 'Update Failed', description: msg });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (id: string) => {
    if (!window.confirm('Delete this question permanently? This cannot be undone.')) return;
    try {
      setDeletingId(id);
      const token = await getToken();
      const res = await fetch(`/api/executive/question-bank/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to delete question');
      }
      toast({ title: 'Question Deleted' });
      fetchPage(page);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast({ variant: 'destructive', title: 'Delete Failed', description: msg });
    } finally {
      setDeletingId(null);
    }
  };

  const current = pages[page];
  const questions = current?.questions || [];

  return (
    <Card className="card-hover overflow-hidden">
      <CardContent className="p-0">
        <div className="p-4 md:p-5 border-b border-border/30 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-headline font-bold text-lg">Question Bank</h2>
              <p className="text-sm text-muted-foreground">
                {totalLoaded} question{totalLoaded !== 1 ? 's' : ''} loaded{current?.hasMore ? ' · more available' : ''}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchPage(page)} disabled={loading}>
            <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} /> Refresh
          </Button>
        </div>

        <div className="p-4 border-b border-border/30 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search questions…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
            />
          </div>
          <Select value={filters.category} onValueChange={v => setFilters(prev => ({ ...prev, category: v }))}>
            <SelectTrigger className="h-11">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.difficulty} onValueChange={v => setFilters(prev => ({ ...prev, difficulty: v }))}>
            <SelectTrigger className="h-11">
              <SelectValue placeholder="All difficulties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All difficulties</SelectItem>
              {DIFFICULTY_OPTIONS.map(d => (
                <SelectItem key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          {loading && questions.length === 0 ? (
            <div className="space-y-3 p-4">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : error && questions.length === 0 ? (
            <EmptyState
              icon={Filter}
              title="Failed to Load Questions"
              description={error}
              action={<Button variant="outline" size="sm" onClick={() => fetchPage(page)}><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button>}
            />
          ) : questions.length === 0 ? (
            <EmptyState
              icon={Database}
              title="No Questions Found"
              description="No questions match the current search and filters. Use the AI PDF Forge above to generate and import new questions."
            />
          ) : (
            <ul className="divide-y divide-border/30">
              {questions.map(q => (
                <li key={q.id} className="p-4 hover:bg-secondary/10 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-relaxed line-clamp-2">{q.text}</p>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={cn('text-[10px] h-5 capitalize', difficultyColor[q.difficulty] || '')}>
                          {q.difficulty}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] h-5">{q.category}</Badge>
                        <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">{q.source}</Badge>
                        <span className="text-[11px] text-muted-foreground">Created {formatDate(q.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                        <Link href={`/executive/question-bank/${q.id}`} aria-label="View question">
                          <Eye className="w-4 h-4" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEditing(q)} aria-label="Edit question">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => confirmDelete(q.id)} disabled={deletingId === q.id} aria-label="Delete question"
                      >
                        {deletingId === q.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 border-t border-border/30 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page + 1}</p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm" disabled={page === 0 || loading}
              onClick={() => fetchPage(page - 1)}
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Prev
            </Button>
            <Button
              variant="outline" size="sm" disabled={!current?.hasMore || loading}
              onClick={() => fetchPage(page + 1)}
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </CardContent>

      <Dialog open={!!editing} onOpenChange={open => { if (!open) { setEditing(null); setEditForm(null); } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Question</DialogTitle>
            <DialogDescription>Update the question, options, and metadata below.</DialogDescription>
          </DialogHeader>
          {editForm && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="qb-text">Question Text</Label>
                <Textarea id="qb-text" value={editForm.text} onChange={e => setEditForm({ ...editForm, text: e.target.value })} rows={3} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Options</Label>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => setEditForm(prev => prev && { ...prev, options: [...prev.options, ''] })}
                  >
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
                      onChange={e => {
                        setEditForm(prev => prev && {
                          ...prev,
                          options: prev.options.map((o, i) => (i === oi ? e.target.value : o)),
                        });
                      }}
                      placeholder={`Option ${oi + 1}`}
                    />
                    {editForm.options.length > 2 && (
                      <Button
                        type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-destructive"
                        onClick={() => {
                          setEditForm(prev => prev && {
                            ...prev,
                            options: prev.options.filter((_, i) => i !== oi),
                            correctAnswerIndex: prev.correctAnswerIndex === oi
                              ? 0
                              : (prev.correctAnswerIndex ?? 0) > oi
                                ? (prev.correctAnswerIndex ?? 0) - 1
                                : (prev.correctAnswerIndex ?? 0),
                          });
                        }}
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
                  <Label htmlFor="qb-category">Category</Label>
                  <Input id="qb-category" list="qb-category-list" value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })} />
                  <datalist id="qb-category-list">
                    {categories.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qb-difficulty">Difficulty</Label>
                  <Select value={editForm.difficulty} onValueChange={v => setEditForm(prev => prev && { ...prev, difficulty: v })}>
                    <SelectTrigger id="qb-difficulty" className="h-10">
                      <SelectValue placeholder="Difficulty" />
                    </SelectTrigger>
                    <SelectContent>
                      {DIFFICULTY_OPTIONS.map(d => (
                        <SelectItem key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="qb-tags">Tags (comma separated)</Label>
                <Input id="qb-tags" value={editForm.tags} onChange={e => setEditForm({ ...editForm, tags: e.target.value })} placeholder="e.g. finance, leadership" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="qb-explanation">Explanation</Label>
                <Textarea id="qb-explanation" value={editForm.explanation} onChange={e => setEditForm({ ...editForm, explanation: e.target.value })} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => { setEditing(null); setEditForm(null); }} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveEditing} disabled={saving || !editForm}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
