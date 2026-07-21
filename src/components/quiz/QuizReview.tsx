'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { questionService } from '@/services/game.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { LoadingScreen } from '@/components/LoadingScreen';
import { cn } from '@/lib/utils';

interface ReviewQuestion {
  id: string;
  text: string;
  options: string[];
  timer: number;
  sort_index: number;
}

interface ReviewAnswerKey {
  questionId: string;
  correct_option_index: number;
}

interface ReviewSubmission {
  questionId: string;
  selected_option: number;
  submittedAt: number;
}

interface QuizReviewProps {
  quizId: string;
  questionStartAt?: number | null;
}

export function QuizReview({ quizId, questionStartAt }: QuizReviewProps) {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [answerKeys, setAnswerKeys] = useState<ReviewAnswerKey[]>([]);
  const [submissions, setSubmissions] = useState<ReviewSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!quizId || !user) return;
    const load = async () => {
      try {
        const [qs, aks] = await Promise.all([
          questionService.getQuestionsByQuizId(quizId),
          questionService.getAnswerKeys(quizId),
        ]);
        setQuestions(qs);
        setAnswerKeys(aks);

        const { initializeFirebase } = await import('@/firebase');
        const { firestore } = initializeFirebase();
        const { getDoc, doc } = await import('firebase/firestore');

        const subs: ReviewSubmission[] = [];
        for (const q of qs) {
          const subRef = doc(firestore, 'quizzes', quizId, 'questions', q.id, 'submissions', user.id);
          const subSnap = await getDoc(subRef);
          if (subSnap.exists()) {
            const d = subSnap.data();
            subs.push({
              questionId: q.id,
              selected_option: d.selected_option,
              submittedAt: d.submittedAt || 0,
            });
          }
        }
        setSubmissions(subs);
      } catch {
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [quizId, user]);

  if (isLoading) return <LoadingScreen message="Loading review..." />;

  if (error) return <p className="text-center text-destructive py-8">Failed to load review data.</p>;

  const akMap = new Map(answerKeys.map(ak => [ak.questionId, ak.correct_option_index]));
  const subMap = new Map(submissions.map(s => [s.questionId, s]));

  const correctCount = questions.filter(q => {
    const mySub = subMap.get(q.id);
    const correctIdx = akMap.get(q.id);
    return mySub && mySub.selected_option === correctIdx;
  }).length;
  const totalAnswered = submissions.length;
  const totalQuestions = questions.length;

  return (
    <div className="space-y-4 animate-in">
      <h2 className="text-section-title font-headline tracking-tight">Post-Battle Debrief</h2>
      <p className="text-base text-muted-foreground">Review each question and your response.</p>

      <div className="flex flex-wrap gap-3 text-sm">
        <div className="flex items-center gap-1.5 bg-success/5 px-3 py-1.5 rounded-[8px]">
          <CheckCircle2 className="w-3.5 h-3.5 text-success" />
          <span className="font-semibold text-success">{correctCount}</span>
          <span className="text-muted-foreground">correct</span>
        </div>
        <div className="flex items-center gap-1.5 bg-destructive/5 px-3 py-1.5 rounded-[8px]">
          <XCircle className="w-3.5 h-3.5 text-destructive" />
          <span className="font-semibold text-destructive">{totalAnswered - correctCount}</span>
          <span className="text-muted-foreground">incorrect</span>
        </div>
        <div className="flex items-center gap-1.5 bg-muted/50 px-3 py-1.5 rounded-[8px]">
          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-semibold">{totalQuestions - totalAnswered}</span>
          <span className="text-muted-foreground">unanswered</span>
        </div>
      </div>

      {questions.map((q, idx) => {
        const correctIdx = akMap.get(q.id);
        const mySub = subMap.get(q.id);
        const isCorrect = mySub && mySub.selected_option === correctIdx;

        return (
          <Card key={q.id} className={cn(
            "border-l-[3px]",
            mySub ? (isCorrect ? "border-l-success" : "border-l-destructive") : "border-l-muted"
          )}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-mono text-muted-foreground">Q{idx + 1}</span>
                  <Badge variant={mySub ? (isCorrect ? "success" : "destructive") : "outline"} className="h-6">
                    {mySub ? (isCorrect ? 'CORRECT' : 'WRONG') : 'UNANSWERED'}
                  </Badge>
                </div>
              </div>
              <CardTitle className="text-lg font-medium pt-2 leading-relaxed">{q.text}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {q.options.map((opt, optIdx) => {
                const isSelected = mySub?.selected_option === optIdx;
                const isCorrectOpt = optIdx === correctIdx;
                return (
                  <div key={optIdx} className={cn(
                    "flex items-center gap-3 p-3.5 rounded-[12px] border text-sm transition-all",
                    isCorrectOpt && "bg-success/5 border-success/20",
                    isSelected && !isCorrectOpt && "bg-destructive/5 border-destructive/20",
                    !isSelected && !isCorrectOpt && "bg-card border-border/50"
                  )}>
                    <span className="shrink-0 flex items-center justify-center w-5 h-5">
                      {isCorrectOpt ? <CheckCircle2 className="w-4 h-4 text-success" /> :
                       isSelected ? <XCircle className="w-4 h-4 text-destructive" /> :
                       <HelpCircle className="w-4 h-4 text-muted-foreground" />}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground w-5 shrink-0">{String.fromCharCode(65 + optIdx)}</span>
                    <span className="leading-snug">{opt}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
