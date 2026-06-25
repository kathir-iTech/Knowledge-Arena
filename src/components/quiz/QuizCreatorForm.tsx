'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@/hooks/useAuth';
import { useFirestore } from '@/firebase';
import { doc, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, PlusCircle, Loader2, Sparkles, Info, PencilRuler } from 'lucide-react';
import type { Quiz, QuizQuestion } from '@/lib/types';

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
});

type QuizFormData = z.infer<typeof quizSchema>;

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

interface QuizCreatorFormProps {
  initialQuestions?: any[];
}

export function QuizCreatorForm({ initialQuestions }: QuizCreatorFormProps) {
  const router = useRouter();
  const { user } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    },
  });

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
        }))
      });
    }
  }, [initialQuestions, form]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'questions',
  });

  const onSubmit = async (data: QuizFormData) => {
    if (!firestore || !user || user.role !== 'Teacher') {
        toast({ variant: 'destructive', title: 'Error', description: 'Unauthorized.' });
        return;
    }
    setIsSubmitting(true);

    try {
        const quizId = generateRoomCode();
        const batch = writeBatch(firestore);

        const quizRef = doc(firestore, 'quizzes', quizId);
        const newQuiz: Omit<Quiz, 'id'> = {
            title: data.title,
            status: 'waiting',
            currentQuestionIndex: -1, 
            questionCount: data.questions.length,
            createdBy: user.id,
            createdAt: Date.now(),
        };
        batch.set(quizRef, newQuiz);
        
        const teacherParticipantRef = doc(firestore, 'quizzes', quizId, 'participants', user.id);
        batch.set(teacherParticipantRef, {
            name: user.name,
            avatar: user.avatar,
            role: 'teacher',
            score: 0,
            status: 'playing',
            violationsCount: 0,
        });

        data.questions.forEach((q, index) => {
            const questionRef = doc(firestore, 'quizzes', quizId, 'questions', q.id);
            const questionData: Omit<QuizQuestion, 'id'> = {
                text: q.text,
                options: q.options,
                timer: q.timer,
                index: index,
            };
            batch.set(questionRef, questionData);

            const answerKeyRef = doc(firestore, 'quizzes', quizId, 'answerKeys', q.id);
            batch.set(answerKeyRef, { correctOptionIndex: q.correctAnswerIndex });
        });

        await batch.commit();
        toast({ title: 'Arena Created', description: `Room Code: ${quizId}` });
        router.push(`/battle/${quizId}`);
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Creation Failed', description: error.message });
        setIsSubmitting(false);
    }
  };

  const addOption = (qIdx: number) => {
    const opts = form.getValues(`questions.${qIdx}.options`);
    if (opts.length < 4) form.setValue(`questions.${qIdx}.options`, [...opts, '']);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-4xl mx-auto pb-20">
        <Card className="border-primary/20 bg-secondary/10 shadow-lg">
          <CardHeader>
              <CardTitle className="text-xl font-headline text-primary flex items-center gap-2">
                  <PencilRuler className="w-5 h-5" />
                  Mission Profile
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

        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-2xl font-headline uppercase tracking-tight text-primary/80">Combat Rounds</h3>
                <span className="text-xs font-mono bg-primary/20 text-primary px-3 py-1 rounded-full">{fields.length} TOTAL</span>
            </div>

            {fields.map((field, index) => (
            <Card key={field.id} className="relative pt-12 border-border/50 group bg-background/40 backdrop-blur-sm overflow-hidden transition-all hover:border-primary/30">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover:bg-primary/50 transition-colors" />
                <div className="absolute top-3 left-4 flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest bg-primary/20 text-primary px-3 py-1 rounded-full">ROUND {index + 1}</span>
                    {field.explanation && (
                        <div className="flex items-center gap-1 text-[9px] text-primary bg-primary/5 px-2 py-1 rounded-full border border-primary/20">
                            <Sparkles className="w-2 h-2" /> AI GENERATED
                        </div>
                    )}
                </div>
                
                <Button type="button" variant="ghost" size="icon" onClick={() => fields.length > 1 && remove(index)} className="absolute top-3 right-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10" disabled={fields.length <= 1}><Trash2 className="h-4 w-4" /></Button>
                
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
                            }} className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 v-3" /></button>
                            )}
                            <FormMessage />
                        </FormItem>
                        )} />
                    ))}
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => addOption(index)} disabled={form.watch(`questions.${index}.options`).length >= 4} className="mt-2"><PlusCircle className="mr-2 h-4 w-4" /> Add Option</Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-secondary/20 rounded-xl border border-border/30">
                    <FormField control={form.control} name={`questions.${index}.correctAnswerIndex`} render={({ field }) => (
                    <FormItem>
                        <FormLabel>Correct Answer</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value > -1 ? String(field.value) : undefined}>
                        <FormControl><SelectTrigger className="bg-background"><SelectValue placeholder="Identify the solution" /></SelectTrigger></FormControl>
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
                        <FormLabel>Combat Timer (Seconds)</FormLabel>
                        <FormControl><Input type="number" className="bg-background" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                    )} />
                </div>

                {form.watch(`questions.${index}.explanation`) && (
                    <div className="flex gap-3 p-4 bg-primary/5 rounded-xl border border-primary/10">
                        <Info className="w-5 h-5 text-primary shrink-0" />
                        <div className="space-y-1">
                            <p className="text-xs font-black uppercase text-primary/70 tracking-widest">AI Intelligence Note:</p>
                            <p className="text-sm text-muted-foreground italic leading-relaxed">{form.watch(`questions.${index}.explanation`)}</p>
                        </div>
                    </div>
                )}
                </CardContent>
            </Card>
            ))}
        </div>

        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-4xl px-4 flex flex-col md:flex-row gap-4 z-50">
            <Button 
                type="button" 
                variant="secondary" 
                onClick={() => append({ id: uuidv4(), text: '', options: ['', ''], correctAnswerIndex: -1, timer: 30 })} 
                className="w-full md:w-auto h-16 px-8 shadow-2xl backdrop-blur-md"
            >
                <PlusCircle className="mr-2 h-6 w-6" /> 
                Add Round
            </Button>
            <Button 
                type="submit" 
                className="w-full md:flex-1 h-16 text-2xl font-headline shadow-2xl shadow-primary/30" 
                disabled={isSubmitting}
            >
                {isSubmitting ? <Loader2 className="animate-spin mr-2 h-6 w-6" /> : 'DEPLOY ARENA'}
            </Button>
        </div>
      </form>
    </Form>
  );
}
