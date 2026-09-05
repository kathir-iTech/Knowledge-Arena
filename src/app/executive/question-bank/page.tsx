'use client';

import React, { useState, useRef, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Sparkles, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { generateQuizFromPDF, generateQuizFromExtracted } from '@/ai/flows/generate-quiz-pdf-flow';
import type { PreparedDocument } from '@/lib/prepare-documents';

const PDFQuizGenerator = dynamic(() => import('@/components/quiz/PDFQuizGenerator').then(m => m.PDFQuizGenerator), { ssr: false });
const ExecutiveQuestionReviewPanel = dynamic(() => import('@/components/quiz/ExecutiveQuestionReviewPanel').then(m => m.ExecutiveQuestionReviewPanel), { ssr: false });
const QuizLibraryManager = dynamic(() => import('@/components/quiz/QuizLibraryManager').then(m => m.QuizLibraryManager), { ssr: false });

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
  const [forgeCategory, setForgeCategory] = useState('General');
  const [showForgeWithPreserved, setShowForgeWithPreserved] = useState(false);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [documentTitle, setDocumentTitle] = useState<string | null>(null);
  const forgeParams = useRef<{ documents?: PreparedDocument[]; pdfDataUri?: string; diff: 'easy' | 'moderate' | 'hard'; count: number } | null>(null);

  const handleQuestionsGenerated = (qList: GeneratedQuestion[], diff: string, documents?: PreparedDocument[], questionCount?: number, category?: string, docName?: string) => {
    setGeneratedQuestions(qList);
    setForgeDifficulty(diff);
    if (category) setForgeCategory(category);
    setDocumentTitle(docName || null);
    setShowForgeWithPreserved(false);
    if (documents && documents.length > 0 && questionCount) {
      forgeParams.current = { documents, diff: diff as 'easy' | 'moderate' | 'hard', count: questionCount };
    }
  };

  const handleRegenerate = () => {
    setGeneratedQuestions(null);
    setShowForgeWithPreserved(false);
    setDocumentTitle(null);
    forgeParams.current = null;
  };

  const [showEditConfirm, setShowEditConfirm] = useState(false);

  const handleEditSettingsClick = () => {
    setShowEditConfirm(true);
  };

  const confirmEditSettings = () => {
    setShowEditConfirm(false);
    setShowForgeWithPreserved(true);
  };

  const cancelEditSettings = () => {
    setShowEditConfirm(false);
  };

  const editConfirmDialog = (
    <Dialog open={showEditConfirm} onOpenChange={(open) => { if (!open) { setShowEditConfirm(false); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Parameters</DialogTitle>
          <DialogDescription>
            Changing parameters will discard your current {generatedQuestions ? generatedQuestions.length : 0} questions. Continue?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={cancelEditSettings}>Cancel</Button>
          <Button variant="destructive" onClick={confirmEditSettings}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const handleRegenerateQuestion = async (index: number) => {
    if (!forgeParams.current || !generatedQuestions) return;
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!idToken) throw new Error('UNAUTHORIZED');
      const params = forgeParams.current;
      const generate =
        params.documents && params.documents.length > 0
          ? generateQuizFromExtracted({ documents: params.documents, difficulty: params.diff, questionCount: 1, idToken })
          : params.pdfDataUri
            ? generateQuizFromPDF({ pdfDataUri: params.pdfDataUri, difficulty: params.diff, questionCount: 1, idToken })
            : Promise.reject(new Error('No source document available for regeneration.'));
      const result = await Promise.race([
        generate,
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
    setDocumentTitle(null);
    forgeParams.current = null;
    setListRefreshKey(k => k + 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/10">
      <div className={cn(
        "page-container safe-top safe-bottom animate-in",
        generatedQuestions && !showForgeWithPreserved ? "py-4 md:py-6" : "py-6 md:py-10"
      )}>
        <div className="flex items-center justify-between mb-6 md:mb-8">
          <div className="space-y-1.5">
            <h1 className="text-page-title font-headline tracking-tight flex items-center gap-3">
              <span className="bg-warning/10 p-2 rounded-lg inline-flex">
                <Sparkles className="w-6 h-6 text-warning" />
              </span>
              AI PDF Forge
            </h1>
            <p className="text-base text-muted-foreground ml-12">
              Generate quiz questions from PDF, DOCX, TXT, Markdown, and images using AI.
            </p>
          </div>
          {generatedQuestions && !showForgeWithPreserved && (
            <Button variant="outline" size="sm" onClick={handleRegenerate} className="hidden md:inline-flex gap-2">
              <ChevronLeft className="w-4 h-4" /> Back to Upload
            </Button>
          )}
        </div>

        {generatedQuestions && !showForgeWithPreserved ? (
          <div className="space-y-4">
            <div className="md:hidden">
              <Button variant="ghost" size="sm" onClick={handleRegenerate} className="mb-2">
                <ChevronLeft className="mr-2 h-4 w-4" /> Back to Upload
              </Button>
            </div>
            <Suspense fallback={
              <div className="space-y-4">
                {[1,2,3].map(i => (
                  <div key={i} className="h-48 bg-secondary/10 rounded-xl animate-pulse" />
                ))}
              </div>
            }>
              <ExecutiveQuestionReviewPanel
                initialQuestions={generatedQuestions}
                difficulty={forgeDifficulty}
                category={forgeCategory}
                documentTitle={documentTitle || undefined}
                onRegenerate={handleRegenerate}
                onEditSettings={handleEditSettingsClick}
                onRegenerateQuestion={forgeParams.current ? handleRegenerateQuestion : undefined}
                onImportComplete={handleImportComplete}
              />
            </Suspense>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            <div className="mb-8 flex items-center gap-4 p-4 bg-primary/5 rounded-lg border border-primary/10">
              <div className="bg-primary/10 p-2 rounded-lg shrink-0">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                Upload PDF, DOCX, TXT, Markdown, or image files. The AI will extract content and generate quiz questions based on your parameters.
              </p>
            </div>
            <Suspense fallback={
              <div className="h-96 bg-secondary/10 rounded-xl animate-pulse" />
            }>
              <PDFQuizGenerator
                onQuestionsGenerated={handleQuestionsGenerated}
                initialCategory={forgeCategory}
                showCategorySelector={true}
              />
            </Suspense>
          </div>
        )}

<div className={cn('mt-8 md:mt-10', generatedQuestions && !showForgeWithPreserved ? 'hidden' : '')}>
          <Suspense fallback={
            <div className="h-64 bg-secondary/10 rounded-xl animate-pulse" />
          }>
            <QuizLibraryManager refreshKey={listRefreshKey} />
          </Suspense>
        </div>
      </div>
      {editConfirmDialog}
    </div>
  );
}
