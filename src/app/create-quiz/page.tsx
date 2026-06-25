"use client";

import React, { useState } from 'react';
import { QuizCreatorForm } from "@/components/quiz/QuizCreatorForm";
import { PDFQuizGenerator } from "@/components/quiz/PDFQuizGenerator";
import { QuestionReviewPanel } from "@/components/quiz/QuestionReviewPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PencilRuler, Sparkles, ChevronLeft } from "lucide-react";
import { Button } from '@/components/ui/button';

export default function CreateQuizPage() {
  const [activeTab, setActiveTab] = useState('manual');
  const [generatedQuestions, setGeneratedQuestions] = useState<any[] | null>(null);
  const [difficulty, setDifficulty] = useState('');

  const handleQuestionsGenerated = (questions: any[], diff: string) => {
    setGeneratedQuestions(questions);
    setDifficulty(diff);
  };

  const handleResetForge = () => {
    setGeneratedQuestions(null);
  };

  if (generatedQuestions) {
    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto min-h-screen">
        <header className="mb-8 flex items-center justify-between">
           <Button variant="ghost" onClick={handleResetForge}>
             <ChevronLeft className="mr-2 h-4 w-4" /> Back to Architect
           </Button>
           <h1 className="text-2xl font-headline text-primary uppercase">Intelligence Review</h1>
        </header>
        <QuestionReviewPanel 
            initialQuestions={generatedQuestions} 
            difficulty={difficulty}
            onRegenerate={handleResetForge}
            onEditSettings={handleResetForge}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto min-h-screen">
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
          <QuizCreatorForm />
        </TabsContent>

        <TabsContent value="forge" className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <PDFQuizGenerator onQuestionsGenerated={handleQuestionsGenerated} />
        </TabsContent>
      </Tabs>
    </div>
  );
}