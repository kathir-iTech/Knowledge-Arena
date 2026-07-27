'use client';

import React, { useState, useRef, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';

const PDFQuizGenerator = dynamic(() => import('@/components/quiz/PDFQuizGenerator').then(m => m.PDFQuizGenerator), { ssr: false });
const ExecutiveQuestionReviewPanel = dynamic(() => import('@/components/quiz/ExecutiveQuestionReviewPanel').then(m => m.ExecutiveQuestionReviewPanel), { ssr: false });

interface GeneratedQuestion {
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export default function QuestionBankPage() {
  const { auth } = useFirebase();
  const { toast } = useToast();
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[] | null>(null);
  const [forgeDifficulty, setForgeDifficulty] = useState('');
  const [showForgeWithPreserved, setShowForgeWithPreserved] = useState(false);
  const forgeParams = useRef<{ pdfDataUri: string; diff: 'easy' | 'moderate' | 'hard'; count: number } | null>(null);

  const handleQuestionsGenerated = (qList: GeneratedQuestion[], diff: string, dataUri?: string, questionCount?: number) => {
    setGeneratedQuestions(qList);
    setForgeDifficulty(diff);
    setShowForgeWithPreserved(false);
    if (dataUri && questionCount) {
      forgeParams.current = { pdfDataUri: dataUri, diff: diff as 'easy' | 'moderate' | 'hard', count: questionCount };
    }
  };

  const handleRegenerate = () => {
    setGeneratedQuestions(null);
    setShowForgeWithPreserved(false);
    forgeParams.current = null;
  };

  const handleEditSettings = () => {
    setShowForgeWithPreserved(true);
  };

  const handleRegenerateQuestion = async (index: number) => {
    if (!forgeParams.current || !generatedQuestions) return;
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!idToken) throw new Error('UNAUTHORIZED');
      const { generateQuizFromPDF } = await import('@/ai/flows/generate-quiz-pdf-flow');
      const result = await Promise.race([
        generateQuizFromPDF({
          pdfDataUri: forgeParams.current.pdfDataUri,
          difficulty: forgeParams.current.diff,
          questionCount: 1,
          idToken,
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 120000)),
      ]);
      if (result.error) throw new Error(result.error);
      if (result.questions && result.questions.length > 0) {
        const q = result.questions[0];
        if (!q.text || q.text.trim().length < 5) throw new Error('Generated question text is too short');
        if (!q.options || q.options.length < 2) throw new Error('Generated question has too few options');
        if (q.correctAnswerIndex < 0 || q.correctAnswerIndex >= q.options.length) throw new Error('Generated question has invalid correct answer');
        if (new Set(q.options.map(o => o.trim().toLowerCase())).size !== q.options.length) throw new Error('Generated question has duplicate options');
        const updated = [...generatedQuestions];
        updated[index] = q;
        setGeneratedQuestions(updated);
        toast({ title: 'Regenerated', description: `Question ${index + 1} has been reforged.` });
      } else {
        throw new Error('AI returned empty result');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      toast({ variant: 'destructive', title: 'Regeneration Failed', description: msg });
    }
  };

  const handleImportComplete = () => {
    setGeneratedQuestions(null);
    setShowForgeWithPreserved(false);
    forgeParams.current = null;
  };

  return (
    <div className="page-container safe-top safe-bottom animate-in">
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-1.5">
          <h1 className="text-page-title font-headline tracking-tight text-primary">
            <Sparkles className="inline-block w-6 h-6 mr-2 text-amber-500" />
            AI PDF Forge
          </h1>
          <p className="text-base text-muted-foreground">Generate quiz questions from PDF documents using AI.</p>
        </div>
      </div>

      {generatedQuestions && !showForgeWithPreserved ? (
        <div className="space-y-4">
          <Button variant="ghost" onClick={handleRegenerate} className="h-9 mb-2">
            <ChevronLeft className="mr-2 h-4 w-4" /> Back to PDF Upload
          </Button>
          <Suspense fallback={<div className="h-96 bg-secondary/10 rounded-xl animate-pulse" />}>
            <ExecutiveQuestionReviewPanel
              initialQuestions={generatedQuestions}
              difficulty={forgeDifficulty}
              onRegenerate={handleRegenerate}
              onEditSettings={handleEditSettings}
              onRegenerateQuestion={forgeParams.current ? handleRegenerateQuestion : undefined}
              onImportComplete={handleImportComplete}
            />
          </Suspense>
        </div>
      ) : (
        <Suspense fallback={<div className="h-96 bg-secondary/10 rounded-xl animate-pulse" />}>
          <PDFQuizGenerator onQuestionsGenerated={handleQuestionsGenerated} />
        </Suspense>
      )}
    </div>
  );
}
