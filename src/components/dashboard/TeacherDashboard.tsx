"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, BarChart, Users, History } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Quiz } from '@/lib/types';
import { Skeleton } from '../ui/skeleton';

const TeacherDashboard = () => {
  const { user } = useAuth();
  const firestore = useFirestore();

  const quizzesRef = useMemoFirebase(
    () => (user && firestore ? query(collection(firestore, `users/${user.id}/quizzes`)) : null),
    [user, firestore]
  );
  const { data: quizzes, isLoading: isLoadingQuizzes } = useCollection<Quiz>(quizzesRef);

  return (
    <div className="p-4 md:p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-headline tracking-tight">Welcome, Gladiator <span className="text-primary">{user?.name}</span></h1>
        <p className="text-muted-foreground">Ready to forge the next challenge for your students?</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-primary/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total XP</CardTitle>
            <BarChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{user?.xp || 0}</div>
            <p className="text-xs text-muted-foreground">Your experience points</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quizzes Created</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingQuizzes ? <Skeleton className="h-8 w-1/4 mt-1" /> : <div className="text-2xl font-bold">{quizzes?.length || 0}</div> }
            <p className="text-xs text-muted-foreground">Number of quizzes you have created</p>
          </CardContent>
        </Card>
      </div>

       <Card className="bg-gradient-to-br from-secondary to-background border-accent">
        <CardHeader>
          <CardTitle className="font-headline text-2xl">Create a New Battle</CardTitle>
          <CardDescription>Design a new quiz and generate a battle room for your students to join.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/create-quiz" passHref>
            <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground">
              <PlusCircle className="mr-2 h-5 w-5" />
              Create New Quiz
            </Button>
          </Link>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
            <CardTitle className="font-headline text-2xl flex items-center gap-2"><History /> Past Quizzes</CardTitle>
            <CardDescription>Review the quizzes you've created.</CardDescription>
        </CardHeader>
        <CardContent>
            {isLoadingQuizzes && (
                <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            )}
            {quizzes && quizzes.length > 0 ? (
                <ul className="space-y-2">
                    {quizzes.map(quiz => (
                        <li key={quiz.id} className="flex items-center justify-between p-3 bg-secondary rounded-md">
                           <span className="font-medium">{quiz.topic}</span>
                           <span className="text-sm text-muted-foreground">{quiz.questions.length} questions</span>
                        </li>
                    ))}
                </ul>
            ) : (
                !isLoadingQuizzes && <p className="text-muted-foreground text-center">You haven't created any quizzes yet.</p>
            )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeacherDashboard;
