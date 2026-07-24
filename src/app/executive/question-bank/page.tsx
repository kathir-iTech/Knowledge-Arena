'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { BookOpen, Plus, Search, Edit3, Trash2, ChevronDown, Tag, Layers, Brain, X, Sparkles, ChevronLeft, CheckSquare, Square, ListChecks } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const PDFQuizGenerator = dynamic(() => import('@/components/quiz/PDFQuizGenerator').then(m => m.PDFQuizGenerator), { ssr: false });
const ExecutiveQuestionReviewPanel = dynamic(() => import('@/components/quiz/ExecutiveQuestionReviewPanel').then(m => m.ExecutiveQuestionReviewPanel), { ssr: false });

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

interface GeneratedQuestion {
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

interface QuestionSetSummary {
  id: string;
  name: string;
  category: string;
  questionCount: number;
  questionIds: string[];
}

export default function QuestionBankPage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('bank');
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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // AI PDF Forge State
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[] | null>(null);
  const [forgeDifficulty, setForgeDifficulty] = useState('');
  const [showForgeWithPreserved, setShowForgeWithPreserved] = useState(false);
  const forgeParams = useRef<{ pdfDataUri: string; diff: 'easy' | 'moderate' | 'hard'; count: number } | null>(null);

  // Multi-select for Question Sets
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(new Set());
  const [showAddToSetDialog, setShowAddToSetDialog] = useState(false);
  const [availableSets, setAvailableSets] = useState<QuestionSetSummary[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string>('');
  const [newSetName, setNewSetName] = useState('');
  const [addingToSet, setAddingToSet] = useState(false);
  const [loadingSets, setLoadingSets] = useState(false);

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
  }, [auth, difficultyFilter, categoryFilter, debouncedSearch, toast]);

  useEffect(() => {
    if (user) fetchQuestions();
  }, [user, fetchQuestions]);

  const fetchSets = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      setLoadingSets(true);
      const res = await fetch('/api/executive/question-sets', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch sets');
      const data = await res.json();
      setAvailableSets(data.sets || []);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load question sets.' });
    } finally {
      setLoadingSets(false);
    }
  }, [auth, toast]);

  const openAddToSetDialog = () => {
    fetchSets();
    setSelectedSetId('');
    setNewSetName('');
    setShowAddToSetDialog(true);
  };

  const handleAddToSet = async () => {
    if (selectedBankIds.size === 0) return;
    setAddingToSet(true);
    try {
      const token = await auth.currentUser!.getIdToken();

      let targetSetId = selectedSetId;

      // Create new set if name provided
      if (!targetSetId && newSetName.trim()) {
        const createRes = await fetch('/api/executive/question-sets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: newSetName.trim(), category: 'General', tags: [] }),
        });
        if (!createRes.ok) throw new Error('Failed to create set');
        const createData = await createRes.json();
        targetSetId = createData.id;
      }

      if (!targetSetId) {
        toast({ variant: 'destructive', title: 'Error', description: 'Select an existing set or enter a name for a new one.' });
        return;
      }

      // Get current set data to merge IDs
      const getRes = await fetch(`/api/executive/question-sets?`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const getData = await getRes.json();
      const targetSet = getData.sets?.find((s: QuestionSetSummary) => s.id === targetSetId);

      const existingIds = targetSet?.questionIds || [];
      const newIds = Array.from(selectedBankIds);
      const mergedIds = [...new Set([...existingIds, ...newIds])];

      if (mergedIds.length === existingIds.length) {
        toast({ title: 'Already in Set', description: 'All selected questions are already in this set.' });
        return;
      }

      const addedCount = mergedIds.length - existingIds.length;
      const patchRes = await fetch('/api/executive/question-sets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: targetSetId, questionIds: mergedIds }),
      });
      if (!patchRes.ok) throw new Error('Failed to update set');
      toast({ title: 'Added to Set', description: `${addedCount} question(s) added to set.` });
      setShowAddToSetDialog(false);
      setSelectedBankIds(new Set());
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setAddingToSet(false);
    }
  };

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

  const toggleSelect = (id: string) => {
    setSelectedBankIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedBankIds(new Set(questions.map(q => q.id)));
  };

  const clearSelection = () => {
    setSelectedBankIds(new Set());
  };

  const handleQuestionsGenerated = (qList: GeneratedQuestion[], diff: string, dataUri?: string, questionCount?: number) => {
    setGeneratedQuestions(qList);
    setForgeDifficulty(diff);
    setShowForgeWithPreserved(false);
    if (dataUri && questionCount) {
      forgeParams.current = { pdfDataUri: dataUri, diff: diff as 'easy' | 'moderate' | 'hard', count: questionCount };
    }
  };

  const handleRegenerate = () => {
    setGeneratedQuestions(null);
    setShowForgeWithPreserved(false);
    forgeParams.current = null;
  };

  const handleEditSettings = () => {
    setShowForgeWithPreserved(true);
  };

  const handleRegenerateQuestion = async (index: number) => {
    if (!forgeParams.current || !generatedQuestions) return;
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!idToken) throw new Error('UNAUTHORIZED');
      const { generateQuizFromPDF } = await import('@/ai/flows/generate-quiz-pdf-flow');
      const result = await Promise.race([
        generateQuizFromPDF({
          pdfDataUri: forgeParams.current.pdfDataUri,
          difficulty: forgeParams.current.diff,
          questionCount: 1,
          idToken,
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 120000)),
      ]);
      if (result.error) throw new Error(result.error);
      if (result.questions && result.questions.length > 0) {
        const q = result.questions[0];
        if (!q.text || q.text.trim().length < 5) throw new Error('Generated question text is too short');
        if (!q.options || q.options.length < 2) throw new Error('Generated question has too few options');
        if (q.correctAnswerIndex < 0 || q.correctAnswerIndex >= q.options.length) throw new Error('Generated question has invalid correct answer');
        if (new Set(q.options.map(o => o.trim().toLowerCase())).size !== q.options.length) throw new Error('Generated question has duplicate options');
        const updated = [...generatedQuestions];
        updated[index] = q;
        setGeneratedQuestions(updated);
        toast({ title: 'Regenerated', description: `Question ${index + 1} has been reforged.` });
      } else {
        throw new Error('AI returned empty result');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      toast({ variant: 'destructive', title: 'Regeneration Failed', description: msg });
    }
  };

  const handleImportComplete = () => {
    setGeneratedQuestions(null);
    setShowForgeWithPreserved(false);
    forgeParams.current = null;
    setActiveTab('bank');
    fetchQuestions();
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
    <div className="page-container safe-top safe-bottom animate-in">
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-1.5">
          <h1 className="text-page-title font-headline tracking-tight text-primary">Question Bank</h1>
          <p className="text-base text-muted-foreground">Create and manage reusable questions manually or via AI PDF Forge.</p>
        </div>
        {activeTab === 'bank' && (
          <Button onClick={openCreateDialog}>
            <Plus className="w-4 h-4 mr-2" />
            Add Question
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="grid w-full grid-cols-2 h-12 bg-secondary/20 p-1 rounded-lg border border-primary/15">
          <TabsTrigger value="bank" className="text-sm font-headline font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md">
            <BookOpen className="mr-2 h-4 w-4" /> Question List & Manual
          </TabsTrigger>
          <TabsTrigger value="forge" className="text-sm font-headline font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md">
            <Sparkles className="mr-2 h-4 w-4" /> AI PDF Forge
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bank" className="animate-in space-y-4">
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
              <SelectTrigger className="w-auto min-w-[120px]">
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
              <SelectTrigger className="w-auto min-w-[120px]">
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
              <div className="flex items-center justify-between px-1">
                <span className="text-sm text-muted-foreground">
                  {selectedBankIds.size > 0 ? `${selectedBankIds.size} selected` : `${questions.length} questions`}
                </span>
                <div className="flex gap-2">
                  {selectedBankIds.size > 0 && (
                    <>
                      <Button variant="outline" size="sm" onClick={clearSelection}>
                        <X className="w-3 h-3 mr-1.5" /> Clear
                      </Button>
                      <Button variant="outline" size="sm" onClick={openAddToSetDialog}>
                        <Layers className="w-3 h-3 mr-1.5" /> Add to Set
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="sm" onClick={selectAllVisible} disabled={questions.length === 0}>
                    <ListChecks className="w-3 h-3 mr-1.5" /> Select All
                  </Button>
                </div>
              </div>
              {questions.map(q => {
                const diffBadgeVariant = q.difficulty === 'easy' ? 'border-success/30 text-success' : q.difficulty === 'hard' ? 'border-destructive/30 text-destructive' : 'border-warning/30 text-warning';
                const isSelected = selectedBankIds.has(q.id);
                return (
                  <Card key={q.id} className={cn(isSelected && 'border-primary bg-primary/5')}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-3">
                        <button
                          onClick={() => toggleSelect(q.id)}
                          className="shrink-0 mt-1 text-muted-foreground hover:text-primary transition-colors"
                          aria-label={isSelected ? `Deselect question` : `Select question`}
                        >
                          {isSelected ? <CheckSquare className="w-5 h-5 text-primary" /> : <Square className="w-5 h-5" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className={diffBadgeVariant}>
                              {q.difficulty}
                            </Badge>
                            <Badge variant="secondary">{q.category}</Badge>
                            <span className="text-xs text-muted-foreground">{formatDate(q.createdAt)}</span>
                          </div>
                          <p className="font-medium mb-2">{q.question}</p>
                          {expandedId === q.id && (
                            <div className="space-y-2 mt-3 text-sm">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {q.options.map((opt, optIdx) => {
                                  const isCorrect = optIdx === q.correctAnswer;
                                  return (
                                    <div key={optIdx} className={cn('p-2 rounded-lg border', isCorrect ? 'border-success/50 bg-success/5 text-success' : 'border-border')}>
                                      <span className="text-xs text-muted-foreground font-mono">Option {String.fromCharCode(65 + optIdx)}</span>
                                      <p>{opt}</p>
                                    </div>
                                  );
                                })}
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
                          <Button variant="ghost" size="sm" onClick={() => setExpandedId(expandedId === q.id ? null : q.id)} aria-label="Toggle details">
                            <ChevronDown className={cn('w-4 h-4 transition-transform', expandedId === q.id && 'rotate-180')} />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(q)} aria-label="Edit question">
                            <Edit3 className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(q.id)} aria-label="Delete question">
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="forge" className="animate-in">
          {generatedQuestions && !showForgeWithPreserved ? (
            <div className="space-y-4">
              <Button variant="ghost" onClick={handleRegenerate} className="h-9 mb-2">
                <ChevronLeft className="mr-2 h-4 w-4" /> Back to PDF Upload
              </Button>
              <Suspense fallback={<div className="h-96 bg-secondary/10 rounded-xl animate-pulse" />}>
                <ExecutiveQuestionReviewPanel
                  initialQuestions={generatedQuestions}
                  difficulty={forgeDifficulty}
                  onRegenerate={handleRegenerate}
                  onEditSettings={handleEditSettings}
                  onRegenerateQuestion={forgeParams.current ? handleRegenerateQuestion : undefined}
                  onImportComplete={handleImportComplete}
                />
              </Suspense>
            </div>
          ) : (
            <Suspense fallback={<div className="h-96 bg-secondary/10 rounded-xl animate-pulse" />}>
              <PDFQuizGenerator onQuestionsGenerated={handleQuestionsGenerated} />
            </Suspense>
          )}
        </TabsContent>
      </Tabs>

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
                    aria-label={`Select option ${String.fromCharCode(65 + i)} as correct`}
                  />
                  <Input
                    value={opt}
                    onChange={e => {
                      const newOpts = [...formOptions];
                      newOpts[i] = e.target.value;
                      setFormOptions(newOpts);
                    }}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  />
                  {i >= 2 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFormOptions(formOptions.filter((_, idx) => idx !== i))}
                      aria-label="Remove option"
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  <SelectTrigger id="qDifficulty">
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

      <Dialog open={showAddToSetDialog} onOpenChange={setShowAddToSetDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to Question Set</DialogTitle>
            <DialogDescription>
              {selectedBankIds.size} question(s) selected. Choose an existing set or create a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Select Existing Set</Label>
              {loadingSets ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : availableSets.length > 0 ? (
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {availableSets.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedSetId(s.id); setNewSetName(''); }}
                      className={cn(
                        "w-full text-left p-2 rounded border text-sm transition-colors",
                        selectedSetId === s.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                      )}
                    >
                      <span className="font-medium">{s.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">({s.questionCount} questions)</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No existing sets. Create a new one below.</p>
              )}
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newSetName">Create New Set</Label>
              <Input
                id="newSetName"
                value={newSetName}
                onChange={e => { setNewSetName(e.target.value); setSelectedSetId(''); }}
                placeholder="e.g. Python Basics"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddToSetDialog(false)}>Cancel</Button>
            <Button onClick={handleAddToSet} disabled={(!selectedSetId && !newSetName.trim()) || addingToSet}>
              {addingToSet ? 'Adding...' : `Add to ${selectedSetId ? 'Set' : 'New Set'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Question?</AlertDialogTitle>
            <AlertDialogDescription>
              This question will be permanently removed from the bank and all question sets. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteConfirmId) handleDelete(deleteConfirmId); setDeleteConfirmId(null); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
