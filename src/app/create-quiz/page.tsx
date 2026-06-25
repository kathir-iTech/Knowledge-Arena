"use client";

import React, { useState } from 'react';
import { QuizCreatorForm } from "@/components/quiz/QuizCreatorForm";
import { PDFQuizGenerator } from "@/components/quiz/PDFQuizGenerator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PencilRuler, Sparkles, ArrowLeft } from "lucide-react";
import { Button } from '@/components/ui/button';
import { v4 as uuidv4 } from 'uuid';

export default function CreateQuizPage() {
  const [activeTab, setActiveTab] = useState("manual");
  const [generatedQuestions, setGeneratedQuestions] = useState<any[] | null>(null);

  const handleQuestionsGenerated = (questions: any[]) => {
    // Transform AI questions into the form's expected format
    const formattedQuestions = questions.map(q => ({
      id: uuidv4(),
      text: q.text,
      options: q.options,
      correctAnswerIndex: q.correctAnswerIndex,
      timer: 30, // Default timer
      explanation: q.explanation // Stored for display in the form if needed
    }));
    
    setGeneratedQuestions(formattedQuestions);
    setActiveTab("manual"); // Switch to review in the manual form
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-5xl font-headline tracking-tighter text-primary uppercase">Arena Architect</h1>
          <p className="text-muted-foreground text-lg">Design a new battleground. Deploy manual challenges or forge them with AI intelligence.</p>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
        <div className="flex justify-center">
            <TabsList className="grid w-full max-w-md grid-cols-2 h-14 bg-secondary/50 p-1 border border-border/50 rounded-2xl">
                <TabsTrigger value="manual" className="rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-lg">
                    <PencilRuler className="mr-2 w-4 h-4" />
                    Manual Entry
                </TabsTrigger>
                <TabsTrigger value="ai" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg shadow-primary/20">
                    <Sparkles className="mr-2 w-4 h-4" />
                    AI PDF Forge
                </TabsTrigger>
            </TabsList>
        </div>

        <TabsContent value="manual" className="animate-in fade-in slide-in-from-bottom-2 duration-500">
           {generatedQuestions && (
               <div className="mb-8 p-4 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-between">
                   <div className="flex items-center gap-3">
                       <Sparkles className="w-6 h-6 text-primary" />
                       <span className="font-bold">AI generation complete! Review and customize your questions below.</span>
                   </div>
                   <Button variant="ghost" size="sm" onClick={() => setGeneratedQuestions(null)}>
                       <ArrowLeft className="mr-2 h-4 w-4" /> Start Over
                   </Button>
               </div>
           )}
           <QuizCreatorForm initialQuestions={generatedQuestions || undefined} />
        </TabsContent>

        <TabsContent value="ai" className="animate-in fade-in slide-in-from-bottom-2 duration-500">
           <PDFQuizGenerator onQuestionsGenerated={handleQuestionsGenerated} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
