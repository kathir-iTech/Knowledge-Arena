"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { FileText, Loader2, Upload, X, Sparkles, AlertCircle, Key } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateQuizFromPDF } from '@/ai/flows/generate-quiz-pdf-flow';
import { useToast } from '@/hooks/use-toast';

interface PDFQuizGeneratorProps {
  onQuestionsGenerated: (questions: any[], difficulty: string) => void;
}

const STATUS_MESSAGES = [
  "Uploading intelligence report...",
  "Parsing strategic data...",
  "Forging elite challenges...",
  "Analyzing tactical depth...",
  "Optimizing combat rounds...",
  "Finalizing arena parameters..."
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
        toast({ title: "Forge Successful", description: `Successfully generated ${result.questions.length} tactical rounds.` });
        onQuestionsGenerated(result.questions, result.difficulty);
      } else {
        throw new Error("AI_FAILED");
      }
    } catch (err: any) {
      console.error(err);
      let msg = err.message || "The AI Forge was interrupted.";
      
      // Map specific backend errors to user-friendly messages
      if (msg.includes("MISSING_ANTHROPIC_API_KEY")) {
        msg = "The Arena Architect requires an Anthropic API Key. Please set 'ANTHROPIC_API_KEY' in your .env file and restart the server.";
      } else if (msg.includes("PDF_CONTENT_TOO_SHORT")) {
        msg = "The PDF Forge failed because no extractable text was found. This usually happens with scanned image-based PDFs. Please upload a text-based document.";
      } else if (msg.includes("ANTHROPIC_API_ERROR")) {
        msg = "The Intelligence Forge is temporarily overloaded or the key is invalid. Please verify your Anthropic credits.";
      }
      
      setError(msg);
      toast({ variant: 'destructive', title: "Forge Error", description: "Tactical data extraction failed." });
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
            <CardTitle className="text-2xl font-headline text-primary uppercase">AI PDF Forge</CardTitle>
            <CardDescription>Upload training manuals or research to automate arena construction.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8 pt-8">
        {error && error.includes("ANTHROPIC_API_KEY") && (
            <div className="flex flex-col gap-4 bg-destructive/10 p-6 rounded-xl border border-destructive/20 animate-in fade-in zoom-in">
                <div className="flex items-center gap-3 text-destructive">
                    <Key className="w-8 h-8" />
                    <h3 className="text-lg font-black uppercase tracking-tighter">API Key Missing</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    To use the AI Forge, you must add your <strong>Anthropic API Key</strong> to the <code>.env</code> file in your project root.
                </p>
                <div className="bg-background/50 p-3 rounded font-mono text-xs border border-destructive/20 select-all">
                    ANTHROPIC_API_KEY=your_key_here
                </div>
                <Button variant="outline" size="sm" className="w-fit" onClick={() => window.open('https://console.anthropic.com/', '_blank')}>
                    Get API Key
                </Button>
            </div>
        )}

        <div className="space-y-4">
          <Label className="text-lg font-medium">1. Tactical Intelligence (PDF)</Label>
          {!file ? (
            <div className={cn(
              "border-2 border-dashed border-primary/20 rounded-2xl p-12 transition-all hover:bg-primary/5 hover:border-primary/40 cursor-pointer flex flex-col items-center justify-center gap-4 text-center relative",
              error && !error.includes("KEY") && "border-destructive/40 bg-destructive/5"
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
                <p className="font-bold text-lg">Drop your intelligence report here</p>
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
          <Label className="text-lg font-medium">2. Combat Intensity</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { id: 'easy', label: 'Easy', emoji: '🟢', desc: 'Recall & Terminology' },
              { id: 'moderate', label: 'Moderate', emoji: '🟡', desc: 'Application & Inference' },
              { id: 'hard', label: 'Hard', emoji: '🔴', desc: 'Analysis & critical logic' }
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
            <Label className="text-lg font-medium">3. Mission Scope</Label>
            <span className="bg-primary/20 text-primary font-black px-3 py-1 rounded-lg text-sm">
              {questionCount} ROUNDS
            </span>
          </div>
          <Slider
            value={[questionCount]}
            onValueChange={(val) => setQuestionCount(val[0])}
            min={5}
            max={25}
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
            className="w-full h-20 text-xl font-headline shadow-2xl shadow-primary/30 relative"
          >
            {isGenerating ? (
              <div className="flex flex-col items-center">
                <Loader2 className="animate-spin mb-1" />
                <span className="text-xs animate-pulse tracking-widest font-body uppercase">
                  {STATUS_MESSAGES[statusIndex]}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Sparkles className="w-6 h-6" />
                <span>INITIATE FORGE</span>
              </div>
            )}
          </Button>
          
          {error && !error.includes("KEY") && (
            <div className="mt-4 flex flex-col gap-2 bg-destructive/10 p-4 rounded-xl border border-destructive/20 animate-in fade-in">
              <div className="flex items-center gap-2 text-destructive font-bold text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Extraction Violation
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{error}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
