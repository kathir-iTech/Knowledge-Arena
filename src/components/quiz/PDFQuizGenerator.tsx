"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { FileText, Loader2, Upload, X, Sparkles, AlertCircle, Key, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateQuizFromPDF } from '@/ai/flows/generate-quiz-pdf-flow';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';

interface GeneratedQuestion {
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

interface PDFQuizGeneratorProps {
  onQuestionsGenerated: (questions: GeneratedQuestion[], difficulty: string, dataUri?: string, questionCount?: number) => void;
}

const STATUS_MESSAGES = [
  "Uploading intelligence report...",
  "Parsing strategic data...",
  "Forging elite challenges...",
  "Analyzing content...",
  "Optimizing questions...",
  "Finalizing arena parameters..."
];

export function PDFQuizGenerator({ onQuestionsGenerated }: PDFQuizGeneratorProps) {
  const { toast } = useToast();
  const { auth } = useFirebase();
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

      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!idToken) throw new Error("UNAUTHORIZED");

      const result = await generateQuizFromPDF({
        pdfDataUri: dataUri,
        difficulty,
        questionCount,
        idToken,
      });

      if (result.questions && result.questions.length > 0) {
        toast({ title: "Generation Complete", description: `Created ${result.questions.length} questions.` });
        onQuestionsGenerated(result.questions, result.difficulty, dataUri, questionCount);
      } else {
        throw new Error("AI_FAILED");
      }
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : "Unable to generate questions. Please retry.";
      
      if (msg.includes("AI_FAILED")) {
        msg = "Unable to generate questions. Please retry.";
      } else if (msg.includes("MISSING_ANTHROPIC_API_KEY")) {
        msg = "The generator requires an API key. Please set 'ANTHROPIC_API_KEY' in your .env file and restart the server.";
      } else if (msg.includes("PDF_CONTENT_TOO_SHORT")) {
        msg = "No extractable text was found in the PDF. This usually happens with scanned documents. Please upload a text-based PDF.";
      } else if (msg.includes("ANTHROPIC_API_ERROR")) {
        msg = "The AI service is temporarily unavailable. Please try again.";
      } else if (msg.includes("UNAUTHORIZED")) {
        msg = "Your session has expired. Please log out and log back in.";
      } else if (msg.includes("PDF_TOO_LARGE")) {
        msg = "The uploaded PDF exceeds the maximum size limit on the server.";
      } else if (msg.includes("PDF_FORGE_RATE_LIMITED")) {
        msg = "Rate limit reached (5 per minute). Please wait before trying again.";
      } else if (msg.includes("quota_exceeded") || msg.includes("all_models_failed")) {
        msg = "Unable to generate questions. Please retry.";
      }
      
      setError(msg);
      toast({ variant: 'destructive', title: "Generation Failed", description: "Could not generate questions." });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-primary/5 border-b border-primary/10">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-primary" />
          <div>
            <CardTitle className="text-2xl font-headline text-primary uppercase">AI PDF Forge</CardTitle>
            <CardDescription>Upload a PDF to automatically generate quiz questions.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8 pt-8">
        {error && error.includes("API key") && (
            <div className="flex flex-col gap-4 bg-destructive/5 p-6 rounded-lg border border-destructive/10 animate-in">
                <div className="flex items-center gap-3 text-destructive">
                    <Key className="w-8 h-8" />
                    <h3 className="text-lg font-bold uppercase tracking-tight">API Key Missing</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    To use the AI Forge, you must add your <strong>Anthropic API Key</strong> to the <code className="bg-background/50 px-1 rounded">.env</code> file in your project root.
                </p>
                <div className="bg-background/50 p-3 rounded font-mono text-xs border border-destructive/10 select-all">
                    ANTHROPIC_API_KEY=your_key_here
                </div>
                <Button variant="outline" size="sm" className="w-fit" onClick={() => window.open('https://console.anthropic.com/', '_blank')}>
                    Get API Key
                </Button>
            </div>
        )}

        <div className="space-y-4">
          <Label className="text-lg font-medium">1. Source Material (PDF)</Label>
          {!file ? (
            <div className={cn(
              "border-2 border-dashed border-border/30 rounded-lg p-12 transition-all hover:border-primary/30 cursor-pointer flex flex-col items-center justify-center gap-4 text-center relative",
              error && !error.includes("API key") && "border-destructive/30 bg-destructive/5"
            )}>
              <input 
                type="file" 
                accept=".pdf" 
                onChange={handleFileChange} 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                disabled={isGenerating}
              />
              <div className="bg-primary/5 p-4 rounded-full">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-lg">Upload your PDF material</p>
                <p className="text-sm text-muted-foreground">Max size 10MB. Text-based PDFs only.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 bg-background/50 border border-border/20 rounded-lg">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="bg-primary/5 p-2 rounded-lg">
                  <FileText className="w-6 h-6 text-primary" />
                </div>
                <div className="flex flex-col truncate">
                  <span className="font-medium truncate">{file.name}</span>
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
          <Label className="text-lg font-medium">2. Difficulty</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { id: 'easy', label: 'Easy', emoji: '🟢', desc: 'Recall & Terminology' },
              { id: 'moderate', label: 'Moderate', emoji: '🟡', desc: 'Application & Inference' },
              { id: 'hard', label: 'Hard', emoji: '🔴', desc: 'Analysis & critical logic' }
            ].map((d) => (
              <button
                key={d.id}
                onClick={() => setDifficulty(d.id as 'easy' | 'moderate' | 'hard')}
                disabled={isGenerating}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all text-center",
                  difficulty === d.id 
                    ? "bg-primary/5 border-primary" 
                    : "bg-background/30 border-border/40 hover:border-primary/30 hover:bg-primary/5"
                )}
              >
                <span className="text-3xl mb-1 transition-transform duration-150">{d.emoji}</span>
                <span className="font-bold uppercase tracking-widest text-sm">{d.label}</span>
                <span className="text-xs text-muted-foreground leading-tight">{d.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <Label className="text-lg font-medium">3. Question Count</Label>
            <span className="bg-primary/10 text-primary font-bold px-3 py-1 rounded text-sm">
              {questionCount} QUESTIONS
            </span>
          </div>
          <Slider
            value={[questionCount]}
            onValueChange={(val) => setQuestionCount(val[0])}
            min={5}
            max={25}
            step={1}
            disabled={isGenerating}
          />
        </div>

        <div className="pt-4">
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !file || !difficulty}
            size="lg"
            className="w-full h-20 text-xl font-headline"
          >
            {isGenerating ? (
              <div className="flex flex-col items-center">
                <Loader2 className="animate-spin mb-1" />
                <span className="text-xs tracking-widest uppercase">
                  {STATUS_MESSAGES[statusIndex]}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Sparkles className="w-6 h-6" />
                <span>Generate Questions</span>
              </div>
            )}
          </Button>
          
          {error && !error.includes("API key") && (
            <div className="mt-4 flex flex-col gap-3 bg-destructive/5 p-4 rounded-lg border border-destructive/10 animate-in">
              <div className="flex items-center gap-2 text-destructive font-bold text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Generation Failed
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{error}</p>
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating || !file || !difficulty} className="w-fit">
                <RefreshCw className="w-3 h-3 mr-2" /> Retry
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
