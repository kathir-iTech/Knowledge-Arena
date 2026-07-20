"use client";

import React, { useState, useRef, useEffect } from 'react';
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

type GenerationStage = 'idle' | 'reading' | 'generating' | 'complete' | 'error';

const STAGE_LABELS: Record<GenerationStage, string> = {
  idle: 'Ready',
  reading: 'Reading PDF file...',
  generating: 'Processing with AI forge...',
  complete: 'Generation complete!',
  error: 'Generation failed',
};

const CLIENT_TIMEOUT_MS = 120000;

export function PDFQuizGenerator({ onQuestionsGenerated }: PDFQuizGeneratorProps) {
  const { toast } = useToast();
  const { auth } = useFirebase();
  const [file, setFile] = useState<File | null>(null);
  const [difficulty, setDifficulty] = useState<'easy' | 'moderate' | 'hard' | null>(null);
  const [questionCount, setQuestionCount] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [stage, setStage] = useState<GenerationStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    setError(null);

    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        setError("Please upload a valid PDF file.");
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError("The PDF is too large. Maximum size is 10MB.");
        return;
      }
      if (selectedFile.size === 0) {
        setError("The PDF file is empty.");
        return;
      }
      // Validate PDF magic bytes (%PDF)
      const reader = new FileReader();
      reader.onloadend = () => {
        const arr = new Uint8Array(reader.result as ArrayBuffer);
        const magic = String.fromCharCode(arr[0], arr[1], arr[2], arr[3]);
        if (magic !== '%PDF') {
          setError("This file does not appear to be a valid PDF. Please check the file and try again.");
          return;
        }
        setFile(selectedFile);
      };
      reader.onerror = () => {
        setError("Could not read the file. Please try again.");
      };
      reader.readAsArrayBuffer(selectedFile.slice(0, 4));
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
    setStage('reading');

    const timerId = setTimeout(() => {
      setIsGenerating(false);
      setStage('error');
      setError("Generation timed out after 2 minutes. Try with fewer questions or a smaller PDF.");
    }, CLIENT_TIMEOUT_MS);

    try {
      const reader = new FileReader();
      setStage('reading');
      const dataUri = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!idToken) throw new Error("UNAUTHORIZED");

      setStage('generating');
      const result = await generateQuizFromPDF({
        pdfDataUri: dataUri,
        difficulty,
        questionCount,
        idToken,
      });

      // Check if server returned an error message
      if (result.error) {
        throw new Error(result.error);
      }

      if (result.questions && result.questions.length > 0) {
        clearTimeout(timerId);
        if (!mountedRef.current) return;
        setStage('complete');
        toast({ title: "Generation Complete", description: `Created ${result.questions.length} questions.` });
        onQuestionsGenerated(result.questions, result.difficulty, dataUri, questionCount);
      } else {
        throw new Error("AI_FAILED");
      }
    } catch (err: unknown) {
      clearTimeout(timerId);
      if (!mountedRef.current) return;
      setStage('error');
      let msg = err instanceof Error ? err.message : "Unable to generate questions. Please retry.";
      
      if (msg.includes("AI_FAILED")) {
        msg = "Unable to generate questions. Please retry.";
      } else if (msg.includes("PDF_IMAGE_ONLY")) {
        msg = "This PDF contains scanned images and no selectable text. Please upload a text-based PDF.";
      } else if (msg.includes("PDF_CONTENT_TOO_SHORT")) {
        msg = "No extractable text was found in the PDF. This usually happens with scanned documents. Please upload a text-based PDF.";
      } else if (msg.includes("PDF_EXTRACTION_TIMEOUT")) {
        msg = "PDF extraction timed out. Try a smaller or simpler PDF.";
      } else if (msg.includes("PDF_EXTRACTION_FAILED")) {
        msg = "Unable to read the PDF. The file may be corrupted or uses an unsupported format. Please try a different PDF.";
      } else if (msg.includes("PDF_ENCRYPTED")) {
        msg = "This PDF is encrypted or password-protected. Please upload an unencrypted PDF.";
      } else if (msg.includes("PDF_CORRUPTED")) {
        msg = "This PDF appears to be corrupted. Please try a different file.";
      } else if (msg.includes("PDF_UNSUPPORTED")) {
        msg = "This file does not appear to be a valid PDF. Please check the file and try again.";
      } else if (msg.includes("UNAUTHORIZED")) {
        msg = "Your session has expired. Please log out and log back in.";
      } else if (msg.includes("PDF_TOO_LARGE")) {
        msg = "The uploaded PDF exceeds the maximum size limit on the server.";
      } else if (msg.includes("PDF_FORGE_RATE_LIMITED")) {
        msg = "Rate limit reached (5 per minute). Please wait before trying again.";
      } else if (msg.includes("INVALID_PDF_DATA")) {
        msg = "Invalid PDF data. Please try uploading the file again.";
      } else if (msg.includes("quota_exceeded")) {
        msg = "AI generation quota temporarily exhausted. Please wait a few minutes before retrying.";
      } else if (msg.includes("all_models_failed") || msg.includes("AI generation") || msg.includes("temporarily unavailable")) {
        msg = "Unable to generate questions. Please retry.";
      }
      
      setError(msg);
      toast({ variant: 'destructive', title: "Generation Failed", description: msg });
    } finally {
      clearTimeout(timerId);
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
                    To use the AI Forge, you must add your <strong>Google AI API Key</strong> to the <code className="bg-background/50 px-1 rounded">.env</code> file in your project root.
                </p>
                <div className="bg-background/50 p-3 rounded font-mono text-xs border border-destructive/10 select-all">
                    GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
                </div>
                <Button variant="outline" size="sm" className="w-fit" onClick={() => window.open('https://aistudio.google.com/apikey', '_blank')}>
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
                  {STAGE_LABELS[stage]}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Sparkles className="w-6 h-6" />
                <span>Generate Questions</span>
              </div>
            )}
          </Button>
          
          {error && !error.includes("API key") && !error.includes("INVALID_PDF_DATA") && (
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
