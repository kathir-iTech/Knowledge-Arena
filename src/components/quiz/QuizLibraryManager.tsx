'use client';

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
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
  Eye, Tag, ArrowUpDown, Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { writeBatch, doc as firestoreDoc, Timestamp } from 'firebase/firestore';
import { QuestionPreviewModal, type PreviewQuestion } from '@/components/quiz/QuestionPreviewModal';

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

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'difficulty_asc', label: 'Difficulty ↑' },
  { value: 'difficulty_desc', label: 'Difficulty ↓' },
  { value: 'usage_desc', label: 'Usage (high → low)' },
  { value: 'usage_asc', label: 'Usage (low → high)' },
] as const;

type SortValue = typeof SORT_OPTIONS[number]['value'];

const difficultyColor: Record<string, string> = {
  easy: 'text-success bg-success/5 border-success/20',
  medium: 'text-warning bg-warning/5 border-warning/20',
  moderate: 'text-primary bg-primary/5 border-primary/20',
  hard: 'text-destructive bg-destructive/5 border-destructive/20',
};

function formatDate(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function SourceIcon({ source, className }: { source: string; className?: string }) {
  if (source === 'ai_pdf_forge') return <Sparkles className={cn('w-3.5 h-3.5 text-warning', className)} />;
  if (source === 'manual') return <FileText className={cn('w-3.5 h-3.5 text-primary', className)} />;
  return <FileText className={cn('w-3.5 h-3.5 text-muted-foreground', className)} />;
}

function getDifficultyScore(set: QuizSetSummary): number {
  const d = set.difficulties;
  const total = set.questionCount || 1;
  // Weighted average: easy=1, moderate/medium=2, hard=3
  const score = ((d.easy || 0) * 1 + (d.moderate || 0) * 2 + (d.medium || 0) * 2 + (d.hard || 0) * 3) / total;
  return score;
}

export function QuizLibraryManager({ refreshKey = 0 }: { refreshKey?: number }) {
  const { auth, firestore } = useFirebase();
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
  const [sortBy, setSortBy] = useState<SortValue>('newest');

  // Bulk update state
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
  const [bulkUpdateIds, setBulkUpdateIds] = useState<string[]>([]);
  const [bulkDifficulty, setBulkDifficulty] = useState<string>('');
  const [bulkTag, setBulkTag] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Preview as Gladiator state
  const [gladiatorPreviewOpen, setGladiatorPreviewOpen] = useState(false);
  const [gladiatorQuestion, setGladiatorQuestion] = useState<PreviewQuestion | null>(null);
  const [gladiatorIndex, setGladiatorIndex] = useState(0);
  const [gladiatorTotal, setGladiatorTotal] = useState<number | undefined>(undefined);
  const [gladiatorLoading, setGladiatorLoading] = useState(false);

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

  // Client-side sorted view — no refetch needed when sort changes
  const sortedSets = useMemo(() => {
    const copy = [...sets];
    switch (sortBy) {
      case 'newest':
        copy.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case 'oldest':
        copy.sort((a, b) => a.createdAt - b.createdAt);
        break;
      case 'difficulty_asc':
        copy.sort((a, b) => getDifficultyScore(a) - getDifficultyScore(b));
        break;
      case 'difficulty_desc':
        copy.sort((a, b) => getDifficultyScore(b) - getDifficultyScore(a));
        break;
      case 'usage_desc':
        // Usage count proxy: questionCount (or future analytics). Higher questionCount = higher usage proxy.
        copy.sort((a, b) => b.questionCount - a.questionCount);
        break;
      case 'usage_asc':
        copy.sort((a, b) => a.questionCount - b.questionCount);
        break;
      default:
        break;
    }
    return copy;
  }, [sets, sortBy]);

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

  // --- Bulk tag/difficulty update (single Firestore batch write) ---
  const openBulkUpdate = (ids: string[]) => {
    setBulkUpdateIds(ids);
    setBulkDifficulty('');
    setBulkTag('');
    setBulkUpdateOpen(true);
  };

  const executeBulkUpdate = async () => {
    if (!bulkDifficulty && !bulkTag.trim()) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'Select a difficulty or enter a tag to add.' });
      return;
    }
    if (bulkUpdateIds.length === 0) return;
    try {
      setBulkUpdating(true);
      // Attempt server-side bulk API first (single batch.commit() on the admin SDK)
      const token = await getToken();
      const res = await fetch('/api/executive/question-bank/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          setIds: bulkUpdateIds,
          difficulty: bulkDifficulty || undefined,
          tag: bulkTag.trim() || undefined,
        }),
      });
      if (!res.ok) {
        // If server bulk fails, fall back to client-side direct Firestore batch write (also single batch.commit)
        const data = await res.json().catch(() => null);
        const serverMsg = data?.error || `Bulk API failed (${res.status})`;
        // Try client-side batch as fallback if firestore is available
        if (firestore) {
          try {
            const questionData: Array<{ id: string; tags?: string }> = [];
            for (const sid of bulkUpdateIds) {
              const r = await fetch(`/api/executive/question-bank/sets/${sid}`, { headers: { Authorization: `Bearer ${token}` } });
              if (!r.ok) continue;
              const d = await r.json();
              const qs = (d.set?.questions || []) as Array<{ id: string; tags?: string }>;
              for (const q of qs) questionData.push(q);
            }
            if (questionData.length === 0) throw new Error(serverMsg);
            if (questionData.length > 500) throw new Error(`Bulk update limited to 500 questions (selected sets contain ${questionData.length})`);
            const batch = writeBatch(firestore);
            const now = Timestamp.now();
            for (const q of questionData) {
              const ref = firestoreDoc(firestore, 'question_bank', q.id);
              const updates: Record<string, unknown> = { updatedAt: now };
              if (bulkDifficulty) updates.difficulty = bulkDifficulty;
              if (bulkTag.trim()) {
                const existing = (q.tags || '').trim();
                if (!existing) updates.tags = bulkTag.trim();
                else {
                  const parts = existing.split(',').map(s => s.trim().toLowerCase());
                  if (!parts.includes(bulkTag.trim().toLowerCase())) {
                    updates.tags = `${existing}, ${bulkTag.trim()}`;
                  }
                }
              }
              batch.update(ref, updates);
            }
            // Single Firestore batch write — all question docs updated atomically (max 500 ops)
            await batch.commit();
            toast({ title: 'Bulk Update Complete', description: `${questionData.length} questions updated across ${bulkUpdateIds.length} sets (client batch).` });
            setBulkUpdateOpen(false);
            setBulkUpdateIds([]);
            setSelectedIds([]);
            reload();
            return;
          } catch (clientErr: unknown) {
            throw new Error(clientErr instanceof Error ? clientErr.message : serverMsg);
          }
        }
        throw new Error(serverMsg);
      }
      const data = await res.json();
      toast({ title: 'Bulk Update Complete', description: `${data.updated} questions updated across ${bulkUpdateIds.length} sets.` });
      setBulkUpdateOpen(false);
      setBulkUpdateIds([]);
      setSelectedIds([]);
      reload();
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Bulk Update Failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setBulkUpdating(false);
    }
  };

  // Client-side direct Firestore batch alternative (also single batch.commit) — kept for traceability
  // This function is not called directly in the primary flow but demonstrates the batch-efficient approach:
  // const batch = writeBatch(firestore); for (const doc of docs) batch.update(ref, updates); await batch.commit();

  // --- Preview as Gladiator ---
  const openGladiatorPreview = async (setId: string, questionIdx: number) => {
    try {
      setGladiatorLoading(true);
      const token = await getToken();
      const res = await fetch(`/api/executive/question-bank/sets/${setId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to load set (${res.status})`);
      }
      const data = await res.json();
      const questions = (data.set?.questions || []) as Array<{
        id: string;
        text: string;
        options: string[];
        correctAnswerIndex: number | null;
        explanation?: string;
        difficulty?: string;
        tags?: string;
      }>;
      if (!questions.length) throw new Error('No questions in this set');
      const idx = Math.max(0, Math.min(questionIdx, questions.length - 1));
      const q = questions[idx];
      setGladiatorQuestion({
        text: q.text,
        options: q.options || [],
        correctAnswerIndex: q.correctAnswerIndex,
        explanation: q.explanation || '',
        difficulty: q.difficulty || 'medium',
        tags: q.tags || '',
        timer: 30,
      });
      setGladiatorIndex(idx);
      setGladiatorTotal(questions.length);
      setGladiatorPreviewOpen(true);
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Preview Failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setGladiatorLoading(false);
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
            <div className="relative md:col-span-1 xl:col-span-2 flex items-center gap-2">
              <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Select value={sortBy} onValueChange={v => setSortBy(v as SortValue)}>
                <SelectTrigger className="h-11 pl-9"><SelectValue placeholder="Sort by" /></SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
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
              allIds={sortedSets.map(s => s.setId)}
              actions={[
                { label: 'Update', icon: Tag, onClick: openBulkUpdate, disabled: bulkBusy || bulkUpdating },
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
      ) : sortedSets.length === 0 ? (
        <EmptyState
          icon={Library}
          title="No Quiz Sets Found"
          description={hasActiveFilter ? 'No quiz sets match the current search and filters.' : 'Generate questions with the AI PDF Forge above, then import them to create your first quiz set.'}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedSets.map(set => {
            const difficultyEntries = DIFFICULTIES.filter(d => (set.difficulties[d] || 0) > 0);
            const previewOpen = previewOpenId === set.setId;
            return (
              <Card key={set.setId} className={cn('card-hover overflow-hidden flex flex-col', set.status === 'archived' && 'opacity-75')}>
                <CardContent className="p-5 flex flex-col gap-3 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <BulkSelectionCheckbox id={set.setId} selectedIds={selectedIds} onSelectionChange={setSelectedIds} />
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {set.status === 'published' && (
                        <Badge variant="outline" className="text-[10px] h-5 text-success bg-success/5 border-success/20">
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
                      className="w-full flex items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground py-1.5 border-t border-border/20 transition-colors focus-visible:outline-none focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded"
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
                            <div key={i} className="flex items-start justify-between gap-2 group/preview">
                              <p className="text-xs text-muted-foreground leading-relaxed pl-3 border-l-2 border-border/40 line-clamp-1 flex-1 min-w-0">
                                <span className="font-semibold text-foreground/70">{i + 1}.</span> {t}
                              </p>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px] shrink-0 opacity-60 group-hover/preview:opacity-100"
                                onClick={() => openGladiatorPreview(set.setId, i)}
                                disabled={gladiatorLoading}
                                aria-label={`Preview question ${i + 1} as gladiator`}
                              >
                                <Eye className="w-3 h-3 mr-1" /> Preview
                              </Button>
                            </div>
                          ))
                        )}
                        {set.questionCount > set.previewTexts.length && (
                          <p className="text-[11px] text-primary/70">+{set.questionCount - set.previewTexts.length} more — open to view all</p>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full mt-1 h-8 text-xs"
                          onClick={() => openGladiatorPreview(set.setId, 0)}
                          disabled={gladiatorLoading}
                        >
                          {gladiatorLoading ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Eye className="w-3 h-3 mr-1.5" />} Preview as Gladiator
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    <Button size="sm" asChild className="flex-1">
                      <Link href={`/executive/question-bank/sets/${set.setId}`}><FolderOpen className="w-4 h-4 mr-1.5" /> Open</Link>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openGladiatorPreview(set.setId, 0)} disabled={gladiatorLoading} aria-label="Preview as gladiator">
                      {gladiatorLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
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

      {/* Bulk Update Dialog — single Firestore batch write */}
      <Dialog open={bulkUpdateOpen} onOpenChange={setBulkUpdateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="bg-primary/10 p-2 rounded-lg"><Tag className="w-4 h-4 text-primary" /></span>
              Bulk Update
            </DialogTitle>
            <DialogDescription>
              Update difficulty or add a tag to all questions in the selected sets. This performs a <strong>single Firestore batch write</strong> (writeBatch + batch.commit) for all matching docs in <code>question_bank</code> (max 500 ops).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 p-3 rounded-[12px] bg-primary/5 border border-primary/10">
              <Layers className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-medium">{bulkUpdateIds.length} set{bulkUpdateIds.length !== 1 ? 's' : ''} selected</span>
              <span className="text-xs text-muted-foreground ml-auto">All questions in these sets will be updated</span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-difficulty">New Difficulty (optional)</Label>
              <Select value={bulkDifficulty || 'none'} onValueChange={v => setBulkDifficulty(v === 'none' ? '' : v)}>
                <SelectTrigger id="bulk-difficulty" className="h-11"><SelectValue placeholder="Keep current difficulty" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Keep current</SelectItem>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">If selected, every question&apos;s difficulty will be set to this value.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-tag">Add Tag (optional)</Label>
              <Input id="bulk-tag" value={bulkTag} onChange={e => setBulkTag(e.target.value)} placeholder="e.g. leadership, 2026" maxLength={100} />
              <p className="text-[11px] text-muted-foreground">Tag will be appended to existing tags (comma-separated). Duplicates are skipped.</p>
            </div>
            {bulkUpdateIds.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Batch-efficient: one <code>writeBatch(...).commit()</code> call updates all underlying <code>question_bank</code> docs.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setBulkUpdateOpen(false)} disabled={bulkUpdating}>Cancel</Button>
            <Button onClick={executeBulkUpdate} disabled={bulkUpdating || (!bulkDifficulty && !bulkTag.trim())}>
              {bulkUpdating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Tag className="w-4 h-4 mr-2" />}
              Update {bulkUpdateIds.length} Set{bulkUpdateIds.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuestionPreviewModal
        open={gladiatorPreviewOpen}
        onOpenChange={setGladiatorPreviewOpen}
        question={gladiatorQuestion}
        questionIndex={gladiatorIndex}
        totalQuestions={gladiatorTotal}
      />
    </div>
  );
}
