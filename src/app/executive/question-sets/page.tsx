'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BookOpen, Layers, Plus, Search, Edit3, Trash2, Copy, Tag, Hash, Loader2, ArrowLeft, CheckSquare, Square, ListChecks, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface QuestionSet {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: string | null;
  tags: string[];
  questionIds: string[];
  questionCount: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

interface QuestionItem {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  category: string;
  difficulty: string;
  tags: string[];
}

export default function QuestionSetsPage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const { toast } = useToast();
  const [sets, setSets] = useState<QuestionSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Create/Edit dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingSet, setEditingSet] = useState<QuestionSet | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('General');
  const [formDifficulty, setFormDifficulty] = useState('');
  const [formTags, setFormTags] = useState('');
  const [saving, setSaving] = useState(false);

  // Set detail view
  const [activeSet, setActiveSet] = useState<QuestionSet | null>(null);
  const [setQuestions, setSetQuestions] = useState<QuestionItem[]>([]);
  const [loadingSetQs, setLoadingSetQs] = useState(false);
  const [setQSearch, setSetQSearch] = useState('');
  const [selectedSetQIds, setSelectedSetQIds] = useState<Set<string>>(new Set());
  const [removingFromSet, setRemovingFromSet] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchSets = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await fetch(`/api/executive/question-sets?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setSets(data.sets || []);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load question sets.' });
    } finally {
      setLoading(false);
    }
  }, [auth, debouncedSearch, toast]);

  useEffect(() => {
    if (user) fetchSets();
  }, [user, fetchSets]);

  const fetchSetQuestions = useCallback(async (set: QuestionSet) => {
    if (!set.questionIds.length) {
      setSetQuestions([]);
      return;
    }
    setLoadingSetQs(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const params = new URLSearchParams();
      set.questionIds.forEach(qid => params.append('ids', qid));
      const res = await fetch(`/api/executive/question-bank?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      const allQs: QuestionItem[] = data.questions || [];
      const ordered = set.questionIds
        .map(qid => allQs.find(q => q.id === qid))
        .filter(Boolean) as QuestionItem[];
      setSetQuestions(ordered);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load set questions.' });
    } finally {
      setLoadingSetQs(false);
    }
  }, [auth, toast]);

  const openSetDetail = (s: QuestionSet) => {
    setActiveSet(s);
    setSetQSearch('');
    setSelectedSetQIds(new Set());
    fetchSetQuestions(s);
  };

  const closeSetDetail = () => {
    setActiveSet(null);
    setSetQuestions([]);
    setSelectedSetQIds(new Set());
  };

  const handleRemoveFromSet = async () => {
    if (!activeSet || selectedSetQIds.size === 0) return;
    setRemovingFromSet(true);
    try {
      const token = await auth.currentUser!.getIdToken();
      const updatedIds = activeSet.questionIds.filter(id => !selectedSetQIds.has(id));
      const res = await fetch('/api/executive/question-sets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: activeSet.id, questionIds: updatedIds }),
      });
      if (!res.ok) throw new Error('Failed to update set');
      toast({ title: 'Removed from Set', description: `${selectedSetQIds.size} question(s) removed.` });
      const updatedSet = { ...activeSet, questionIds: updatedIds, questionCount: updatedIds.length };
      setActiveSet(updatedSet);
      setSets(prev => prev.map(s => s.id === updatedSet.id ? updatedSet : s));
      setSetQuestions(prev => prev.filter(q => !selectedSetQIds.has(q.id)));
      setSelectedSetQIds(new Set());
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setRemovingFromSet(false);
    }
  };

  const toggleSetQSelect = (id: string) => {
    setSelectedSetQIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllSetQs = () => {
    setSelectedSetQIds(new Set(filteredSetQs.map(q => q.id)));
  };

  const clearSetQSelection = () => {
    setSelectedSetQIds(new Set());
  };

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormCategory('General');
    setFormDifficulty('');
    setFormTags('');
  };

  const openCreateDialog = () => {
    resetForm();
    setEditingSet(null);
    setShowCreateDialog(true);
  };

  const openEditDialog = (s: QuestionSet) => {
    setEditingSet(s);
    setFormName(s.name);
    setFormDescription(s.description || '');
    setFormCategory(s.category || 'General');
    setFormDifficulty(s.difficulty || '');
    setFormTags((s.tags || []).join(', '));
    setShowCreateDialog(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Name is required.' });
      return;
    }
    setSaving(true);
    try {
      const token = await auth.currentUser!.getIdToken();
      const body = {
        name: formName.trim(),
        description: formDescription.trim(),
        category: formCategory,
        difficulty: formDifficulty || null,
        tags: formTags.split(',').map(t => t.trim()).filter(Boolean),
      };

      if (editingSet) {
        const res = await fetch('/api/executive/question-sets', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: editingSet.id, ...body }),
        });
        if (!res.ok) throw new Error('Failed to update');
        toast({ title: 'Question Set Updated' });
      } else {
        const res = await fetch('/api/executive/question-sets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Failed to create');
        toast({ title: 'Question Set Created' });
      }
      setShowCreateDialog(false);
      fetchSets();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch(`/api/executive/question-sets?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast({ title: 'Question Set Deleted' });
      if (activeSet?.id === id) closeSetDetail();
      fetchSets();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete question set.' });
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch(`/api/executive/question-sets/${id}/duplicate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to duplicate');
      toast({ title: 'Question Set Duplicated' });
      fetchSets();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to duplicate question set.' });
    }
  };

  const formatDate = (ts: number) => {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleDateString();
  };

  // Filter questions within the active set
  const filteredSetQs = setQuestions.filter(q => {
    if (!setQSearch) return true;
    const lower = setQSearch.toLowerCase();
    return (
      q.question.toLowerCase().includes(lower) ||
      q.category?.toLowerCase().includes(lower) ||
      q.tags?.some(t => t.toLowerCase().includes(lower))
    );
  });

  if (loading) {
    return (
      <div className="page-container animate-in space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Detail view for a single set
  if (activeSet) {
    return (
      <div className="page-container animate-in">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={closeSetDetail} className="h-9">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <div>
              <h1 className="text-page-title font-headline tracking-tight">{activeSet.name}</h1>
              <p className="text-sm text-muted-foreground">
                {activeSet.description && <span>{activeSet.description} &middot; </span>}
                <Hash className="w-3 h-3 inline mr-1" />
                {activeSet.questionCount} questions
                {activeSet.difficulty && <span> &middot; {activeSet.difficulty}</span>}
              </p>
            </div>
          </div>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search questions in this set..."
            value={setQSearch}
            onChange={e => setSetQSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-muted-foreground">
            {setQuestions.length} total &middot; {filteredSetQs.length} shown
            {selectedSetQIds.size > 0 && <span className="ml-2 font-medium">({selectedSetQIds.size} selected)</span>}
          </span>
          <div className="flex gap-2">
            {selectedSetQIds.size > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={clearSetQSelection}>
                  <X className="w-3 h-3 mr-1.5" /> Clear
                </Button>
                <Button variant="destructive" size="sm" onClick={handleRemoveFromSet} disabled={removingFromSet}>
                  {removingFromSet ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Trash2 className="w-3 h-3 mr-1.5" />}
                  Remove from Set
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={selectAllSetQs} disabled={filteredSetQs.length === 0}>
              <ListChecks className="w-3 h-3 mr-1.5" /> Select All
            </Button>
          </div>
        </div>

        {loadingSetQs ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : filteredSetQs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">
                {setQSearch ? 'No questions match your search.' : 'This set has no questions yet.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredSetQs.map(q => {
              const isSelected = selectedSetQIds.has(q.id);
              return (
                <Card key={q.id} className={cn(isSelected && 'border-destructive/50 bg-destructive/5')}>
                  <CardContent className="py-3">
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => toggleSetQSelect(q.id)}
                        className="shrink-0 mt-0.5 text-muted-foreground hover:text-destructive transition-colors"
                        aria-label={isSelected ? 'Deselect for removal' : 'Select for removal'}
                      >
                        {isSelected ? <CheckSquare className="w-5 h-5 text-destructive" /> : <Square className="w-5 h-5" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className={cn(
                            'text-[10px] px-2 py-0',
                            q.difficulty === 'easy' ? 'text-green-600 border-green-200' :
                            q.difficulty === 'hard' ? 'text-red-600 border-red-200' :
                            'text-yellow-600 border-yellow-200'
                          )}>{q.difficulty || 'medium'}</Badge>
                          <Badge variant="secondary" className="text-[10px] px-2 py-0">{q.category}</Badge>
                        </div>
                        <p className="text-sm font-medium line-clamp-2">{q.question}</p>
                        {q.tags && q.tags.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {q.tags.map((tag, i) => (
                              <Badge key={i} variant="outline" className="text-[9px] px-1.5 py-0">
                                <Tag className="w-2 h-2 mr-0.5" />{tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="page-container animate-in">
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-1.5">
          <h1 className="text-page-title font-headline tracking-tight">Question Sets</h1>
          <p className="text-base text-muted-foreground">Organize questions into reusable sets for quick arena creation.</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="w-4 h-4 mr-2" />
          Create Set
        </Button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search sets by name, category, or tags..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {sets.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Layers className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-base text-muted-foreground mb-4">
              {search ? 'No sets match your search.' : 'No question sets have been created yet.'}
            </p>
            {!search && (
              <Button onClick={openCreateDialog}>
                <Plus className="w-4 h-4 mr-2" />Create Your First Set
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sets.map(s => (
            <Card
              key={s.id}
              className="group hover:border-primary/30 transition-colors cursor-pointer"
              onClick={() => openSetDetail(s)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-headline font-bold text-lg truncate">{s.name}</h3>
                    {s.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{s.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="secondary" className="text-xs">
                    <Hash className="w-3 h-3 mr-1" />
                    {s.questionCount} questions
                  </Badge>
                  <Badge variant="outline" className="text-xs">{s.category}</Badge>
                  {s.difficulty && (
                    <Badge variant="outline" className={cn(
                      'text-xs',
                      s.difficulty === 'easy' ? 'text-green-600 border-green-200' :
                      s.difficulty === 'hard' ? 'text-red-600 border-red-200' :
                      'text-yellow-600 border-yellow-200'
                    )}>{s.difficulty}</Badge>
                  )}
                </div>

                {s.tags && s.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap mb-3">
                    {s.tags.map((tag, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">
                        <Tag className="w-2.5 h-2.5 mr-1" />{tag}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border/20">
                  <span>{formatDate(s.createdAt)}</span>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditDialog(s)} aria-label="Edit set">
                      <Edit3 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDuplicate(s.id)} aria-label="Duplicate set">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteConfirmId(s.id)} aria-label="Delete set">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSet ? 'Edit Question Set' : 'Create Question Set'}</DialogTitle>
            <DialogDescription>
              {editingSet ? 'Update the question set details.' : 'Create a new reusable question set for quick arena creation.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="qsName">Name *</Label>
              <Input
                id="qsName"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g. Python Basics"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qsDescription">Description</Label>
              <Textarea
                id="qsDescription"
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="Brief description of this set..."
                className="min-h-[60px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="qsCategory">Category</Label>
                <Input
                  id="qsCategory"
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                  placeholder="e.g. Programming"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qsDifficulty">Difficulty (optional)</Label>
                <Select value={formDifficulty} onValueChange={v => setFormDifficulty(v === '_none' ? '' : v)}>
                  <SelectTrigger id="qsDifficulty">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Any</SelectItem>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="qsTags">Tags (comma separated)</Label>
              <Input
                id="qsTags"
                value={formTags}
                onChange={e => setFormTags(e.target.value)}
                placeholder="e.g. python, beginner"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editingSet ? 'Update Set' : 'Create Set'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Question Set?</AlertDialogTitle>
            <AlertDialogDescription>
              This will only remove the grouping. The underlying questions in the Question Bank will NOT be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteConfirmId) handleDelete(deleteConfirmId); setDeleteConfirmId(null); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
