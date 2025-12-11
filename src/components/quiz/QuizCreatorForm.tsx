

"use client";

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { PlusCircle, Trash2, Send } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { doc, collection, writeBatch } from 'firebase/firestore';
import type { Quiz, Room, User, Question } from '@/lib/types';


const questionSchema = z.object({
  id: z.string().default(() => uuidv4()),
  text: z.string().min(5, "Question text must be at least 5 characters."),
  options: z.tuple([
    z.string().min(1, "Option 1 is required."),
    z.string().min(1, "Option 2 is required."),
    z.string().min(1, "Option 3 is required."),
    z.string().min(1, "Option 4 is required."),
  ]),
  correctAnswer: z.coerce.number().min(0).max(3),
  explanation: z.string().min(1, "Explanation is required."),
  timer: z.coerce.number().min(5, "Timer must be at least 5 seconds.").max(120),
});

const quizSchema = z.object({
  topic: z.string().min(3, "Topic must be at least 3 characters."),
  questions: z.array(questionSchema).min(1, "You must add at least one question."),
});

export function QuizCreatorForm() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const firestore = useFirestore();

  const form = useForm<z.infer<typeof quizSchema>>({
    resolver: zodResolver(quizSchema),
    defaultValues: {
      topic: '',
      questions: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "questions",
  });

  const addQuestion = () => {
    append({
      id: uuidv4(),
      text: '',
      options: ['', '', '', ''],
      correctAnswer: 0,
      explanation: '',
      timer: 30,
    });
  };

  const onSubmit = async (values: z.infer<typeof quizSchema>) => {
    if (!user || !firestore) {
        toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to create a quiz.' });
        return;
    }
    
    const batch = writeBatch(firestore);

    // 1. Define the Quiz object
    const quizId = uuidv4();
    const newQuiz: Quiz = {
        id: quizId,
        topic: values.topic,
        teacherId: user.id,
        questions: values.questions,
    };

    // 2. Create the Battle Room document
    const roomCode = uuidv4().slice(0, 6).toUpperCase();
    const roomRef = doc(firestore, 'battleRooms', roomCode);
    
    const creatorAsParticipant: User = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: 'Teacher',
      xp: user.xp,
    }

    const newRoom: Omit<Room, 'id'> = {
      quiz: newQuiz, // Embed the full quiz object
      teacherId: user.id,
      participants: [creatorAsParticipant],
      studentIds: [user.id], // Add teacher to studentIds to grant access
      status: 'waiting',
      scores: {},
      currentQuestionIndex: 0,
      startTime: 0,
      battleResultIds: [],
    };
    batch.set(roomRef, newRoom);
    
    await batch.commit();
    
    toast({
        title: "Battle Room Created!",
        description: `Your room code is ${roomCode}. Redirecting you to the waiting room...`
    })

    router.push(`/battle/${roomCode}`);
  };

  return (
    <Card className="border-accent/50 shadow-lg shadow-accent/10">
      <CardHeader>
        <CardTitle className="font-headline">Quiz Details</CardTitle>
        <CardDescription>Define the topic and questions for your battle.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="topic"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-lg">Quiz Topic</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 'Cybersecurity Basics'" {...field} className="text-base" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <Separator />
            
            {fields.map((field, index) => (
              <Card key={field.id} className="p-4 bg-secondary border-border relative">
                <CardHeader className="p-2">
                  <CardTitle className="text-xl font-headline">Question {index + 1}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 p-2">
                   <FormField
                    control={form.control}
                    name={`questions.${index}.text`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Question</FormLabel>
                        <FormControl>
                          <Textarea placeholder="What is a firewall?" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name={`questions.${index}.correctAnswer`}
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Options (select the correct one)</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={(value) => field.onChange(parseInt(value))}
                            value={field.value.toString()}
                            className="space-y-2"
                          >
                            {[0, 1, 2, 3].map((optionIndex) => (
                              <FormField
                                key={optionIndex}
                                control={form.control}
                                name={`questions.${index}.options.${optionIndex}` as const}
                                render={({ field: optionField }) => (
                                    <FormItem className="flex items-center space-x-3 space-y-0">
                                      <FormControl>
                                        <RadioGroupItem value={optionIndex.toString()} />
                                      </FormControl>
                                      <Input placeholder={`Option ${optionIndex + 1}`} {...optionField} />
                                    </FormItem>
                                )}
                              />
                            ))}
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`questions.${index}.explanation`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Explanation</FormLabel>
                        <FormControl>
                           <Textarea placeholder="Explain why the correct answer is right." {...field} />
                        </FormControl>
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
                </CardContent>
                <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    onClick={() => remove(index)}
                    className="absolute top-4 right-4"
                  >
                    <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            ))}

            <div className="flex justify-between items-center">
                <Button type="button" variant="outline" onClick={addQuestion}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Question
                </Button>
                <Button type="submit" size="lg" className="bg-accent hover:bg-accent/90">
                    <Send className="mr-2 h-4 w-4" />
                    Launch Battle
                </Button>
            </div>
            {form.formState.errors.questions && (
                 <p className="text-sm font-medium text-destructive">
                    {form.formState.errors.questions.message || form.formState.errors.questions.root?.message}
                 </p>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
