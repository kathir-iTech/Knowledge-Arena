"use client";

import React, { useState } from 'react';
import { QuizCreatorForm } from "@/components/quiz/QuizCreatorForm";
import { PDFQuizGenerator } from "@/components/quiz/PDFQuizGenerator";
import { QuestionReviewPanel } from "@/components/quiz/QuestionReviewPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PencilRuler, Sparkles, ArrowLeft } from "lucide-react";
import { Button } from '@/components/ui/button';

type CreateMode = 'manual' | 'ai-forge' | 'ai-review';

export default function CreateQuizPage() {
  const [mode, setMode] = useState<CreateMode>('manual');
  const [generatedQuestions, setGeneratedQuestions] = useState<any[] | null>(null);
  const [generatedDifficulty, setGeneratedDifficulty] = useState<string>('');

  const handleQuestionsGenerated = (questions: any[], difficulty: string) => {
    setGeneratedQuestions(questions);
    setGeneratedDifficulty(difficulty);
    setMode('ai-review');
  };

  const handleRegenerate = () => {
    setGeneratedQuestions(null);
    setMode('ai-forge');
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto min-h-screen">
      <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-5xl font-headline tracking-tighter text-primary uppercase">Arena Architect</h1>
          <p className="text-muted-foreground text-lg">Design a new battleground. Deploy manual challenges or forge them with AI intelligence.</p>
        </div>
      </header>

      {mode === 'ai-review' && generatedQuestions ? (
          <QuestionReviewPanel 
            initialQuestions={generatedQuestions} 
            difficulty={generatedDifficulty}
            onRegenerate={handleRegenerate}
            onEditSettings={() => setMode('ai-forge')}
          />
      ) : (
        <Tabs value={mode} onValueChange={(val) => setMode(val as any)} className="space-y-8">
            <div className="flex justify-center">
                <TabsList className="grid w-full max-w-md grid-cols-2 h-14 bg-secondary/50 p-1 border border-border/50 rounded-2xl">
                    <TabsTrigger value="manual" className="rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-lg">
                        <PencilRuler className="mr-2 w-4 h-4" />
                        Manual Entry
                    </TabsTrigger>
                    <TabsTrigger value="ai-forge" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg shadow-primary/20">
                        <Sparkles className="mr-2 w-4 h-4" />
                        AI PDF Forge
                    </TabsTrigger>
                </TabsList>
            </div>

            <TabsContent value="manual" className="animate-in fade-in slide-in-from-bottom-2 duration-500">
               <QuizCreatorForm />
            </TabsContent>

            <TabsContent value="ai-forge" className="animate-in fade-in slide-in-from-bottom-2 duration-500">
               <PDFQuizGenerator onQuestionsGenerated={handleQuestionsGenerated} />
            </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
