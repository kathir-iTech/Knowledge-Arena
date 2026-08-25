
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { arenaCreationService } from '@/services/arena-creation.service';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, PlusCircle, Loader2, Sparkles, Info, PencilRuler, AlertTriangle } from 'lucide-react';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { AICopilot } from '@/components/quiz/AICopilot';
import { AdvancedScoringSection } from '@/components/quiz/AdvancedScoringSection';

const questionSchema = z.object({
  id: z.string(),
  text: z.string().min(5, 'Question text must be at least 5 characters long.'),
  options: z.array(z.string().min(1, 'Option text cannot be empty.')).min(2, 'Must have at least 2 options.').max(4, 'You can have at most 4 options.'),
  correctAnswerIndex: z.coerce.number().min(0, 'You must select a correct answer.'),
  timer: z.coerce.number().min(5, 'Timer must be at least 5 seconds.').max(120, 'Timer cannot exceed 120 seconds.'),
  explanation: z.string().optional(),
});

const quizSchema = z.object({
  title: z.string().min(3, 'Quiz title must be at least 3 characters long.'),
  questions: z.array(questionSchema).min(1, 'A quiz must have at least one question.'),
  timeBonus: z.boolean().default(true),
  streakMultiplier: z.coerce.number().min(0).max(100).default(0),
  scoreMax: z.coerce.number().min(100).max(5000).default(1000),
  scoreMin: z.coerce.number().min(0).max(1000).default(100),
});

type QuizFormData = z.infer<typeof quizSchema>;

interface QuizCreatorFormProps {
  initialQuestions?: any[];
  onDirtyChange?: (dirty: boolean) => void;
}

export function QuizCreatorForm({ initialQuestions, onDirtyChange }: QuizCreatorFormProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { auth } = useFirebase();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittedRef = useRef(false);
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null);

  const form = useForm<QuizFormData>({
    resolver: zodResolver(quizSchema),
    defaultValues: {
      title: '',
      questions: initialQuestions || [
        {
          id: uuidv4(),
          text: '',
          options: ['', ''],
          correctAnswerIndex: -1,
          timer: 30,
        },
      ],
      timeBonus: true,
      streakMultiplier: 0,
      scoreMax: 1000,
      scoreMin: 100,
    },
  });

  useEffect(() => {
    onDirtyChange?.(form.formState.isDirty);
  }, [form.formState.isDirty, onDirtyChange]);

  useEffect(() => {
    if (initialQuestions) {
      form.reset({
        title: form.getValues('title') || '',
        questions: initialQuestions.map(q => ({
          id: uuidv4(),
          text: q.text,
          options: q.options,
          correctAnswerIndex: q.correctAnswerIndex,
          timer: 30,
          explanation: q.explanation
        })),
        timeBonus: true,
        streakMultiplier: 0,
        scoreMax: 1000,
        scoreMin: 100,
      });
    }
  }, [initialQuestions, form]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'questions',
  });

  const onSubmit = async (data: QuizFormData) => {
    if (!user || (user.role !== 'commander' && user.role !== 'executive')) {
        toast({ variant: 'destructive', title: 'Error', description: 'Unauthorized.' });
        return;
    }
    if (submittedRef.current) return;

    for (let i = 0; i < data.questions.length; i++) {
      if (hasDuplicateOptions(data.questions[i])) {
        toast({ variant: 'destructive', title: 'Duplicate Options', description: `Question ${i + 1} has duplicate option text. Each option must be unique.` });
        return;
      }
    }

    submittedRef.current = true;
    setIsSubmitting(true);

    let roomCode: string | null = null;
    try {
        roomCode = await arenaCreationService.createArenaAtomic({
          title: data.title,
          questions: data.questions.map((q) => ({
            text: q.text,
            options: q.options,
            correctAnswerIndex: q.correctAnswerIndex,
            timer: q.timer,
          })),
          createdBy: user.id,
          scoringConfig: {
            score_max: data.scoreMax,
            score_min: data.scoreMin,
            time_decay: data.timeBonus,
            streak_multiplier: data.streakMultiplier,
          },
        });
    } catch (error: unknown) {
        // Batch write failed — surface as creation failure. Listener or
        // post-creation errors must NOT surface as "Creation Failed" (they are
        // separate streaming errors that do not mean the arena wasn't created).
        toast({ variant: 'destructive', title: 'Creation Failed', description: error instanceof Error ? error.message : "Unknown error" });
        setIsSubmitting(false);
        submittedRef.current = false;
        return;
    }

    // Batch succeeded — arena is persisted. Show success before any
    // post-creation side-effects so a listener/notify failure never
    // overwrites the success toast with a false "Creation Failed".
    setIsSubmitting(false);
    submittedRef.current = false;
    if (roomCode) {
      toast({ title: 'Arena Created', description: `Room Code: ${roomCode}` });
      // Fan-out notification to all gladiators — best-effort, never blocks navigation.
      // Isolated from creation success: a notify failure must not show as arena error.
      try {
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          fetch('/api/arena/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ roomCode, title: data.title }),
          }).catch(() => {});
        }
      } catch {}
      router.push(`/battle/${roomCode}`);
    }
  };

  const hasDuplicateOptions = (q: { options: string[] }) => {
    const seen = new Set<string>();
    for (const opt of q.options) {
      const trimmed = opt.trim().toLowerCase();
      if (trimmed && seen.has(trimmed)) return true;
      seen.add(trimmed);
    }
    return false;
  };

  const addOption = (qIdx: number) => {
    const opts = form.getValues(`questions.${qIdx}.options`);
    if (opts.length < 4) form.setValue(`questions.${qIdx}.options`, [...opts, '']);
  };

  return (<>
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-4xl mx-auto pb-40">
        <Card>
          <CardHeader>
              <CardTitle className="text-xl font-headline text-primary flex items-center gap-2">
                  <PencilRuler className="w-5 h-5" />
                  Arena Details
              </CardTitle>
          </CardHeader>
          <CardContent>
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem>
                <FormLabel>Arena Designation</FormLabel>
                <FormControl><Input placeholder="e.g., Quantum Mechanics Masterclass" className="h-12 text-lg" {...field} /></FormControl>
                <FormDescription>This name will be displayed to all gladiators entering the room.</FormDescription>
                <FormMessage />
              </FormItem>
            )} />
          </CardContent>
        </Card>

        {/* AI Copilot — sidebar assistant for commanders */}
        <AICopilot
          titleContext={form.watch('title') || undefined}
          questionContext={fields.length > 0 ? form.watch(`questions.0.text`) || undefined : undefined}
          onApplyQuestion={(q) => {
            append({ id: uuidv4(), text: q.text, options: q.options, correctAnswerIndex: q.correctAnswerIndex, timer: 30, explanation: q.explanation });
            toast({ title: 'Question added from Copilot', description: q.text.slice(0, 60) });
          }}
        />

        {/* Advanced Scoring — Phase 99, shared with AI Forge (Phase 106 D) */}
        <AdvancedScoringSection
          value={{
            timeBonus: form.watch('timeBonus'),
            streakMultiplier: form.watch('streakMultiplier'),
            scoreMax: form.watch('scoreMax'),
            scoreMin: form.watch('scoreMin'),
          }}
          onChange={(v) => {
            form.setValue('timeBonus', v.timeBonus);
            form.setValue('streakMultiplier', v.streakMultiplier);
            form.setValue('scoreMax', v.scoreMax);
            form.setValue('scoreMin', v.scoreMin);
          }}
        />

        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-2xl font-headline uppercase tracking-tight text-primary/80">Questions</h3>
                <span className="text-xs font-mono bg-primary/10 text-primary px-3 py-1 rounded-full">{fields.length} TOTAL</span>
            </div>

            {fields.map((field, index) => (
            <Card key={field.id} className="relative pt-12 overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/15 group-hover:bg-primary/30 transition-colors" />
                <div className="absolute top-3 left-4 flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest bg-primary/10 text-primary px-3 py-1 rounded-full">QUESTION {index + 1}</span>
                    {field.explanation && (
                        <div className="flex items-center gap-1 text-[9px] text-primary bg-primary/5 px-2 py-1 rounded-full border border-primary/20">
                            <Sparkles className="w-2 h-2" /> AI GENERATED
                        </div>
                    )}
                </div>
                
                <Button type="button" variant="ghost" size="icon" onClick={() => fields.length > 1 && setDeleteConfirmIdx(index)} className="absolute top-3 right-3 text-muted-foreground hover:text-destructive hover:bg-destructive/5" disabled={fields.length <= 1} aria-label={`Delete question ${index + 1}`}><Trash2 className="h-4 w-4" /></Button>
                
                <CardContent className="space-y-6">
                <FormField control={form.control} name={`questions.${index}.text`} render={({ field }) => (
                    <FormItem>
                    <FormLabel>Question Text</FormLabel>
                    <FormControl><Textarea placeholder="Formulate the challenge..." className="min-h-[100px] text-lg leading-relaxed" {...field} /></FormControl>
                    <FormMessage />
                    </FormItem>
                )} />

                <div className="space-y-3">
                    <FormLabel>Multiple Choice Options</FormLabel>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {form.watch(`questions.${index}.options`).map((_, optIdx) => (
                        <FormField key={`${field.id}-opt-${optIdx}`} control={form.control} name={`questions.${index}.options.${optIdx}`} render={({ field }) => (
                        <FormItem className="relative">
                            <div className="flex items-center gap-2">
                                <span className={cn(
                                    "flex items-center justify-center w-8 h-8 rounded-lg font-mono text-sm border",
                                    form.watch(`questions.${index}.correctAnswerIndex`) === optIdx 
                                        ? "bg-primary text-primary-foreground border-primary" 
                                        : "bg-secondary border-border"
                                )}>
                                    {String.fromCharCode(65 + optIdx)}
                                </span>
                                <FormControl><Input placeholder={`Option ${String.fromCharCode(65 + optIdx)}`} className="h-10" {...field} /></FormControl>
                            </div>
                            {form.getValues(`questions.${index}.options`).length > 2 && (
                            <button type="button" onClick={() => {
                                const current = form.getValues(`questions.${index}.options`);
                                if (current.length > 2) {
                                    form.setValue(`questions.${index}.options`, current.filter((_, i) => i !== optIdx));
                                    const currentCorrect = form.getValues(`questions.${index}.correctAnswerIndex`);
                                    if (currentCorrect === optIdx) form.setValue(`questions.${index}.correctAnswerIndex`, -1);
                                    else if (currentCorrect > optIdx) form.setValue(`questions.${index}.correctAnswerIndex`, currentCorrect - 1);
                                }
                            }} className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                            )}
                            <FormMessage />
                        </FormItem>
                        )} />
                    ))}
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => addOption(index)} disabled={form.watch(`questions.${index}.options`).length >= 4} className="mt-2"><PlusCircle className="mr-2 h-4 w-4" /> Add Option</Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-secondary/20 rounded-lg border border-border/20">
                    <FormField control={form.control} name={`questions.${index}.correctAnswerIndex`} render={({ field }) => (
                    <FormItem>
                        <FormLabel>Correct Answer</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value > -1 ? String(field.value) : undefined}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Identify the solution" /></SelectTrigger></FormControl>
                        <SelectContent>
                            {form.watch(`questions.${index}.options`).map((opt, oI) => (
                            <SelectItem key={oI} value={String(oI)} disabled={!opt}>
                                {`Option ${String.fromCharCode(65 + oI)}: ${opt.substring(0, 40)}${opt.length > 40 ? '...' : ''}`}
                            </SelectItem>
                            ))}
                        </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                    )} />
                    <FormField control={form.control} name={`questions.${index}.timer`} render={({ field }) => (
                    <FormItem>
                        <FormLabel>Timer (Seconds)</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                    )} />
                </div>

                {form.watch(`questions.${index}.explanation`) && (
                    <div className="flex gap-3 p-4 bg-primary/5 rounded-lg border border-primary/10">
                        <Info className="w-5 h-5 text-primary shrink-0" />
                        <div className="space-y-1">
                            <p className="text-xs font-black uppercase text-primary/70 tracking-widest">AI Note:</p>
                            <p className="text-sm text-muted-foreground italic leading-relaxed">{form.watch(`questions.${index}.explanation`)}</p>
                        </div>
                    </div>
                )}
                </CardContent>
            </Card>
            ))}
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] w-full max-w-4xl mx-auto flex flex-col md:flex-row gap-4 z-50 bg-background/80 backdrop-blur-xl border-t border-border/20 md:bg-transparent md:backdrop-blur-none md:border-t-0 md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:p-0 md:pb-0">
            <Button 
                type="button" 
                variant="secondary" 
                onClick={() => append({ id: uuidv4(), text: '', options: ['', ''], correctAnswerIndex: -1, timer: 30 })} 
                className="w-full md:w-auto h-14 px-8"
            >
                <PlusCircle className="mr-2 h-4 w-4" /> 
                Add Question
            </Button>
            <Button 
                type="submit" 
                className="w-full md:flex-1 h-14 text-xl font-headline" 
                disabled={isSubmitting}
            >
                {isSubmitting ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : 'CREATE ARENA'}
            </Button>
        </div>
      </form>
    </Form>

    <AlertDialog open={deleteConfirmIdx !== null} onOpenChange={() => setDeleteConfirmIdx(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Question?</AlertDialogTitle>
          <AlertDialogDescription>
            This question will be permanently removed. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setDeleteConfirmIdx(null)}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => { if (deleteConfirmIdx !== null) remove(deleteConfirmIdx); setDeleteConfirmIdx(null); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>);
}
