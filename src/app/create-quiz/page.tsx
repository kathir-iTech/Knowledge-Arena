"use client";

import React from 'react';
import { QuizCreatorForm } from "@/components/quiz/QuizCreatorForm";

export default function CreateQuizPage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto min-h-screen">
      <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-5xl font-headline tracking-tighter text-primary uppercase">Arena Architect</h1>
          <p className="text-muted-foreground text-lg">Design a new battleground. Formulate manual challenges for your gladiators.</p>
        </div>
      </header>

      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        <QuizCreatorForm />
      </div>
    </div>
  );
}
