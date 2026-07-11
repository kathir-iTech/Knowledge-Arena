"use client";

import React, { useState, useRef, Suspense } from 'react';
import dynamic from 'next/dynamic';

const QuizCreatorForm = dynamic(() => import('@/components/quiz/QuizCreatorForm').then(m => m.QuizCreatorForm), { ssr: false });
const PDFQuizGenerator = dynamic(() => import('@/components/quiz/PDFQuizGenerator').then(m => m.PDFQuizGenerator), { ssr: false });
const QuestionReviewPanel = dynamic(() => import('@/components/quiz/QuestionReviewPanel').then(m => m.QuestionReviewPanel), { ssr: false });

interface GeneratedQuestion {
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}
import type { GenerateQuizFromPDFOutput } from '@/ai/flows/generate-quiz-pdf-flow';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PencilRuler, Sparkles, ChevronLeft } from "lucide-react";
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';

export default function CreateQuizPage() {
  const [activeTab, setActiveTab] = useState('manual');
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[] | null>(null);
  const [difficulty, setDifficulty] = useState('');
  const [showForgeWithPreserved, setShowForgeWithPreserved] = useState(false);
  const forgeParams = useRef<{ pdfDataUri: string; diff: 'easy' | 'moderate' | 'hard'; count: number } | null>(null);
  const { toast } = useToast();
  const { auth } = useFirebase();

  const handleQuestionsGenerated = (questions: GeneratedQuestion[], diff: string, dataUri?: string, questionCount?: number) => {
    setGeneratedQuestions(questions);
    setDifficulty(diff);
    setShowForgeWithPreserved(false);
    if (dataUri && questionCount) {
      forgeParams.current = { pdfDataUri: dataUri, diff: diff as 'easy' | 'moderate' | 'hard', count: questionCount };
    }
  };

  const handleRegenerate = () => {
    setGeneratedQuestions(null);
    setShowForgeWithPreserved(false);
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
      const result = await generateQuizFromPDF({
        pdfDataUri: forgeParams.current.pdfDataUri,
        difficulty: forgeParams.current.diff,
        questionCount: 1,
        idToken,
      });
      if (result.questions && result.questions.length > 0) {
        const updated = [...generatedQuestions];
        updated[index] = result.questions[0];
        setGeneratedQuestions(updated);
        toast({ title: 'Regenerated', description: `Question ${index + 1} has been reforged.` });
      } else {
        throw new Error('AI returned empty result');
      }
    } catch {
      toast({ variant: 'destructive', title: 'Regeneration Failed', description: 'Could not regenerate question. Please try editing manually.' });
    }
  };

  if (generatedQuestions && !showForgeWithPreserved) {
    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto min-h-screen safe-bottom">
        <header className="mb-8 flex items-center justify-between">
           <Button variant="ghost" onClick={handleRegenerate}>
             <ChevronLeft className="mr-2 h-4 w-4" /> Back to Architect
           </Button>
           <h1 className="text-2xl font-headline text-primary uppercase">Intelligence Review</h1>
        </header>
        <Suspense fallback={<div className="h-96 bg-secondary/10 rounded-xl animate-pulse" />}>
          <QuestionReviewPanel 
              initialQuestions={generatedQuestions} 
              difficulty={difficulty}
              onRegenerate={handleRegenerate}
              onEditSettings={handleEditSettings}
              onRegenerateQuestion={forgeParams.current ? handleRegenerateQuestion : undefined}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto min-h-screen safe-bottom">
      <header className="mb-12">
        <h1 className="text-5xl font-headline tracking-tighter text-primary uppercase">Arena Architect</h1>
        <p className="text-muted-foreground text-lg">Design a new battleground. Construct challenges manually or forge them from data.</p>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-8">
        <TabsList className="grid w-full grid-cols-2 h-16 bg-secondary/20 p-1 border border-primary/10">
          <TabsTrigger value="manual" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-lg font-headline uppercase">
            <PencilRuler className="mr-2 h-5 w-5" /> Manual Construct
          </TabsTrigger>
          <TabsTrigger value="forge" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-lg font-headline uppercase">
            <Sparkles className="mr-2 h-5 w-5" /> AI PDF Forge
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <Suspense fallback={<div className="h-96 bg-secondary/10 rounded-xl animate-pulse" />}>
            <QuizCreatorForm />
          </Suspense>
        </TabsContent>

        <TabsContent value="forge" className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <Suspense fallback={<div className="h-96 bg-secondary/10 rounded-xl animate-pulse" />}>
            <PDFQuizGenerator onQuestionsGenerated={handleQuestionsGenerated} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}