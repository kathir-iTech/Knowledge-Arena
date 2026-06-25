"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { FileText, Loader2, Upload, X, Sparkles, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateQuizFromPDF } from '@/ai/flows/generate-quiz-pdf-flow';
import { useToast } from '@/hooks/use-toast';

interface PDFQuizGeneratorProps {
  onQuestionsGenerated: (questions: any[], difficulty: string) => void;
}

const STATUS_MESSAGES = [
  "Uploading your PDF...",
  "Reading the document...",
  "AI is crafting your questions...",
  "Almost there...",
  "Analyzing key concepts...",
  "Designing tricky distractors..."
];

export function PDFQuizGenerator({ onQuestionsGenerated }: PDFQuizGeneratorProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [difficulty, setDifficulty] = useState<'easy' | 'moderate' | 'hard' | null>(null);
  const [questionCount, setQuestionCount] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusIndex, setStatusIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isGenerating) {
      interval = setInterval(() => {
        setStatusIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    setError(null);

    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        setError("Only PDF files are supported.");
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError("PDF must be under 10MB.");
        return;
      }
      setFile(selectedFile);
    }
  };

  const removeFile = () => {
    setFile(null);
    setError(null);
  };

  const handleGenerate = async () => {
    if (!file || !difficulty) return;
    
    setIsGenerating(true);
    setError(null);
    setStatusIndex(0);

    try {
      const reader = new FileReader();
      const dataUri = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const result = await generateQuizFromPDF({
        pdfDataUri: dataUri,
        difficulty,
        questionCount
      });

      if (result.questions && result.questions.length > 0) {
        if (result.partial) {
            toast({ title: "Partial Generation", description: `Could only generate ${result.questions.length} valid questions.` });
        } else {
            toast({ title: "Questions Generated!", description: `Successfully created ${result.questions.length} questions.` });
        }
        onQuestionsGenerated(result.questions, difficulty);
      } else {
        throw new Error("AI_FAILED");
      }
    } catch (err: any) {
      console.error(err);
      let msg = "AI generation failed. Please try again.";
      if (err.message === "PDF_TOO_SHORT") msg = "PDF content is too short to generate these many questions. Try a longer document.";
      if (err.message === "PDF_PARSE_FAILED") msg = "No text could be extracted from this PDF. Try a text-based PDF.";
      if (err.message === "AI_FAILED") msg = "AI generation failed. The content might be too complex or restricted.";
      if (err.message === "INVALID_INPUT") msg = "Invalid request parameters.";
      
      setError(msg);
      toast({ variant: 'destructive', title: "Generation Error", description: msg });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="border-primary/20 bg-secondary/10 shadow-xl overflow-hidden">
      <CardHeader className="bg-primary/5 border-b border-primary/10">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-primary animate-pulse" />
          <div>
            <CardTitle className="text-2xl font-headline text-primary">AI PDF Forge</CardTitle>
            <CardDescription>Upload strategic documentation to automate challenge creation.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8 pt-8">
        <div className="space-y-4">
          <Label className="text-lg font-medium">1. Select Strategic Intelligence (PDF)</Label>
          {!file ? (
            <div className={cn(
              "border-2 border-dashed border-primary/20 rounded-2xl p-12 transition-all hover:bg-primary/5 hover:border-primary/40 cursor-pointer flex flex-col items-center justify-center gap-4 text-center",
              error && "border-destructive/40 bg-destructive/5"
            )}>
              <input 
                type="file" 
                accept=".pdf" 
                onChange={handleFileChange} 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                disabled={isGenerating}
              />
              <div className="bg-primary/10 p-4 rounded-full">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <div>
                <p className="font-bold text-lg">Drop your PDF here</p>
                <p className="text-sm text-muted-foreground">Max size 10MB. Text-based PDFs only.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 bg-background/50 border border-primary/20 rounded-xl">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <FileText className="w-6 h-6 text-primary" />
                </div>
                <div className="flex flex-col truncate">
                  <span className="font-bold truncate">{file.name}</span>
                  <span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={removeFile} 
                disabled={isGenerating}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Label className="text-lg font-medium">2. Difficulty Level</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { id: 'easy', label: 'Easy', emoji: '🟢', desc: 'Factual recall, definitions' },
              { id: 'moderate', label: 'Moderate', emoji: '🟡', desc: 'Application & inference' },
              { id: 'hard', label: 'Hard', emoji: '🔴', desc: 'Analysis & distractors' }
            ].map((d) => (
              <button
                key={d.id}
                onClick={() => setDifficulty(d.id as any)}
                disabled={isGenerating}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center group",
                  difficulty === d.id 
                    ? "bg-primary/10 border-primary shadow-lg shadow-primary/20 scale-105" 
                    : "bg-background/40 border-border/50 hover:border-primary/40 hover:bg-primary/5"
                )}
              >
                <span className="text-3xl mb-1 group-hover:scale-125 transition-transform">{d.emoji}</span>
                <span className="font-bold uppercase tracking-widest text-sm">{d.label}</span>
                <span className="text-xs text-muted-foreground leading-tight">{d.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <Label className="text-lg font-medium">3. Challenge Magnitude</Label>
            <span className="bg-primary/20 text-primary font-black px-3 py-1 rounded-lg text-sm">
              {questionCount} QUESTIONS
            </span>
          </div>
          <Slider
            value={[questionCount]}
            onValueChange={(val) => setQuestionCount(val[0])}
            min={5}
            max={30}
            step={1}
            disabled={isGenerating}
            className="py-4"
          />
        </div>

        <div className="pt-4">
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !file || !difficulty}
            size="lg"
            className="w-full h-16 text-xl font-headline shadow-2xl shadow-primary/30 relative"
          >
            {isGenerating ? (
              <div className="flex flex-col items-center">
                <Loader2 className="animate-spin mb-1" />
                <span className="text-xs animate-pulse tracking-wide font-body">
                  {STATUS_MESSAGES[statusIndex]}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Sparkles className="w-6 h-6" />
                <span>INITIATE AI FORGE</span>
              </div>
            )}
          </Button>
          
          {error && (
            <div className="mt-4 flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/20 text-sm animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
