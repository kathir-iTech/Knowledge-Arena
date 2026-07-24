"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { BookOpen, Search, Layers, Loader2, Sparkles, ChevronDown, ChevronUp, Hash, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { arenaCreationService } from '@/services/arena-creation.service';

interface QuestionSet {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: string | null;
  tags: string[];
  questionIds: string[];
  questionCount: number;
}

interface QuestionFromSet {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
}

interface ArenaTemplate {
  id: string;
  name: string;
  description: string;
  questionCount: number;
  timer: number;
}

const TEMPLATES: ArenaTemplate[] = [
  { id: 'quick', name: 'Quick Quiz', description: 'Fast-paced knowledge check', questionCount: 15, timer: 30 },
  { id: 'practice', name: 'Practice', description: 'Standard practice session', questionCount: 20, timer: 45 },
  { id: 'challenge', name: 'Challenge', description: 'Push their limits', questionCount: 25, timer: 60 },
  { id: 'marathon', name: 'Marathon', description: 'Endurance battle', questionCount: 50, timer: 90 },
];

interface ArenaTemplateSelectorProps {
  onArenaCreated?: () => void;
}

export function ArenaTemplateSelector({ onArenaCreated }: ArenaTemplateSelectorProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { auth } = useFirebase();
  const { user } = useAuth();
  const [sets, setSets] = useState<QuestionSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSet, setSelectedSet] = useState<QuestionSet | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ArenaTemplate | null>(null);
  const [questionCount, setQuestionCount] = useState(15);
  const [globalTimer, setGlobalTimer] = useState(30);
  const [step, setStep] = useState<'template' | 'set' | 'review'>('template');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [setQuestions, setSetQuestions] = useState<QuestionFromSet[]>([]);
  const [fetchingQuestions, setFetchingQuestions] = useState(false);

  const fetchSets = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/executive/question-sets', {
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
  }, [auth, toast]);

  useEffect(() => {
    if (user) fetchSets();
  }, [user, fetchSets]);

  const handleSelectTemplate = (t: ArenaTemplate) => {
    setSelectedTemplate(t);
    setQuestionCount(t.questionCount);
    setGlobalTimer(t.timer);
    setStep('set');
  };

  const handleSelectSet = (s: QuestionSet) => {
    setSelectedSet(s);
    setStep('review');
    if (s.questionCount < questionCount) {
      setQuestionCount(s.questionCount);
    }
  };

  const pickRandomQuestions = (questions: QuestionFromSet[], count: number): QuestionFromSet[] => {
    const shuffled = [...questions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
  };

  const handleCreateArena = async () => {
    if (!selectedSet || !selectedTemplate || !user) return;
    setIsSubmitting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('UNAUTHORIZED');

      setFetchingQuestions(true);
      const params = new URLSearchParams();
      selectedSet.questionIds.forEach(qid => params.append('ids', qid));
      const res = await fetch(`/api/executive/question-bank?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load questions');
      const data = await res.json();
      const allQuestions: QuestionFromSet[] = (data.questions || []).filter((q: QuestionFromSet) =>
        selectedSet.questionIds.includes(q.id)
      );
      setFetchingQuestions(false);

      if (allQuestions.length === 0) {
        throw new Error('No questions found in this set.');
      }

      const finalCount = Math.min(questionCount, allQuestions.length);
      const picked = pickRandomQuestions(allQuestions, finalCount);

      if (picked.length < 3) {
        toast({ variant: 'destructive', title: 'Not Enough Questions', description: `Only ${picked.length} questions available. At least 3 required.` });
        return;
      }

      const roomCode = await arenaCreationService.createArenaAtomic({
        title: `${selectedTemplate.name}: ${selectedSet.name}`,
        questions: picked.map(q => ({
          text: q.question,
          options: q.options,
          correctAnswerIndex: q.correctAnswer,
          timer: globalTimer,
        })),
        createdBy: user.id,
      });

      onArenaCreated?.();
      toast({ title: 'Arena Created', description: `Room Code: ${roomCode}` });
      router.push(`/battle/${roomCode}`);
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'Arena Error', description: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="py-12 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground mt-2">Loading question sets...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-primary/5 border-b border-primary/10">
        <div className="flex items-center gap-3">
          <Layers className="w-6 h-6 text-primary" />
          <div>
            <CardTitle className="text-2xl font-headline text-primary uppercase">Question Sets</CardTitle>
            <CardDescription>Pick a template and a question set to instantly create an arena.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {step === 'template' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => handleSelectTemplate(t)}
                className={cn(
                  "flex flex-col items-center gap-2 p-6 rounded-lg border-2 transition-all text-center",
                  selectedTemplate?.id === t.id
                    ? "bg-primary/5 border-primary"
                    : "bg-background/30 border-border/40 hover:border-primary/30 hover:bg-primary/5"
                )}
              >
                <span className="font-bold text-lg font-headline">{t.name}</span>
                <span className="text-xs text-muted-foreground">{t.description}</span>
                <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                  <span>{t.questionCount} Questions</span>
                  <span>{t.timer}s Timer</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {step === 'set' && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep('template')} className="mb-2">
              <ChevronDown className="rotate-90 mr-2 h-4 w-4" /> Back to Templates
            </Button>

            {sets.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <BookOpen className="w-10 h-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No question sets available.</p>
                <p className="text-xs text-muted-foreground">Ask an Executive to create question sets first.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {sets.map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectSet(s)}
                    className={cn(
                      "w-full text-left rounded-lg border transition-all p-4",
                      selectedSet?.id === s.id
                        ? "border-primary bg-primary/5"
                        : "border-border/40 hover:border-primary/30 hover:bg-muted/20"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate">{s.name}</h3>
                        {s.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{s.description}</p>}
                        <div className="flex gap-2 mt-2">
                          <Badge variant="secondary" className="text-[10px] px-2 py-0">
                            <Hash className="w-3 h-3 mr-1" />{s.questionCount} Q
                          </Badge>
                          <Badge variant="outline" className="text-[10px] px-2 py-0">{s.category}</Badge>
                        </div>
                      </div>
                      <CheckCircle2 className={cn("w-5 h-5 shrink-0", selectedSet?.id === s.id ? "text-primary" : "text-transparent")} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 'review' && selectedSet && selectedTemplate && (
          <div className="space-y-6">
            <Button variant="ghost" size="sm" onClick={() => { setStep('set'); setSelectedSet(null); }} className="mb-2">
              <ChevronDown className="rotate-90 mr-2 h-4 w-4" /> Back to Sets
            </Button>

            <div className="bg-secondary/10 rounded-lg p-4 border border-border/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Template</span>
                <Badge variant="outline">{selectedTemplate.name}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Question Set</span>
                <Badge variant="secondary">{selectedSet.name}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Available Questions</span>
                <span className="text-sm">{selectedSet.questionCount}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label className="text-base font-medium">Questions to Include</Label>
                <span className="bg-primary/10 text-primary font-bold px-3 py-1 rounded text-sm">
                  {questionCount} QUESTIONS
                </span>
              </div>
              <Slider
                value={[questionCount]}
                onValueChange={val => setQuestionCount(val[0])}
                min={5}
                max={Math.min(selectedSet.questionCount, 50)}
                step={1}
              />
              <p className="text-xs text-muted-foreground">
                Questions will be randomly selected from the set. No duplicates.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="arena-timer" className="text-base font-medium">Timer (Seconds)</Label>
              <Input
                id="arena-timer"
                type="number"
                min={5}
                max={120}
                value={globalTimer}
                onChange={e => setGlobalTimer(parseInt(e.target.value) || 30)}
              />
              <p className="text-xs text-muted-foreground">Default from template: {selectedTemplate.timer}s</p>
            </div>

            <Button
              onClick={handleCreateArena}
              disabled={isSubmitting || fetchingQuestions}
              size="lg"
              className="w-full h-14 text-lg font-headline"
            >
              {isSubmitting || fetchingQuestions ? (
                <Loader2 className="animate-spin mr-2" />
              ) : (
                <Sparkles className="mr-2 h-5 w-5" />
              )}
              CREATE ARENA
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
