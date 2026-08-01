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
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { BulkSelection, BulkSelectionCheckbox } from '@/components/ui/bulk-selection';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Library, Search, RefreshCw, ChevronLeft, ChevronRight, FileText, Sparkles, Copy, Trash2,
  Download, Send, Archive, FolderOpen, ChevronDown, Clock, User, Pencil, Loader2, CheckCircle2, Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface QuizSetSummary {
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
  previewTexts: string[];
}

interface Filters {
  q: string;
  category: string;
  difficulty: string;
  source: string;
  createdBy: string;
  date: string;
  count: string;
  status: string;
}

const DIFFICULTIES = ['easy', 'moderate', 'medium', 'hard'];
const COUNT_RANGES = [
  { value: '', label: 'Any size' },
  { value: '1-5', label: '1 – 5 questions' },
  { value: '6-10', label: '6 – 10 questions' },
  { value: '11-20', label: '11 – 20 questions' },
  { value: '21+', label: '21+ questions' },
];
const DATE_RANGES = [
  { value: '', label: 'Any date' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'year', label: 'Last year' },
];

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

function SourceIcon({ source, className }: { source: string; className?: string }) {
  if (source === 'ai_pdf_forge') return <Sparkles className={cn('w-3.5 h-3.5 text-amber-500', className)} />;
  if (source === 'manual') return <FileText className={cn('w-3.5 h-3.5 text-blue-500', className)} />;
  return <FileText className={cn('w-3.5 h-3.5 text-muted-foreground', className)} />;
}

export function QuizLibraryManager({ refreshKey = 0 }: { refreshKey?: number }) {
  const { auth } = useFirebase();
  const { toast } = useToast();

  const [sets, setSets] = useState<QuizSetSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>({ q: '', category: '', difficulty: '', source: '', createdBy: '', date: '', count: '', status: 'active' });
  const [searchInput, setSearchInput] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewOpenId, setPreviewOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<QuizSetSummary | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const getToken = useCallback(async () => {
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
    if (!token) throw new Error('UNAUTHORIZED');
    return token;
  }, [auth]);

  const fetchCategories = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/executive/question-bank/categories', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch {
      // optional enrichment
    }
  }, [getToken]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

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
      if (f.source && f.source !== 'all') params.set('source', f.source);
      if (f.createdBy) params.set('createdBy', f.createdBy);
      if (f.date) params.set('date', f.date);
      if (f.count) {
        const parsed = parseCount(f.count);
        if (parsed.min) params.set('minCount', String(parsed.min));
        if (parsed.max != null) params.set('maxCount', String(parsed.max));
      }
      if (f.status) params.set('status', f.status);
      params.set('page', String(targetPage));
      params.set('pageSize', String(12));

      const res = await fetch(`/api/executive/question-bank/sets?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to load quiz sets (${res.status})`);
      }
      const data = await res.json();
      setSets(data.sets || []);
      setTotal(data.total || 0);
      if (Array.isArray(data.sources) && data.sources.length) setSources(data.sources);
      setPage(targetPage);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      toast({ variant: 'destructive', title: 'Failed to Load Quiz Sets', description: msg });
    } finally {
      setLoading(false);
    }
  }, [getToken, toast]);

  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
    fetchPage(1);
  }, [filters, refreshKey, fetchPage]);

  const reload = () => { fetchPage(page); };

  const refreshAll = () => {
    fetchCategories();
    reload();
  };

  const parseCount = (v: string) => v.includes('-') ? { min: Number(v.split('-')[0]), max: Number(v.split('-')[1]) } : { min: Number(v.replace('+', '')), max: null };

  const setCountFilter = (v: string) => {
    setFilters(prev => ({ ...prev, count: v === 'any' ? '' : v }));
  };

  const patchSet = async (setId: string, body: Record<string, unknown>) => {
    const token = await getToken();
    const res = await fetch(`/api/executive/question-bank/sets/${setId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || `Request failed (${res.status})`);
    }
    return res.json();
  };

  const startEditing = (set: QuizSetSummary) => {
    setEditing(set);
    setEditTitle(set.title);
  };

  const saveEditing = async () => {
    if (!editing) return;
    if (!editTitle.trim()) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'Title is required.' });
      return;
    }
    try {
      setSaving(true);
      await patchSet(editing.setId, { title: editTitle.trim() });
      toast({ title: 'Set Renamed', description: 'Title updated.' });
      setEditing(null);
      reload();
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Rename Failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setSaving(false);
    }
  };

  const duplicateSet = async (setId: string) => {
    try {
      setBusyId(setId);
      const token = await getToken();
      const res = await fetch(`/api/executive/question-bank/sets/${setId}/duplicate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Duplicate failed (${res.status})`);
      }
      toast({ title: 'Set Duplicated', description: 'A copy of the set was created.' });
      reload();
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Duplicate Failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setBusyId(null);
    }
  };

  const deleteSet = async (set: QuizSetSummary) => {
    if (!window.confirm(`Delete the quiz set "${set.title}" (${set.questionCount} questions) permanently? This cannot be undone.`)) return;
    try {
      setBusyId(set.setId);
      const token = await getToken();
      const res = await fetch(`/api/executive/question-bank/sets/${set.setId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Delete failed (${res.status})`);
      }
      toast({ title: 'Set Deleted', description: `${set.questionCount} questions removed.` });
      reload();
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Delete Failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setBusyId(null);
    }
  };

  const exportSet = async (set: QuizSetSummary) => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/executive/question-bank/sets/${set.setId}/export`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') || '';
      a.download = (cd.match(/filename="?([^"]+)"?/)?.[1]) || `${set.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'quiz-set'}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export Ready', description: `${set.title} exported as JSON.` });
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Export Failed', description: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  const setStatus = async (set: QuizSetSummary, status: 'published' | 'archived' | null) => {
    try {
      setBusyId(set.setId);
      await patchSet(set.setId, { status });
      toast({
        title: status === 'archived' ? 'Set Archived' : status === 'published' ? 'Set Published' : 'Set Restored',
        description: status === 'archived' ? 'Hidden from the active library.' : status === 'published' ? 'Marked as published.' : 'Set is active again.',
      });
      reload();
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Status Update Failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setBusyId(null);
    }
  };

  const bulkDuplicate = async (ids: string[]) => {
    try {
      setBulkBusy(true);
      const token = await getToken();
      let ok = 0;
      for (const id of ids) {
        const res = await fetch(`/api/executive/question-bank/sets/${id}/duplicate`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) ok++;
      }
      toast({ title: 'Duplicate Complete', description: `${ok} of ${ids.length} sets duplicated.` });
      setSelectedIds([]);
      reload();
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Bulk Duplicate Failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkExport = async (ids: string[]) => {
    try {
      setBulkBusy(true);
      const token = await getToken();
      const res = await fetch('/api/executive/question-bank/sets/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ setIds: ids }),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quiz-sets-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export Ready', description: `${ids.length} sets exported as JSON.` });
      setSelectedIds([]);
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Bulk Export Failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkSetStatus = async (ids: string[], status: 'published' | 'archived') => {
    try {
      setBulkBusy(true);
      const token = await getToken();
      let ok = 0;
      for (const id of ids) {
        const res = await fetch(`/api/executive/question-bank/sets/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status }),
        });
        if (res.ok) ok++;
      }
      toast({ title: status === 'archived' ? 'Archive Complete' : 'Publish Complete', description: `${ok} of ${ids.length} sets ${status === 'archived' ? 'archived' : 'published'}.` });
      setSelectedIds([]);
      reload();
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Bulk Update Failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = async (ids: string[]) => {
    if (!window.confirm(`Delete ${ids.length} selected quiz set(s) permanently? This cannot be undone.`)) return;
    try {
      setBulkBusy(true);
      const token = await getToken();
      let ok = 0;
      for (const id of ids) {
        const res = await fetch(`/api/executive/question-bank/sets/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) ok++;
      }
      toast({ title: 'Delete Complete', description: `${ok} of ${ids.length} sets deleted.` });
      setSelectedIds([]);
      reload();
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Bulk Delete Failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setBulkBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasActiveFilter = Boolean(filters.q || filters.category || filters.difficulty || filters.source || filters.createdBy || filters.date || filters.count);

  return (
    <div className="space-y-4">
      <Card className="card-hover overflow-hidden">
        <CardContent className="p-0">
          <div className="p-4 md:p-5 border-b border-border/30 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Library className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-headline font-bold text-lg">Quiz Library</h2>
                <p className="text-sm text-muted-foreground">
                  {total} quiz set{total !== 1 ? 's' : ''} · page {page} of {totalPages}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 mr-2">
                <Switch id="show-archived" checked={filters.status === 'all'} onCheckedChange={v => setFilters(prev => ({ ...prev, status: v ? 'all' : 'active' }))} />
                <Label htmlFor="show-archived" className="text-sm text-muted-foreground cursor-pointer">Show archived</Label>
              </div>
              <Button variant="outline" size="sm" onClick={refreshAll} disabled={loading}>
                <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} /> Refresh
              </Button>
            </div>
          </div>

          <div className="p-4 border-b border-border/30 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <div className="relative xl:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search sets (title or category)…" value={searchInput} onChange={e => setSearchInput(e.target.value)} />
            </div>
            <Select value={filters.category} onValueChange={v => setFilters(prev => ({ ...prev, category: v }))}>
              <SelectTrigger className="h-11"><SelectValue placeholder="All categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.difficulty} onValueChange={v => setFilters(prev => ({ ...prev, difficulty: v }))}>
              <SelectTrigger className="h-11"><SelectValue placeholder="All difficulties" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All difficulties</SelectItem>
                {DIFFICULTIES.map(d => <SelectItem key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.source} onValueChange={v => setFilters(prev => ({ ...prev, source: v }))}>
              <SelectTrigger className="h-11"><SelectValue placeholder="All sources" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.date || 'any'} onValueChange={v => setFilters(prev => ({ ...prev, date: v === 'any' ? '' : v }))}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Any date" /></SelectTrigger>
              <SelectContent>
                {DATE_RANGES.map(d => <SelectItem key={d.value || 'any'} value={d.value || 'any'}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.count || 'any'} onValueChange={setCountFilter}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Any size" /></SelectTrigger>
              <SelectContent>
                {COUNT_RANGES.map(c => <SelectItem key={c.value || 'any'} value={c.value || 'any'}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative md:col-span-1 xl:col-span-2">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Created by (ID or email)…" value={filters.createdBy} onChange={e => setFilters(prev => ({ ...prev, createdBy: e.target.value }))} />
            </div>
            {hasActiveFilter && (
              <Button variant="ghost" size="sm" className="md:col-span-full xl:col-span-1 w-fit" onClick={() => { setFilters({ q: '', category: '', difficulty: '', source: '', createdBy: '', date: '', count: '', status: filters.status }); setSearchInput(''); }}>
                <Filter className="w-4 h-4 mr-1.5" /> Clear filters
              </Button>
            )}
          </div>

          <div className="px-4 py-3 border-b border-border/30">
            <BulkSelection
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              allIds={sets.map(s => s.setId)}
              actions={[
                { label: 'Duplicate', icon: Copy, onClick: bulkDuplicate, disabled: bulkBusy },
                { label: 'Export', icon: Download, onClick: bulkExport, disabled: bulkBusy },
                { label: 'Publish', icon: Send, onClick: ids => bulkSetStatus(ids, 'published'), disabled: bulkBusy },
                { label: 'Archive', icon: Archive, onClick: ids => bulkSetStatus(ids, 'archived'), disabled: bulkBusy },
                { label: 'Delete', icon: Trash2, variant: 'destructive', onClick: bulkDelete, disabled: bulkBusy },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      {loading && sets.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-56 w-full" />)}
        </div>
      ) : error && sets.length === 0 ? (
        <EmptyState icon={Filter} title="Failed to Load Quiz Sets" description={error} action={<Button variant="outline" size="sm" onClick={reload}><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button>} />
      ) : sets.length === 0 ? (
        <EmptyState
          icon={Library}
          title="No Quiz Sets Found"
          description={hasActiveFilter ? 'No quiz sets match the current search and filters.' : 'Generate questions with the AI PDF Forge above, then import them to create your first quiz set.'}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sets.map(set => {
            const difficultyEntries = DIFFICULTIES.filter(d => (set.difficulties[d] || 0) > 0);
            const previewOpen = previewOpenId === set.setId;
            return (
              <Card key={set.setId} className={cn('card-hover overflow-hidden flex flex-col', set.status === 'archived' && 'opacity-75')}>
                <CardContent className="p-5 flex flex-col gap-3 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <BulkSelectionCheckbox id={set.setId} selectedIds={selectedIds} onSelectionChange={setSelectedIds} />
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {set.status === 'published' && (
                        <Badge variant="outline" className="text-[10px] h-5 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Published
                        </Badge>
                      )}
                      {set.status === 'archived' && (
                        <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">
                          <Archive className="w-3 h-3 mr-1" /> Archived
                        </Badge>
                      )}
                    </div>
                  </div>

                  <Link href={`/executive/question-bank/sets/${set.setId}`} className="group/title min-w-0">
                    <div className="flex items-start gap-2.5">
                      <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-2 rounded-lg shrink-0 mt-0.5">
                        <SourceIcon source={set.source} className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-headline font-bold text-lg leading-snug line-clamp-2 group-hover/title:text-primary transition-colors break-words">
                          {set.title}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{set.category}</p>
                      </div>
                    </div>
                  </Link>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge className="text-[10px] h-5">{set.questionCount} question{set.questionCount !== 1 ? 's' : ''}</Badge>
                    {difficultyEntries.map(d => (
                      <Badge key={d} variant="outline" className={cn('text-[10px] h-5 capitalize', difficultyColor[d] || '')}>
                        {set.difficulties[d]} {d}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDate(set.createdAt)}</span>
                    <span className="flex items-center gap-1 truncate"><User className="w-3 h-3 shrink-0" /> {set.createdBy ? set.createdBy.slice(0, 12) : '—'}</span>
                  </div>

                  <div className="flex-1">
                    <button
                      type="button"
                      onClick={() => setPreviewOpenId(previewOpen ? null : set.setId)}
                      className="w-full flex items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground py-1.5 border-t border-border/20 transition-colors"
                    >
                      <span>Question preview</span>
                      <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', previewOpen && 'rotate-180')} />
                    </button>
                    {previewOpen && (
                      <div className="mt-2 space-y-2 animate-in">
                        {set.previewTexts.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No preview available.</p>
                        ) : (
                          set.previewTexts.map((t, i) => (
                            <p key={i} className="text-xs text-muted-foreground leading-relaxed pl-3 border-l-2 border-border/40 line-clamp-1">
                              <span className="font-semibold text-foreground/70">{i + 1}.</span> {t}
                            </p>
                          ))
                        )}
                        {set.questionCount > set.previewTexts.length && (
                          <p className="text-[11px] text-primary/70">+{set.questionCount - set.previewTexts.length} more — open to view all</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    <Button size="sm" asChild className="flex-1">
                      <Link href={`/executive/question-bank/sets/${set.setId}`}><FolderOpen className="w-4 h-4 mr-1.5" /> Open</Link>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => startEditing(set)} aria-label="Edit set title"><Pencil className="w-4 h-4" /></Button>
                    <Button size="sm" variant="outline" onClick={() => duplicateSet(set.setId)} disabled={busyId === set.setId} aria-label="Duplicate set">
                      {busyId === set.setId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => deleteSet(set)} disabled={busyId === set.setId} aria-label="Delete set">
                      {busyId === set.setId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="px-2" aria-label="More set actions">···</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => exportSet(set)}><Download className="w-4 h-4 mr-2" /> Export JSON</DropdownMenuItem>
                        {set.status !== 'published' ? (
                          <DropdownMenuItem onClick={() => setStatus(set, 'published')}><Send className="w-4 h-4 mr-2" /> Publish</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => setStatus(set, null)}><CheckCircle2 className="w-4 h-4 mr-2" /> Unpublish</DropdownMenuItem>
                        )}
                        {set.status !== 'archived' ? (
                          <DropdownMenuItem onClick={() => setStatus(set, 'archived')}><Archive className="w-4 h-4 mr-2" /> Archive</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => setStatus(set, null)}><FolderOpen className="w-4 h-4 mr-2" /> Restore</DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteSet(set)}><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Page {page} of {totalPages} · {total} set{total !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => fetchPage(page - 1)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Prev
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => fetchPage(page + 1)}>
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={open => { if (!open) { setEditing(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Quiz Set</DialogTitle>
            <DialogDescription>Rename this quiz set. Questions inside are edited on the set page.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="set-title">Title</Label>
                <Input id="set-title" value={editTitle} onChange={e => setEditTitle(e.target.value)} maxLength={120} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-secondary/20 border border-border/20">
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p className="font-medium">{editing.category}</p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/20 border border-border/20">
                  <p className="text-xs text-muted-foreground">Questions</p>
                  <p className="font-medium">{editing.questionCount}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button onClick={saveEditing} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
