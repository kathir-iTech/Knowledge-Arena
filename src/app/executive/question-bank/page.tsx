'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { BookOpen, Plus, Search, Edit3, Trash2, ChevronDown, Tag, Layers, Brain, X } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface QuestionBankItem {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  category: string;
  difficulty: string;
  tags: string[];
  createdBy: string;
  createdAt: number;
}

export default function QuestionBankPage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const { toast } = useToast();
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionBankItem | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [formQuestion, setFormQuestion] = useState('');
  const [formOptions, setFormOptions] = useState<string[]>(['', '', '', '']);
  const [formCorrectAnswer, setFormCorrectAnswer] = useState(0);
  const [formExplanation, setFormExplanation] = useState('');
  const [formCategory, setFormCategory] = useState('General');
  const [formDifficulty, setFormDifficulty] = useState('medium');
  const [formTags, setFormTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchQuestions = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const params = new URLSearchParams();
      if (difficultyFilter !== 'all') params.set('difficulty', difficultyFilter);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await fetch(`/api/executive/question-bank?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setQuestions(data.questions || []);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load questions.' });
    } finally {
      setLoading(false);
    }
  }, [user, toast, difficultyFilter, categoryFilter, debouncedSearch]);

  useEffect(() => {
    if (user) fetchQuestions();
  }, [user, fetchQuestions]);

  const resetForm = () => {
    setFormQuestion('');
    setFormOptions(['', '', '', '']);
    setFormCorrectAnswer(0);
    setFormExplanation('');
    setFormCategory('General');
    setFormDifficulty('medium');
    setFormTags('');
  };

  const openCreateDialog = () => {
    resetForm();
    setEditingQuestion(null);
    setShowCreateDialog(true);
  };

  const openEditDialog = (q: QuestionBankItem) => {
    setEditingQuestion(q);
    setFormQuestion(q.question);
    setFormOptions([...q.options, ...Array(Math.max(0, 4 - q.options.length)).fill('')]);
    setFormCorrectAnswer(q.correctAnswer);
    setFormExplanation(q.explanation || '');
    setFormCategory(q.category || 'General');
    setFormDifficulty(q.difficulty || 'medium');
    setFormTags(q.tags.join(', '));
    setShowCreateDialog(true);
  };

  const handleSave = async () => {
    if (!formQuestion || formOptions.filter(o => o.trim()).length < 2) {
      toast({ variant: 'destructive', title: 'Error', description: 'Question and at least 2 options are required.' });
      return;
    }
    setSaving(true);
    try {
      const token = await auth.currentUser!.getIdToken();
      const body = {
        question: formQuestion,
        options: formOptions.filter(o => o.trim()),
        correctAnswer: formCorrectAnswer,
        explanation: formExplanation,
        category: formCategory,
        difficulty: formDifficulty,
        tags: formTags.split(',').map(t => t.trim()).filter(Boolean),
      };

      if (editingQuestion) {
        const res = await fetch('/api/executive/question-bank', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: editingQuestion.id, ...body }),
        });
        if (!res.ok) throw new Error('Failed to update');
        toast({ title: 'Question Updated' });
      } else {
        const res = await fetch('/api/executive/question-bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Failed to create');
        toast({ title: 'Question Created' });
      }
      setShowCreateDialog(false);
      fetchQuestions();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch(`/api/executive/question-bank?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast({ title: 'Question Deleted' });
      fetchQuestions();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete question.' });
    }
  };

  const categories = [...new Set(questions.map(q => q.category || 'General'))];

  const formatDate = (ts: number) => {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="page-container animate-in space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="page-container animate-in">
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-1.5">
          <h1 className="text-page-title font-headline tracking-tight">Question Bank</h1>
          <p className="text-base text-muted-foreground">Create and manage reusable questions for all arenas.</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="w-4 h-4 mr-2" />
          Add Question
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search questions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
          <SelectTrigger className="w-[140px]">
            <Brain className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="easy">Easy</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="hard">Hard</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]">
            <Layers className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {questions.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-base text-muted-foreground mb-4">
              {search ? 'No questions match your search.' : 'No questions have been added to the bank yet.'}
            </p>
            {!search && (
              <Button onClick={openCreateDialog}>
                <Plus className="w-4 h-4 mr-2" />Add Your First Question
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {questions.map(q => (
            <Card key={q.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className={cn(
                        q.difficulty === 'easy' ? 'border-success/30 text-success' :
                        q.difficulty === 'hard' ? 'border-destructive/30 text-destructive' :
                        'border-warning/30 text-warning'
                      )}>
                        {q.difficulty}
                      </Badge>
                      <Badge variant="secondary">{q.category}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(q.createdAt)}</span>
                    </div>
                    <p className="font-medium mb-2">{q.question}</p>
                    {expandedId === q.id && (
                      <div className="space-y-2 mt-3 text-sm">
                        <div className="grid grid-cols-2 gap-2">
                          {q.options.map((opt, i) => (
                            <div key={i} className={cn(
                              'p-2 rounded-lg border',
                              i === q.correctAnswer ? 'border-success/50 bg-success/5 text-success' : 'border-border'
                            )}>
                              <span className="text-xs text-muted-foreground">Option {i + 1}</span>
                              <p>{opt}</p>
                            </div>
                          ))}
                        </div>
                        {q.explanation && (
                          <div className="p-2 rounded-lg bg-muted/50">
                            <span className="text-xs text-muted-foreground">Explanation</span>
                            <p>{q.explanation}</p>
                          </div>
                        )}
                        {q.tags && q.tags.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {q.tags.map((tag, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                <Tag className="w-3 h-3 mr-1" />{tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}>
                      <ChevronDown className={cn('w-4 h-4 transition-transform', expandedId === q.id && 'rotate-180')} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(q)}>
                      <Edit3 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(q.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingQuestion ? 'Edit Question' : 'Add Question'}</DialogTitle>
            <DialogDescription>
              {editingQuestion ? 'Update the question in the bank.' : 'Create a new reusable question for the question bank.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="qQuestion">Question *</Label>
              <Textarea
                id="qQuestion"
                value={formQuestion}
                onChange={e => setFormQuestion(e.target.value)}
                placeholder="Enter the question text..."
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-3">
              <Label>Options * (at least 2)</Label>
              {formOptions.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correctAnswer"
                    checked={formCorrectAnswer === i}
                    onChange={() => setFormCorrectAnswer(i)}
                    className="shrink-0"
                  />
                  <Input
                    value={opt}
                    onChange={e => {
                      const newOpts = [...formOptions];
                      newOpts[i] = e.target.value;
                      setFormOptions(newOpts);
                    }}
                    placeholder={`Option ${i + 1}`}
                  />
                  {i >= 2 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFormOptions(formOptions.filter((_, idx) => idx !== i))}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              {formOptions.length < 6 && (
                <Button variant="outline" size="sm" onClick={() => setFormOptions([...formOptions, ''])}>
                  <Plus className="w-4 h-4 mr-1" /> Add Option
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="qExplanation">Explanation</Label>
              <Textarea
                id="qExplanation"
                value={formExplanation}
                onChange={e => setFormExplanation(e.target.value)}
                placeholder="Explain why the correct answer is right..."
                className="min-h-[60px]"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="qCategory">Category</Label>
                <Input
                  id="qCategory"
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                  placeholder="e.g. Math, Science"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qDifficulty">Difficulty</Label>
                <Select value={formDifficulty} onValueChange={setFormDifficulty}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="qTags">Tags (comma separated)</Label>
                <Input
                  id="qTags"
                  value={formTags}
                  onChange={e => setFormTags(e.target.value)}
                  placeholder="e.g. algebra, physics"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editingQuestion ? 'Update Question' : 'Create Question'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
