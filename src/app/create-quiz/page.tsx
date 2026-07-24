"use client";

import React, { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';

const QuizCreatorForm = dynamic(() => import('@/components/quiz/QuizCreatorForm').then(m => m.QuizCreatorForm), { ssr: false });
const PDFQuizGenerator = dynamic(() => import('@/components/quiz/PDFQuizGenerator').then(m => m.PDFQuizGenerator), { ssr: false });
const QuestionBankPicker = dynamic(() => import('@/components/quiz/QuestionBankPicker').then(m => m.QuestionBankPicker), { ssr: false });
const QuestionReviewPanel = dynamic(() => import('@/components/quiz/QuestionReviewPanel').then(m => m.QuestionReviewPanel), { ssr: false });
const ArenaTemplateSelector = dynamic(() => import('@/components/question-sets/ArenaTemplateSelector').then(m => m.ArenaTemplateSelector), { ssr: false });

interface GeneratedQuestion {
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PencilRuler, Sparkles, BookOpen, Layers, ChevronLeft, ArrowLeft } from "lucide-react";
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
  const [showDraftRestore, setShowDraftRestore] = useState(false);
  const hasUnsavedWork = manualDirty || forgeDirty;
  const dashboardPath = user?.role === 'executive' ? '/executive/dashboard' : '/commander/dashboard';

  const draftKey = user?.id ? `ka_draft_${user.id}` : null;

  useEffect(() => {
    if (!draftKey || generatedQuestions) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.generatedQuestions && Array.isArray(draft.generatedQuestions) && draft.generatedQuestions.length > 0) {
        setShowDraftRestore(true);
      }
    } catch {}
  }, [draftKey, generatedQuestions]);

  const restoreDraft = () => {
    if (!draftKey) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.generatedQuestions) setGeneratedQuestions(draft.generatedQuestions);
      if (draft.difficulty) setDifficulty(draft.difficulty);
      if (draft.activeTab) setActiveTab(draft.activeTab);
      if (draft.forgeParams) forgeParams.current = draft.forgeParams;
      setShowDraftRestore(false);
      toast({ title: 'Draft Restored', description: 'Your previous work has been restored.' });
    } catch {
      clearDraft();
    }
  };

  const clearDraft = () => {
    if (!draftKey) return;
    try { localStorage.removeItem(draftKey); } catch {}
    setShowDraftRestore(false);
  };

  const saveDraft = useCallback(() => {
    if (!draftKey) return;
    if (!generatedQuestions && !hasUnsavedWork) return;
    try {
      const draft: Record<string, unknown> = {
        timestamp: Date.now(),
        activeTab,
      };
      if (generatedQuestions) {
        draft.generatedQuestions = generatedQuestions;
        draft.difficulty = difficulty;
        if (forgeParams.current) draft.forgeParams = forgeParams.current;
      }
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {}
  }, [draftKey, generatedQuestions, difficulty, hasUnsavedWork, activeTab]);

  useEffect(() => {
    if (!generatedQuestions && !hasUnsavedWork) return;
    const timer = setTimeout(saveDraft, 1000);
    return () => clearTimeout(timer);
  }, [generatedQuestions, hasUnsavedWork, saveDraft]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedWork && !generatedQuestions) return;
      saveDraft();
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [generatedQuestions, hasUnsavedWork, saveDraft]);

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
              onArenaCreated={clearDraft}
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
        <TabsList className="grid w-full grid-cols-4 h-12 bg-secondary/20 p-1 rounded-lg border border-primary/10">
          <TabsTrigger value="manual" className="text-sm font-headline font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md">
            <PencilRuler className="mr-2 h-4 w-4" /> Manual
          </TabsTrigger>
          <TabsTrigger value="forge" className="text-sm font-headline font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md">
            <Sparkles className="mr-2 h-4 w-4" /> AI Forge
          </TabsTrigger>
          <TabsTrigger value="bank" className="text-sm font-headline font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md">
            <BookOpen className="mr-2 h-4 w-4" /> Question Bank
          </TabsTrigger>
          <TabsTrigger value="sets" className="text-sm font-headline font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md">
            <Layers className="mr-2 h-4 w-4" /> Question Sets
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

        <TabsContent value="bank" className="animate-in">
          <Suspense fallback={<div className="h-96 bg-secondary/10 rounded-xl animate-pulse" />}>
             <QuestionBankPicker onQuestionsGenerated={handleQuestionsGenerated} onDirtyChange={setForgeDirty} />
          </Suspense>
        </TabsContent>

        <TabsContent value="sets" className="animate-in">
          <Suspense fallback={<div className="h-96 bg-secondary/10 rounded-xl animate-pulse" />}>
             <ArenaTemplateSelector onArenaCreated={clearDraft} />
          </Suspense>
        </TabsContent>
       </Tabs>
       {backConfirmDialog}

      <Dialog open={showDraftRestore} onOpenChange={(open) => { if (!open) { clearDraft(); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Restore Previous Draft?</DialogTitle>
            <DialogDescription>
              You have unsaved questions from a previous session. Would you like to restore them?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={clearDraft}>Discard Draft</Button>
            <Button onClick={restoreDraft}>Restore Draft</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
     </div>
  );
}
