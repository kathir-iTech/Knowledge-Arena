"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Trash2, Edit3, ChevronDown, ChevronUp, Save, X, Sparkles, CheckCircle2, AlertTriangle, Loader2, RefreshCw, BookOpen } from 'lucide-react';
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
  onRegenerate: () => void;
  onEditSettings: () => void;
  onRegenerateQuestion?: (index: number) => Promise<void>;
  onImportComplete: () => void;
}

export function ExecutiveQuestionReviewPanel({
  initialQuestions,
  difficulty,
  onRegenerate,
  onEditSettings,
  onRegenerateQuestion,
  onImportComplete,
}: ExecutiveQuestionReviewPanelProps) {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const { toast } = useToast();

  const [questions, setQuestions] = useState<Question[]>(
    initialQuestions.map(q => ({
      id: uuidv4(),
      text: q.text,
      options: q.options,
      correctAnswerIndex: q.correctAnswerIndex,
      explanation: q.explanation,
    }))
  );

  const [validationIssues, setValidationIssues] = useState<QuizValidationIssue[]>([]);
  const [globalCategory, setGlobalCategory] = useState('General');
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
      setQuestions(
        initialQuestions.map(q => ({
          id: uuidv4(),
          text: q.text,
          options: q.options,
          correctAnswerIndex: q.correctAnswerIndex,
          explanation: q.explanation,
        }))
      );
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
  const submittedRef = useRef(false);

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
    setEditForm({ ...q });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const saveEditing = () => {
    if (!editForm) return;
    setQuestions(questions.map(q => (q.id === editForm.id ? editForm : q)));
    setEditingId(null);
    setEditForm(null);
  };

  const handleAddToQuestionBank = async () => {
    if (!user || submittedRef.current || isSubmitting) return;
    if (user.role !== 'executive') {
      toast({ variant: 'destructive', title: 'Unauthorized', description: 'Only Executives can add to the Question Bank.' });
      return;
    }
    if (questions.length === 0) {
      toast({ variant: 'destructive', title: 'No Questions', description: 'At least one question is required.' });
      return;
    }

    const hasInvalid = validationIssues.some(i => i.severity === 'error');
    if (hasInvalid) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'Fix all validation errors before adding to the Question Bank.' });
      return;
    }

    submittedRef.current = true;
    setIsSubmitting(true);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('UNAUTHORIZED');

      const payload = questions.map(q => ({
        question: q.text,
        options: q.options,
        correctAnswer: q.correctAnswerIndex,
        explanation: q.explanation || '',
        category: globalCategory || 'General',
        difficulty: globalDifficulty === 'moderate' ? 'medium' : (globalDifficulty || 'medium'),
        tags: globalTags ? globalTags.split(',').map(t => t.trim()).filter(Boolean) : [],
      }));

      const res = await fetch('/api/executive/question-bank', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add questions');
      }

      toast({
        title: 'Added to Question Bank',
        description: `Successfully saved ${data.success || payload.length} of ${payload.length} questions.${data.failed ? ` (${data.failed} failed)` : ''}`,
      });

      onImportComplete();
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'Import Error', description: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setIsSubmitting(false);
      submittedRef.current = false;
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
          <Card key={q.id} className="relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary/10 group-hover:bg-primary/30 transition-colors" />

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
                    <Button variant="ghost" size="icon" onClick={() => startEditing(q)} aria-label={`Edit question ${index + 1}`}><Edit3 className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleShuffleOptions(q.id)} className="text-muted-foreground" title="Shuffle options" aria-label="Shuffle options"><RefreshCw className="w-4 h-4 rotate-90" /></Button>
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
          <div className={cn("w-3 h-3 rounded-full", questions.length === 0 ? "bg-destructive" : "bg-primary")} />
          <span className="font-bold">{questions.length} Questions Ready</span>
          {questions.length === 0 && (
            <div className="flex items-center gap-2 text-destructive font-bold text-xs">
              <AlertTriangle className="w-4 h-4" /> At least 1 question required.
            </div>
          )}
        </div>
        <Button
          disabled={questions.length === 0 || isSubmitting}
          size="lg"
          onClick={handleAddToQuestionBank}
          className="h-14 px-12 text-xl font-headline"
        >
          {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <BookOpen className="mr-2" />}
          ADD TO QUESTION BANK
        </Button>
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
    </div>
  );
}
