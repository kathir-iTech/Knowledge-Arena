"use client";

import React, { useState, useRef, useEffect, Suspense } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PencilRuler, Sparkles, ChevronLeft, ArrowLeft } from "lucide-react";
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

export default function CreateQuizPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('manual');
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[] | null>(null);
  const [difficulty, setDifficulty] = useState('');
  const [showForgeWithPreserved, setShowForgeWithPreserved] = useState(false);
  const forgeParams = useRef<{ pdfDataUri: string; diff: 'easy' | 'moderate' | 'hard'; count: number } | null>(null);
  const { toast } = useToast();
  const { auth } = useFirebase();
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [backAction, setBackAction] = useState<'review' | 'dashboard' | null>(null);
  const [manualDirty, setManualDirty] = useState(false);
  const [forgeDirty, setForgeDirty] = useState(false);
  const hasUnsavedWork = manualDirty || forgeDirty;
  const dashboardPath = user?.role === 'executive' ? '/executive/dashboard' : '/commander/dashboard';

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedWork && !generatedQuestions) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [generatedQuestions, hasUnsavedWork]);

  const handleBackClick = () => {
    if (generatedQuestions) {
      setBackAction('review');
      setShowBackConfirm(true);
    } else {
      router.push(dashboardPath);
    }
  };

  const handleDashboardBack = () => {
    if (hasUnsavedWork || generatedQuestions) {
      setBackAction('dashboard');
      setShowBackConfirm(true);
      return;
    }
    router.push(dashboardPath);
  };

  const handleQuestionsGenerated = (questions: GeneratedQuestion[], diff: string, dataUri?: string, questionCount?: number) => {
    setGeneratedQuestions(questions);
    setDifficulty(diff);
    setForgeDirty(true);
    setShowForgeWithPreserved(false);
    if (dataUri && questionCount) {
      forgeParams.current = { pdfDataUri: dataUri, diff: diff as 'easy' | 'moderate' | 'hard', count: questionCount };
    }
  };

  const handleRegenerate = () => {
    setGeneratedQuestions(null);
    setShowForgeWithPreserved(false);
    setForgeDirty(false);
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
      if (result.error) {
        throw new Error(result.error);
      }
      if (result.questions && result.questions.length > 0) {
        const updated = [...generatedQuestions];
        updated[index] = result.questions[0];
        setGeneratedQuestions(updated);
        toast({ title: 'Regenerated', description: `Question ${index + 1} has been reforged.` });
      } else {
        throw new Error('AI returned empty result');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      console.error('[Regenerate]', msg, e);
      toast({ variant: 'destructive', title: 'Regeneration Failed', description: msg === 'UNAUTHORIZED' ? 'Session expired. Please reload.' : msg === 'TIMEOUT' ? 'Request timed out. Try again.' : `Server error: ${msg}` });
    }
  };

  const confirmBack = () => {
    const action = backAction;
    setShowBackConfirm(false);
    setBackAction(null);
    if (action === 'review') {
      handleRegenerate();
    } else if (action === 'dashboard') {
      setGeneratedQuestions(null);
      setShowForgeWithPreserved(false);
      setManualDirty(false);
      setForgeDirty(false);
      forgeParams.current = null;
      router.push(dashboardPath);
    }
  };

  const backConfirmDialog = (
    <Dialog open={showBackConfirm} onOpenChange={(open) => { if (!open) { setShowBackConfirm(false); setBackAction(null); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{backAction === 'dashboard' ? 'Leave Arena Architect?' : 'Leave Question Review?'}</DialogTitle>
          <DialogDescription>
            {backAction === 'dashboard'
              ? 'Your unsaved arena work will be lost if you leave this page.'
              : 'Your generated questions and review edits will be discarded.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setShowBackConfirm(false); setBackAction(null); }}>Cancel</Button>
          <Button variant="destructive" onClick={confirmBack}>Discard & Leave</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (generatedQuestions && !showForgeWithPreserved) {
    return (<>
        <header className="page-section flex items-center justify-between">
           <Button variant="ghost" onClick={handleBackClick} className="h-9">
              <ChevronLeft className="mr-2 h-4 w-4" /> Back to Architect
            </Button>
           <h1 className="text-xl font-headline text-primary tracking-tight">Question Review</h1>
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

      {backConfirmDialog}
    </>);
  }

  return (
    <div className="page-container safe-top safe-bottom animate-in">
        <header className="page-section safe-top flex items-start gap-4">
          <Button variant="ghost" onClick={handleDashboardBack} className="h-9 shrink-0 mt-0.5">
            <ArrowLeft className="mr-2 h-4 w-4" /> Dashboard
          </Button>
          <div>
            <h1 className="text-page-title font-headline tracking-tight text-primary">Arena Architect</h1>
            <p className="text-sm text-muted-foreground mt-1">Design a new battleground. Construct challenges manually or forge them from data.</p>
          </div>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="grid w-full grid-cols-2 h-12 bg-secondary/20 p-1 rounded-lg border border-primary/10">
          <TabsTrigger value="manual" className="text-sm font-headline font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md">
            <PencilRuler className="mr-2 h-4 w-4" /> Manual
          </TabsTrigger>
          <TabsTrigger value="forge" className="text-sm font-headline font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md">
            <Sparkles className="mr-2 h-4 w-4" /> AI PDF Forge
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="animate-in">
          <Suspense fallback={<div className="h-96 bg-secondary/10 rounded-xl animate-pulse" />}>
             <QuizCreatorForm onDirtyChange={setManualDirty} />
          </Suspense>
        </TabsContent>

        <TabsContent value="forge" className="animate-in">
          <Suspense fallback={<div className="h-96 bg-secondary/10 rounded-xl animate-pulse" />}>
             <PDFQuizGenerator onQuestionsGenerated={handleQuestionsGenerated} onDirtyChange={setForgeDirty} />
          </Suspense>
        </TabsContent>
       </Tabs>
       {backConfirmDialog}
     </div>
  );
}
