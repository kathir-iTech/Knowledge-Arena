
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@/hooks/useAuth';
import { useFirestore } from '@/firebase';
import { doc, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, PlusCircle, Loader2 } from 'lucide-react';
import type { Quiz, QuizQuestion } from '@/lib/types';

const questionSchema = z.object({
  id: z.string(),
  text: z.string().min(5, 'Question text must be at least 5 characters long.'),
  options: z.array(z.string().min(1, 'Option text cannot be empty.')).min(2, 'Must have at least 2 options.').max(4, 'You can have at most 4 options.'),
  correctAnswerIndex: z.coerce.number().min(0, 'You must select a correct answer.'),
  timer: z.coerce.number().min(5, 'Timer must be at least 5 seconds.').max(120, 'Timer cannot exceed 120 seconds.'),
});

const quizSchema = z.object({
  title: z.string().min(3, 'Quiz title must be at least 3 characters long.'),
  questions: z.array(questionSchema).min(1, 'A quiz must have at least one question.'),
});

type QuizFormData = z.infer<typeof quizSchema>;

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function QuizCreatorForm() {
  const router = useRouter();
  const { user } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<QuizFormData>({
    resolver: zodResolver(quizSchema),
    defaultValues: {
      title: '',
      questions: [
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-4xl mx-auto">
        <Card className="border-primary/20 bg-secondary/10">
          <CardHeader><CardTitle>General Intel</CardTitle></CardHeader>
          <CardContent>
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem>
                <FormLabel>Arena Name</FormLabel>
                <FormControl><Input placeholder="e.g., Cyber Security 101" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </CardContent>
        </Card>

        {fields.map((field, index) => (
          <Card key={field.id} className="relative pt-10 border-accent/20">
             <span className="absolute top-3 left-3 text-[10px] font-black uppercase tracking-widest bg-primary/20 text-primary px-3 py-1 rounded-full">Question {index + 1}</span>
             <Button type="button" variant="ghost" size="icon" onClick={() => fields.length > 1 && remove(index)} className="absolute top-3 right-3 text-destructive hover:bg-destructive/10" disabled={fields.length <= 1}><Trash2 className="h-4 w-4" /></Button>
            <CardContent className="space-y-6">
              <FormField control={form.control} name={`questions.${index}.text`} render={({ field }) => (
                <FormItem>
                  <FormLabel>The Challenge</FormLabel>
                  <FormControl><Textarea placeholder="Type the question here..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="space-y-3">
                <FormLabel>Options (Minimum 2)</FormLabel>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {form.watch(`questions.${index}.options`).map((_, optIdx) => (
                    <FormField key={`${field.id}-opt-${optIdx}`} control={form.control} name={`questions.${index}.options.${optIdx}`} render={({ field }) => (
                      <FormItem className="relative">
                        <FormControl><Input placeholder={`Option ${String.fromCharCode(65 + optIdx)}`} {...field} /></FormControl>
                        {form.getValues(`questions.${index}.options`).length > 2 && (
                          <button type="button" onClick={() => {
                            const current = form.getValues(`questions.${index}.options`);
                            form.setValue(`questions.${index}.options`, current.filter((_, i) => i !== optIdx));
                          }} className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                        )}
                        <FormMessage />
                      </FormItem>
                    )} />
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => addOption(index)} disabled={form.watch(`questions.${index}.options`).length >= 4}><PlusCircle className="mr-2 h-4 w-4" /> Add Slot</Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name={`questions.${index}.correctAnswerIndex`} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Correct Outcome</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value > -1 ? String(field.value) : undefined}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Identify the solution" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {form.watch(`questions.${index}.options`).map((opt, oI) => (
                          <SelectItem key={oI} value={String(oI)} disabled={!opt}>{`Option ${String.fromCharCode(65 + oI)}: ${opt.substring(0, 30)}...`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                 <FormField control={form.control} name={`questions.${index}.timer`} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Combat Timer (Seconds)</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>
        ))}

        <div className="flex flex-col md:flex-row gap-4">
            <Button type="button" variant="secondary" onClick={() => append({ id: uuidv4(), text: '', options: ['', ''], correctAnswerIndex: -1, timer: 30 })} className="w-full md:w-auto h-14 px-8"><PlusCircle className="mr-2 h-5 w-5" /> Add Question</Button>
            <Button type="submit" className="w-full md:flex-1 h-14 text-xl font-headline" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin mr-2" /> : 'DEPLOY ARENA'}</Button>
        </div>
      </form>
    </Form>
  );
}
