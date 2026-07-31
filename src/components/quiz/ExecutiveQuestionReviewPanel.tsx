"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Trash2, Edit3, ChevronDown, ChevronUp, Save, X, Sparkles, CheckCircle2, AlertTriangle, Loader2, RefreshCw, Copy, ArrowUp, ArrowDown, Plus, Shuffle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { validateQuiz, type QuizValidationIssue } from '@/lib/quiz-validator';

interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  difficulty?: string;
  category?: string;
  tags?: string;
}

interface GeneratedQuestion {
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

interface ExecutiveQuestionReviewPanelProps {
  initialQuestions: GeneratedQuestion[];
  difficulty: string;
  category?: string;
  onRegenerate: () => void;
  onEditSettings: () => void;
  onRegenerateQuestion?: (index: number) => Promise<void>;
  onImportComplete: () => void;
}

export function ExecutiveQuestionReviewPanel({
  initialQuestions,
  difficulty,
  category,
  onRegenerate,
  onEditSettings,
  onRegenerateQuestion,
  onImportComplete,
}: ExecutiveQuestionReviewPanelProps) {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const { toast } = useToast();

  const [questions, setQuestions] = useState<Question[]>(() =>
    initialQuestions.map(q => ({
      id: uuidv4(),
      text: q.text,
      options: q.options,
      correctAnswerIndex: q.correctAnswerIndex,
      explanation: q.explanation,
    }))
  );

  const [validationIssues, setValidationIssues] = useState<QuizValidationIssue[]>([]);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(() => new Set());
  const [globalCategory, setGlobalCategory] = useState(category || 'General');
  const [globalDifficulty, setGlobalDifficulty] = useState(difficulty || 'medium');
  const [globalTags, setGlobalTags] = useState('');

  useEffect(() => {
    const mapped = questions.map(q => ({
      text: q.text,
      options: q.options,
      correctAnswerIndex: q.correctAnswerIndex,
      explanation: q.explanation,
    }));
    setValidationIssues(validateQuiz(mapped));
  }, [questions]);

  const prevInitialRef = useRef<GeneratedQuestion[]>(initialQuestions);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);

  useEffect(() => {
    const prev = prevInitialRef.current;
    if (prev === initialQuestions) return;
    if (prev.length === initialQuestions.length) {
      setQuestions(prevQ => {
        let changed = false;
        const updated = prevQ.map((q, i) => {
          if (i < initialQuestions.length) {
            const oldGen = prev[i];
            const newGen = initialQuestions[i];
            if (
              oldGen.text !== newGen.text ||
              JSON.stringify(oldGen.options) !== JSON.stringify(newGen.options) ||
              oldGen.correctAnswerIndex !== newGen.correctAnswerIndex
            ) {
              changed = true;
              return {
                ...q,
                text: newGen.text,
                options: newGen.options,
                correctAnswerIndex: newGen.correctAnswerIndex,
                explanation: newGen.explanation,
              };
            }
          }
          return q;
        });
        return changed ? updated : prevQ;
      });
    } else {
      const newQuestions = initialQuestions.map(q => ({
        id: uuidv4(),
        text: q.text,
        options: q.options,
        correctAnswerIndex: q.correctAnswerIndex,
        explanation: q.explanation,
      }));
      setQuestions(newQuestions);
      setApprovedIds(new Set());
    }
    prevInitialRef.current = initialQuestions;
  }, [initialQuestions]);

  const handleShuffleOptions = (id: string) => {
    setQuestions(prevQ =>
      prevQ.map(q => {
        if (q.id !== id) return q;
        const items = q.options.map((text, i) => ({
          text,
          isCorrect: i === q.correctAnswerIndex,
          originalIndex: i,
        }));
        for (let i = items.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [items[i], items[j]] = [items[j], items[i]];
        }
        const newCorrectIndex = items.findIndex(item => item.isCorrect);
        return {
          ...q,
          options: items.map(item => item.text),
          correctAnswerIndex: newCorrectIndex,
        };
      })
    );
  };

  const handleShuffleAllAnswers = () => {
    setQuestions(prevQ =>
      prevQ.map(q => {
        const items = q.options.map((text, i) => ({
          text,
          isCorrect: i === q.correctAnswerIndex,
        }));
        for (let i = items.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [items[i], items[j]] = [items[j], items[i]];
        }
        const newCorrectIndex = items.findIndex(item => item.isCorrect);
        return {
          ...q,
          options: items.map(item => item.text),
          correctAnswerIndex: newCorrectIndex,
        };
      })
    );
    toast({ title: 'Shuffled', description: 'All answer options have been shuffled.' });
  };

  const handleDuplicate = (id: string) => {
    setQuestions(prevQ => {
      const idx = prevQ.findIndex(q => q.id === id);
      if (idx === -1) return prevQ;
      const original = prevQ[idx];
      const clone: Question = {
        ...original,
        id: uuidv4(),
        text: original.text + ' (Copy)',
      };
      const updated = [...prevQ];
      updated.splice(idx + 1, 0, clone);
      return updated;
    });
  };

  const handleMoveUp = (id: string) => {
    setQuestions(prevQ => {
      const idx = prevQ.findIndex(q => q.id === id);
      if (idx <= 0) return prevQ;
      const updated = [...prevQ];
      [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
      return updated;
    });
  };

  const handleMoveDown = (id: string) => {
    setQuestions(prevQ => {
      const idx = prevQ.findIndex(q => q.id === id);
      if (idx === -1 || idx >= prevQ.length - 1) return prevQ;
      const updated = [...prevQ];
      [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
      return updated;
    });
  };

  const handleAddMoreQuestions = () => {
    const newQuestion: Question = {
      id: uuidv4(),
      text: '',
      options: ['', '', '', ''],
      correctAnswerIndex: 0,
      explanation: '',
    };
    setQuestions(prev => [...prev, newQuestion]);
    toast({ title: 'Question Added', description: 'A blank question was added. Edit it to fill in the details.' });
  };

  const handleDiscardAll = () => {
    setQuestions([]);
    setApprovedIds(new Set());
    toast({ title: 'Discarded', description: 'All questions have been removed.' });
  };

  const [discardConfirm, setDiscardConfirm] = useState(false);

  const handleRegenQuestion = async (index: number) => {
    if (!onRegenerateQuestion || regeneratingIndex !== null) return;
    setRegeneratingIndex(index);
    try {
      await onRegenerateQuestion(index);
    } finally {
      setRegeneratingIndex(null);
    }
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Question | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      setQuestions(prev => prev.filter(q => q.id !== deleteConfirmId));
      setDeleteConfirmId(null);
    }
  };

  const startEditing = (q: Question) => {
    setEditingId(q.id);
    setEditForm({
      ...q,
      difficulty: q.difficulty || globalDifficulty,
      category: q.category || globalCategory,
      tags: q.tags || globalTags,
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const saveEditing = () => {
    if (!editForm) return;
    setQuestions(questions.map(q => (q.id === editForm.id ? {
      ...editForm,
      difficulty: editForm.difficulty || globalDifficulty,
      category: editForm.category || globalCategory,
      tags: editForm.tags || globalTags,
    } : q)));
    setEditingId(null);
    setEditForm(null);
  };

  const handleImport = async () => {
    setIsSubmitting(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error('UNAUTHORIZED');

      const approvedQuestions = questions.filter(q => approvedIds.has(q.id)).map(q => ({
        text: q.text,
        options: q.options,
        correctAnswerIndex: q.correctAnswerIndex,
        explanation: q.explanation,
      }));

      if (approvedQuestions.length === 0) {
        toast({ variant: 'destructive', title: 'No Questions Approved', description: 'Please approve at least one question before importing.' });
        return;
      }

      const res = await fetch('/api/executive/question-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          questions: approvedQuestions,
          category: globalCategory,
          difficulty: globalDifficulty,
          tags: globalTags,
          source: 'ai_pdf_forge',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save to question bank');
      }

      const data = await res.json();
      toast({ title: 'Import Complete', description: `${data.saved} question${data.saved !== 1 ? 's' : ''} saved to question bank.` });
      onImportComplete();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast({ variant: 'destructive', title: 'Import Failed', description: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-32">
      {(() => {
        const globalIssues = validationIssues.filter(i => i.questionIndex === -1);
        if (!globalIssues.length) return null;
        return (
          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              {globalIssues.map((issue, ii) => (
                <p key={ii} className="text-sm text-yellow-600">{issue.message}</p>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="flex flex-col md:flex-row items-center justify-between p-4 bg-secondary/20 border border-border/20 rounded-lg gap-4 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-lg">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-headline font-bold text-lg">{questions.length} Questions Forged</h2>
            <Badge variant="outline" className="uppercase tracking-widest text-[10px]">Level: {difficulty}</Badge>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={handleShuffleAllAnswers} title="Shuffle answer order for all questions">
            <Shuffle className="w-4 h-4 mr-1" /> Shuffle Answers
          </Button>
          <Button variant="ghost" size="sm" onClick={handleAddMoreQuestions}>
            <Plus className="w-4 h-4 mr-1" /> Add More
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDiscardConfirm(true)} className="text-destructive">
            <Trash2 className="w-4 h-4 mr-1" /> Discard All
          </Button>
          <Button variant="ghost" size="sm" onClick={onEditSettings}>Edit Parameters</Button>
          <Button variant="outline" size="sm" onClick={onRegenerate} className="text-primary">Regenerate All</Button>
        </div>
      </div>

      <Card className="p-4 bg-secondary/10 border-border/20">
        <CardContent className="p-0 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="batch-category">Category for Import</Label>
            <Input
              id="batch-category"
              value={globalCategory}
              onChange={e => setGlobalCategory(e.target.value)}
              placeholder="e.g. General, Physics"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="batch-difficulty">Difficulty for Import</Label>
            <Select value={globalDifficulty} onValueChange={setGlobalDifficulty}>
              <SelectTrigger id="batch-difficulty">
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
            <Label htmlFor="batch-tags">Tags (comma-separated)</Label>
            <Input
              id="batch-tags"
              value={globalTags}
              onChange={e => setGlobalTags(e.target.value)}
              placeholder="e.g. ai, pdf, exam"
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {questions.map((q, index) => (
          <Card key={q.id} className={cn("relative overflow-hidden group", !approvedIds.has(q.id) && "opacity-60 hover:opacity-100 transition-opacity")}>
            <div className={cn("absolute top-0 left-0 w-1 h-full transition-colors", approvedIds.has(q.id) ? "bg-success/50 group-hover:bg-success" : "bg-muted group-hover:bg-muted-foreground/30")} />

            {editingId === q.id && editForm ? (
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label>Question Objective</Label>
                  <Textarea
                    value={editForm.text}
                    onChange={e => setEditForm({ ...editForm, text: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {editForm.options.map((opt, i) => (
                    <div key={i} className="space-y-1">
                      <Label className="text-xs uppercase text-muted-foreground">Option {String.fromCharCode(65 + i)}</Label>
                      <Input
                        value={opt}
                        onChange={e => {
                          const newOpts = [...editForm.options];
                          newOpts[i] = e.target.value;
                          setEditForm({ ...editForm, options: newOpts });
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex flex-col md:flex-row gap-6 p-4 bg-secondary/20 rounded-lg">
                  <div className="space-y-2 flex-1">
                    <Label>Valid Solution</Label>
                    <RadioGroup
                      value={String(editForm.correctAnswerIndex)}
                      onValueChange={val => setEditForm({ ...editForm, correctAnswerIndex: parseInt(val) })}
                      className="flex gap-4"
                    >
                      {[0, 1, 2, 3].map(i => (
                        <div key={i} className="flex items-center space-x-2">
                          <RadioGroupItem value={String(i)} id={`edit-q-${q.id}-opt-${i}`} />
                          <Label htmlFor={`edit-q-${q.id}-opt-${i}`}>{String.fromCharCode(65 + i)}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Difficulty</Label>
                    <Select value={editForm.difficulty || globalDifficulty} onValueChange={val => setEditForm({ ...editForm, difficulty: val })}>
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
                    <Label>Category</Label>
                    <Input
                      value={editForm.category || ''}
                      onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                      placeholder={globalCategory}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tags</Label>
                    <Input
                      value={editForm.tags || ''}
                      onChange={e => setEditForm({ ...editForm, tags: e.target.value })}
                      placeholder={globalTags || 'comma-separated'}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="ghost" onClick={cancelEditing}><X className="mr-2 h-4 w-4" /> Cancel</Button>
                  <Button onClick={saveEditing}><Save className="mr-2 h-4 w-4" /> Commit Changes</Button>
                </div>
              </CardContent>
            ) : (
              <>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-primary font-bold">Q{index + 1}</span>
                    <CardTitle className="text-lg font-medium">{q.text}</CardTitle>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleMoveUp(q.id)}
                      disabled={index === 0}
                      className="text-muted-foreground"
                      title="Move Up"
                      aria-label="Move up"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleMoveDown(q.id)}
                      disabled={index === questions.length - 1}
                      className="text-muted-foreground"
                      title="Move Down"
                      aria-label="Move down"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDuplicate(q.id)} className="text-muted-foreground" title="Duplicate" aria-label="Duplicate">
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const next = new Set(approvedIds);
                        if (next.has(q.id)) next.delete(q.id); else next.add(q.id);
                        setApprovedIds(next);
                      }}
                      className={approvedIds.has(q.id) ? 'text-success' : 'text-muted-foreground'}
                      aria-label={approvedIds.has(q.id) ? 'Unapprove' : 'Approve'}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => startEditing(q)} aria-label={`Edit question ${index + 1}`}><Edit3 className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleShuffleOptions(q.id)} className="text-muted-foreground" title="Shuffle options" aria-label="Shuffle options"><Shuffle className="w-4 h-4" /></Button>
                    {regeneratingIndex === index ? (
                      <Button variant="ghost" size="icon" disabled className="text-primary" aria-label="Regenerating"><Loader2 className="w-4 h-4 animate-spin" /></Button>
                    ) : onRegenerateQuestion && (
                      <Button variant="ghost" size="icon" onClick={() => handleRegenQuestion(index)} className="text-primary" aria-label={`Regenerate question ${index + 1}`}><RefreshCw className="w-4 h-4" /></Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(q.id)} className="text-destructive" aria-label={`Delete question ${index + 1}`}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {q.options.map((opt, i) => (
                      <div
                        key={i}
                        className={cn(
                          "p-3 rounded-lg border text-sm flex items-center gap-3",
                          q.correctAnswerIndex === i ? "bg-primary/5 border-primary/20 text-primary font-semibold" : "bg-secondary/20 border-border/30"
                        )}
                      >
                        <span className="text-muted-foreground font-mono">{String.fromCharCode(65 + i)}</span>
                        {opt}
                        {q.correctAnswerIndex === i && <CheckCircle2 className="ml-auto w-4 h-4 text-primary" />}
                      </div>
                    ))}
                  </div>
                  {(q.difficulty || q.category || q.tags) && (
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {q.difficulty && <Badge variant="outline">{q.difficulty}</Badge>}
                      {q.category && <Badge variant="secondary">{q.category}</Badge>}
                      {q.tags && q.tags.split(',').map((tag, i) => (
                        <span key={i} className="px-2 py-0.5 bg-muted rounded-full">{tag.trim()}</span>
                      ))}
                    </div>
                  )}
                  {(() => {
                    const qIssues = validationIssues.filter(i => i.questionIndex === index);
                    if (!qIssues.length) return null;
                    return (
                      <div className="space-y-1">
                        {qIssues.map((issue, ii) => (
                          <div
                            key={ii}
                            className={cn(
                              "flex items-start gap-2 p-2 rounded text-xs",
                              issue.severity === 'error' ? "bg-destructive/5 text-destructive" : "bg-yellow-500/5 text-yellow-600"
                            )}
                          >
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                            <span>{issue.message}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  <button
                    onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    {expandedId === q.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {expandedId === q.id ? "Hide explanation" : "Show explanation"}
                  </button>
                  {expandedId === q.id && (
                    <div className="p-3 bg-primary/5 rounded-lg border border-primary/10 text-xs text-muted-foreground italic leading-relaxed">
                      {q.explanation}
                    </div>
                  )}
                </CardContent>
              </>
            )}
          </Card>
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 md:p-6 bg-background/80 backdrop-blur-xl border-t border-border/20 z-50 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6">
        <div className="flex items-center gap-3 text-sm">
          <div className={cn("w-3 h-3 rounded-full", questions.length === 0 ? "bg-destructive" : approvedIds.size === questions.length ? "bg-success" : "bg-primary")} />
          <span className="font-bold">{approvedIds.size}/{questions.length} Approved</span>
          {questions.length === 0 && (
            <div className="flex items-center gap-2 text-destructive font-bold text-xs">
              <AlertTriangle className="w-4 h-4" /> At least 1 question required.
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={onEditSettings}>
            Edit Parameters
          </Button>
          <Button
            size="sm"
            disabled={approvedIds.size === 0 || isSubmitting}
            onClick={handleImport}
          >
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
            ) : (
              <>Import {approvedIds.size > 0 ? `${approvedIds.size} Approved` : ''} Questions</>
            )}
          </Button>
        </div>
      </div>

      <AlertDialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Question?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The question will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discardConfirm} onOpenChange={setDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard All Questions?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all {questions.length} questions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDiscardConfirm(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { handleDiscardAll(); setDiscardConfirm(false); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Discard All</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
