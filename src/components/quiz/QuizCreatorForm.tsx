'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@/hooks/useAuth';
import { useFirestore }from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, PlusCircle, Loader2 } from 'lucide-react';
import type { Quiz, BattleRoom } from '@/lib/types';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';


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
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'You must be a teacher to create a quiz.'
        });
        return;
    }
    setIsSubmitting(true);

    try {
        const quizId = uuidv4();
        const battleRoomId = generateRoomCode();
        
        const newQuiz: Quiz = {
            ...data,
            id: quizId,
            teacherId: user.id
        };

        const newBattleRoom: BattleRoom = {
            id: battleRoomId,
            teacherId: user.id,
            quiz: newQuiz, // Embed the full quiz object
            status: 'waiting',
            currentQuestionIndex: 0,
            createdAt: Date.now(),
            participantCount: 0,
        };

        const roomRef = doc(firestore, 'battleRooms', battleRoomId);
        
        setDocumentNonBlocking(roomRef, newBattleRoom, { merge: false });

        toast({
            title: 'Battle Room Created!',
            description: `Room code: ${battleRoomId}. Redirecting you...`,
        });

        router.push(`/battle/${battleRoomId}`);

    } catch (error: any) {
        console.error('Failed to create battle:', error);
        toast({
            variant: 'destructive',
            title: 'Creation Failed',
            description: 'Could not create the battle room. Please try again.',
        });
        setIsSubmitting(false);
    }
  };
  
  const addOption = (questionIndex: number) => {
    const options = form.getValues(`questions.${questionIndex}.options`);
    if (options.length < 4) {
       form.setValue(`questions.${questionIndex}.options`, [...options, '']);
    }
  };
  
  const removeOption = (questionIndex: number, optionIndex: number) => {
     const options = form.getValues(`questions.${questionIndex}.options`);
     if (options.length > 2) {
       const newOptions = options.filter((_, i) => i !== optionIndex);
       form.setValue(`questions.${questionIndex}.options`, newOptions);
     }
  }


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Quiz Details</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quiz Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., World History Basics" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {fields.map((field, index) => (
          <Card key={field.id} className="relative pt-8 border-primary/20">
             <span className="absolute top-2 left-2 text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-full">
              Question {index + 1}
            </span>
             <Button
                type="button"
                variant="destructive"
                size="icon"
                onClick={() => fields.length > 1 && remove(index)}
                className="absolute top-2 right-2 h-7 w-7"
                disabled={fields.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name={`questions.${index}.text`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Question Text</FormLabel>
                    <FormControl>
                      <Textarea placeholder="What is the capital of France?" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

            <div>
              <FormLabel>Answer Options</FormLabel>
              <div className="space-y-2 mt-2">
                {form.watch(`questions.${index}.options`).map((_, optionIndex) => (
                  <FormField
                    key={`${field.id}-option-${optionIndex}`}
                    control={form.control}
                    name={`questions.${index}.options.${optionIndex}`}
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-2">
                          <FormControl>
                            <Input placeholder={`Option ${optionIndex + 1}`} {...field} />
                          </FormControl>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeOption(index, optionIndex)}
                            disabled={form.getValues(`questions.${index}.options`).length <= 2}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => addOption(index)}
                disabled={form.getValues(`questions.${index}.options`).length >= 4}
              >
                <PlusCircle className="mr-2 h-4 w-4" /> Add Option
              </Button>
            </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name={`questions.${index}.correctAnswerIndex`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Correct Answer</FormLabel>
                       <Select onValueChange={field.onChange} value={field.value > -1 ? String(field.value) : undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select the correct option" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {form.watch(`questions.${index}.options`).map((opt, optIndex) => (
                            <SelectItem key={optIndex} value={String(optIndex)} disabled={!opt}>
                              {`Option ${optIndex + 1}: ${opt.substring(0,50) || '(empty)'}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name={`questions.${index}.timer`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timer (seconds)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={() =>
            append({ id: uuidv4(), text: '', options: ['', ''], correctAnswerIndex: -1, timer: 30 })
          }
        >
          <PlusCircle className="mr-2 h-4 w-4" /> Add Question
        </Button>
        
        <Button type="submit" className="w-full text-lg h-12" disabled={isSubmitting}>
          {isSubmitting ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
             'Create & Launch Battle'
          )}
        </Button>
      </form>
    </Form>
  );
}
