"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, BookOpen, Search, Loader2, AlertCircle, Sparkles, ChevronDown, ChevronUp, X, CheckCircle2, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';
import { Badge } from '@/components/ui/badge';

interface QuestionBankItem {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  category: string;
  difficulty: string;
  tags: string[];
}

interface GeneratedQuestion {
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

interface QuestionBankPickerProps {
  onQuestionsGenerated: (questions: GeneratedQuestion[], difficulty: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function QuestionBankPicker({ onQuestionsGenerated, onDirtyChange }: QuestionBankPickerProps) {
  const { toast } = useToast();
  const { auth } = useFirebase();
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const user = auth?.currentUser;
      if (!user) { setLoading(false); return; }
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (difficultyFilter !== 'all') params.set('difficulty', difficultyFilter);
      if (search) params.set('search', search);
      const res = await fetch(`/api/executive/question-bank?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setQuestions(data.questions || []);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load question bank.' });
    } finally {
      setLoading(false);
    }
  }, [auth, categoryFilter, difficultyFilter, search, toast]);

  useEffect(() => {
    const timer = setTimeout(fetchQuestions, 300);
    return () => clearTimeout(timer);
  }, [fetchQuestions]);

  useEffect(() => {
    onDirtyChange?.(selectedIds.size > 0);
  }, [selectedIds.size, onDirtyChange]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(questions.map(q => q.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleImport = () => {
    if (selectedIds.size === 0) return;
    const imported: GeneratedQuestion[] = questions
      .filter(q => selectedIds.has(q.id))
      .map(q => ({
        text: q.question,
        options: q.options,
        correctAnswerIndex: q.correctAnswer,
        explanation: q.explanation || '',
      }));
    if (imported.length < 3) {
      toast({ variant: 'destructive', title: 'Minimum Questions', description: 'Select at least 3 questions to create an arena.' });
      return;
    }
    onQuestionsGenerated(imported, 'mixed');
    toast({ title: 'Questions Imported', description: `${imported.length} questions added to review.` });
  };

  const categories = Array.from(new Set(questions.map(q => q.category).filter(Boolean)));

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-primary/5 border-b border-primary/10">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-primary" />
          <div>
            <CardTitle className="text-2xl font-headline text-primary uppercase">Question Bank</CardTitle>
            <p className="text-sm text-muted-foreground">Select reusable questions to build your arena.</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search questions..."
              className="pl-10"
              aria-label="Search question bank"
            />
          </div>
          <select
            value={difficultyFilter}
            onChange={e => setDifficultyFilter(e.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            aria-label="Filter by difficulty"
          >
            <option value="all">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            aria-label="Filter by category"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {loading ? 'Loading...' : `${questions.length} question${questions.length !== 1 ? 's' : ''} found`}
          </span>
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <>
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  <X className="mr-1.5 h-3 w-3" /> Clear ({selectedIds.size})
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={selectAll} disabled={questions.length === 0}>
              Select All
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="h-24 bg-muted/30 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : questions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No questions found in the bank.</p>
            <p className="text-xs text-muted-foreground">Ask an Executive to add questions to the shared bank.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {questions.map(q => {
              const isSelected = selectedIds.has(q.id);
              return (
                <div
                  key={q.id}
                  className={cn(
                    "rounded-lg border transition-all cursor-pointer",
                    isSelected ? "border-primary bg-primary/5" : "border-border/40 hover:border-primary/30 hover:bg-muted/20"
                  )}
                  onClick={() => toggleSelect(q.id)}
                  role="checkbox"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleSelect(q.id); } }}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "flex items-center justify-center w-6 h-6 rounded border-2 shrink-0 mt-0.5 transition-colors",
                        isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                      )}>
                        {isSelected && <Check className="w-4 h-4 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Badge variant="outline" className={cn(
                            "text-[10px] px-2 py-0",
                            q.difficulty === 'easy' ? "text-green-600 border-green-200" :
                            q.difficulty === 'hard' ? "text-red-600 border-red-200" :
                            "text-yellow-600 border-yellow-200"
                          )}>
                            {q.difficulty || 'medium'}
                          </Badge>
                          {q.category && (
                            <Badge variant="secondary" className="text-[10px] px-2 py-0">
                              {q.category}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium line-clamp-2">{q.question}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === q.id ? null : q.id); }}
                        className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
                        aria-label={expandedId === q.id ? 'Collapse' : 'Expand'}
                      >
                        {expandedId === q.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  {expandedId === q.id && (
                    <div className="px-4 pb-4 pt-0 border-t border-border/20">
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt, i) => (
                          <div key={i} className={cn(
                            "p-2.5 rounded text-xs border flex items-center gap-2",
                            q.correctAnswer === i ? "bg-primary/5 border-primary/20 text-primary font-semibold" : "bg-muted/20 border-border/30"
                          )}>
                            <span className="font-mono shrink-0">{String.fromCharCode(65 + i)}</span>
                            {opt}
                            {q.correctAnswer === i && <CheckCircle2 className="ml-auto w-3 h-3 text-primary shrink-0" />}
                          </div>
                        ))}
                      </div>
                      {q.explanation && (
                        <p className="mt-3 text-xs text-muted-foreground italic">{q.explanation}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="pt-4 border-t border-border/20">
          <Button
            onClick={handleImport}
            disabled={selectedIds.size === 0}
            size="lg"
            className="w-full h-14 text-lg font-headline"
          >
            <Sparkles className="mr-2 h-5 w-5" />
            Import {selectedIds.size > 0 ? `(${selectedIds.size})` : ''} Questions to Review
          </Button>
          {selectedIds.size > 0 && selectedIds.size < 3 && (
            <p className="text-xs text-destructive text-center mt-2">
              Select at least 3 questions to create an arena.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
