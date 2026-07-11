'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { quizService } from '@/services/quiz.service';
import { questionService } from '@/services/game.service';
import { useAuth } from '@/hooks/useAuth';
import { QuizEditor } from '@/components/quiz/QuizEditor';
import { ShieldX } from 'lucide-react';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Button } from '@/components/ui/button';
import type { ValidatedQuiz } from '@/lib/schemas';
import type { ExistingQuestion, ExistingAnswerKey } from '@/components/quiz/QuizEditor';

export default function EditQuizPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [quiz, setQuiz] = useState<ValidatedQuiz | null>(null);
  const [questions, setQuestions] = useState<ExistingQuestion[]>([]);
  const [answerKeys, setAnswerKeys] = useState<ExistingAnswerKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('This quiz does not exist or you do not have permission to edit it.');

  useEffect(() => {
    if (!quizId || isAuthLoading) return;
    if (!user) { router.push('/'); return; }

    const load = async () => {
      try {
        const q = await quizService.getQuizById(quizId);
        if (q.created_by !== user.id) throw new Error('Not authorized');
        if (q.status !== 'waiting') throw new Error('Can only edit a waiting quiz');
        setQuiz(q);

        const [qs, aks] = await Promise.all([
          questionService.getQuestionsByQuizId(quizId),
          questionService.getAnswerKeys(quizId),
        ]);
        setQuestions(qs);
        setAnswerKeys(aks);
      } catch (e) {
        if (e instanceof Error && e.message === 'Can only edit a waiting quiz') {
          setErrorMsg('This quiz is already live or finished and cannot be edited.');
        }
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [quizId, user, isAuthLoading, router]);

  if (isLoading || isAuthLoading) {
    return <LoadingScreen message="Loading quiz editor..." />;
  }

  if (error || !quiz) {
    return (
      <div className="loading-screen flex-col text-center gap-6">
        <ShieldX className="w-16 h-16 text-destructive crystal-float" />
        <h1 className="text-3xl font-headline text-destructive">Cannot Edit</h1>
        <p className="text-muted-foreground max-w-md">{errorMsg}</p>
        <Button size="lg" onClick={() => router.push('/teacher/dashboard')}>Return to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto safe-bottom">
      <QuizEditor
        quizId={quizId}
        initialTitle={quiz.title}
        initialQuestions={questions}
        initialAnswerKeys={answerKeys}
      />
    </div>
  );
}
