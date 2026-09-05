"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { FileText, Loader2, Upload, X, Sparkles, AlertCircle, Key, RefreshCw, Check, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateQuizFromExtracted, createForgeJob, runForgeTick } from '@/ai/flows/generate-quiz-pdf-flow';
import { prepareDocuments, type PreparedDocument } from '@/lib/prepare-documents';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';

interface GeneratedQuestion {
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

interface PDFQuizGeneratorProps {
  onQuestionsGenerated: (questions: GeneratedQuestion[], difficulty: string, documents?: PreparedDocument[], questionCount?: number, category?: string, documentName?: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  initialCategory?: string;
  showCategorySelector?: boolean;
}

type GenerationStage = 'idle' | 'reading' | 'generating' | 'complete' | 'error';

const STAGE_LABELS: Record<GenerationStage, string> = {
  idle: 'Ready',
  reading: 'Reading file(s)...',
  generating: 'Processing with AI forge...',
  complete: 'Generation complete!',
  error: 'Generation failed',
};

// Async job pipeline: the tab can stay open for the full generation (progress
// is streamed back per tick) but even closing it won't lose the work — the
// /api/cron/forge-worker backstop keeps ticking queued jobs.
const CLIENT_TIMEOUT_MS = 15 * 60 * 1000;

const PIPELINE_STEPS = [
  'Extracting text',
  'Sending to AI',
  'Generating questions',
  'Reviewing answers',
] as const;

type PipelineStepStatus = 'pending' | 'active' | 'done' | 'error';

const ACCEPTED_TYPES = '.pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp';
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function PDFQuizGenerator({ onQuestionsGenerated, onDirtyChange, initialCategory, showCategorySelector }: PDFQuizGeneratorProps) {
  const { toast } = useToast();
  const { auth } = useFirebase();
  const [files, setFiles] = useState<File[]>([]);
  const [difficulty, setDifficulty] = useState<'easy' | 'moderate' | 'hard' | null>(null);
  const [questionCount, setQuestionCount] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [stage, setStage] = useState<GenerationStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(initialCategory || 'General');
  const [activeStep, setActiveStep] = useState<number>(-1);
  const [stepError, setStepError] = useState<number | null>(null);
  const [fileStatuses, setFileStatuses] = useState<Array<{ name: string; status: 'pending' | 'reading' | 'done' | 'error' }>>([]);
  const [failedStepInfo, setFailedStepInfo] = useState<{ step: number; guidance: string } | null>(null);
  const [extractionDetail, setExtractionDetail] = useState<string | null>(null);
  const [truncationNote, setTruncationNote] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  useEffect(() => {
    onDirtyChange?.(Boolean(files.length || difficulty || isGenerating));
  }, [files, difficulty, isGenerating, onDirtyChange]);

  const validateAndAddFile = (selectedFile: File): boolean => {
    const name = selectedFile.name.toLowerCase();
    const isPdf = name.endsWith('.pdf') || selectedFile.type === 'application/pdf';
    const isDocx = name.endsWith('.docx') || selectedFile.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const isTxt = name.endsWith('.txt') || selectedFile.type === 'text/plain';
    const isMd = name.endsWith('.md') || selectedFile.type === 'text/markdown';
    const isImage = name.match(/\.(png|jpg|jpeg|gif|webp)$/) || selectedFile.type.startsWith('image/');

    if (!isPdf && !isDocx && !isTxt && !isMd && !isImage) {
      setError("Unsupported file type. Please upload PDF, DOCX, TXT, MD, or image files (PNG, JPG, GIF, WebP).");
      return false;
    }
    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setError(`${selectedFile.name} exceeds the 10MB size limit.`);
      return false;
    }
    if (selectedFile.size === 0) {
      setError(`${selectedFile.name} is empty.`);
      return false;
    }
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    setError(null);
    if (!selectedFiles || selectedFiles.length === 0) return;

    const validFiles: File[] = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      if (validateAndAddFile(selectedFiles[i])) {
        validFiles.push(selectedFiles[i]);
      }
    }

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
    }
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setError(null);
  };

  const handleGenerate = async () => {
    if (!files.length || !difficulty) return;

    setIsGenerating(true);
    setError(null);
    setFailedStepInfo(null);
    setStepError(null);
    setStage('reading');
    setActiveStep(0);
    setFileStatuses(files.map(f => ({ name: f.name, status: 'pending' as const })));

    const timerId = setTimeout(() => {
      setIsGenerating(false);
      setStage('error');
      setStepError(2);
      setFailedStepInfo({ step: 2, guidance: 'The request timed out. Try reducing the question count or using smaller files.' });
      setError("Generation timed out after 3 minutes. Try with fewer questions or smaller files.");
    }, CLIENT_TIMEOUT_MS);

    try {
      setStage('reading');
      setActiveStep(0);
      setExtractionDetail(null);
      setTruncationNote(null);

      // Step 0: Client-side document preparation. Text extraction and
      // scanned-page imaging happen in the browser; only the small derived
      // payload is sent to the server, keeping the request well under
      // Vercel's 4.5 MB Function body ceiling (the old raw-base64 approach
      // overflowed it for 3-5 MB files and surfaced as a generic
      // "unexpected response").
      const documents: PreparedDocument[] = [];
      for (let idx = 0; idx < files.length; idx++) {
        setFileStatuses(prev => prev.map((s, i) => i === idx ? { ...s, status: 'reading' as const } : s));
        const file = files[idx];
        const prepared = await prepareDocuments([file], (msg) => {
          if (mountedRef.current) setExtractionDetail(msg);
        });
        if (prepared.length > 0) documents.push(prepared[0]);
        setFileStatuses(prev => prev.map((s, i) => i === idx ? { ...s, status: 'done' as const } : s));
      }

      const hasContent = documents.some(d => d.text.trim().length > 0 || d.imageDataUris.length > 0);
      if (!hasContent) throw new Error("PDF_CONTENT_TOO_SHORT");

      const truncatedNotes = documents.map(d => d.truncatedNote).filter(Boolean) as string[];
      if (truncatedNotes.length > 0 && mountedRef.current) {
        setTruncationNote(truncatedNotes.join(' '));
      }

      // Step 1: Sending to AI
      if (!mountedRef.current) { clearTimeout(timerId); return; }
      setActiveStep(1);
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!idToken) throw new Error("UNAUTHORIZED");

      // Step 2: Generating questions (async job pipeline). Each tick is a
      // separate server-action invocation that performs exactly ONE Gemini
      // call, so no single request can hit Vercel's function timeout the way
      // the old monolithic call did (504 FUNCTION_INVOCATION_TIMEOUT).
      setStage('generating');
      setActiveStep(2);
      const created = await createForgeJob({
        documents,
        difficulty,
        questionCount,
        idToken,
      });
      if (created.error) {
        throw new Error(created.error);
      }

      let generated: GeneratedQuestion[] | null = null;

      if (created.status === 'done' && created.questions && created.questions.length > 0) {
        // Cache hit — identical source material was generated recently.
        generated = created.questions;
        if (mountedRef.current) setExtractionDetail(`Loaded ${created.questionCount} questions from cache`);
      } else if (created.jobId) {
        const jobId = created.jobId;
        let tick = null;
        while (mountedRef.current) {
          tick = await runForgeTick({ jobId, idToken });
          if (tick.status === 'done' || tick.status === 'failed') break;
          if (!mountedRef.current) break;
          setExtractionDetail(tick.progressNote && tick.progressNote !== 'Working…'
            ? `AI Forge: ${tick.progressNote}`
            : `AI Forge: ${tick.generatedCount}/${tick.questionCount} questions`);
          const delay = Math.min(Math.max(tick.retryAfterMs ?? 1500, 1000), 5000);
          await new Promise(r => setTimeout(r, delay));
        }
        if (mountedRef.current && tick && tick.status === 'done' && tick.questions && tick.questions.length > 0) {
          generated = tick.questions;
        } else {
          throw new Error(tick?.error || "AI_FAILED");
        }
      } else {
        throw new Error("AI_FAILED");
      }

      if (generated && generated.length > 0) {
        // Step 3: Reviewing answers (brief)
        if (!mountedRef.current) { clearTimeout(timerId); return; }
        setActiveStep(3);
        await new Promise(r => setTimeout(r, 400));
        clearTimeout(timerId);
        if (!mountedRef.current) return;
        setStage('complete');
        setActiveStep(-1);
        setFileStatuses([]);
        const truncatedHint = truncationNote ? ` (${truncationNote})` : '';
        toast({ title: "Generation Complete", description: `Created ${generated.length} questions from ${files.length} document(s).${truncatedHint}` });
        onQuestionsGenerated(generated, difficulty, documents, questionCount, category, files.length > 1 ? `${files[0].name} +${files.length - 1} more` : files[0]?.name);
      } else {
        throw new Error("AI_FAILED");
      }
    } catch (err: unknown) {
      clearTimeout(timerId);
      if (!mountedRef.current) return;
      setStage('error');
      const raw = err instanceof Error ? err.message : "Unable to generate questions. Please retry.";
      let msg = raw;
      let failedStep = 2;
      let guidance = 'Please retry. If it persists, try a different PDF or reduce the question count.';

      if (raw.includes("AI_FAILED")) {
        msg = "Unable to generate questions. Please retry.";
        failedStep = 2; guidance = 'The AI could not produce usable questions. Retry, or try reducing the question count.';
      } else if (raw.includes("413") || raw.includes("FUNCTION_PAYLOAD_TOO_LARGE") || raw.includes("payload too large")) {
        msg = "The extracted content still exceeded the server's 4.5 MB data limit. This usually means a very large scanned document. Try a shorter document or fewer scanned/image pages.";
        failedStep = 1; guidance = 'Use a shorter document, or reduce the number of scanned/image pages.';
      } else if (raw.includes("CLIENT_EXTRACT") || raw.includes("Could not unzip") || raw.includes("Could not load the PDF reader")) {
        msg = raw;
        failedStep = 0; guidance = 'Try a different file or re-export the document.';
      } else if (raw.includes("PDF_IMAGE_ONLY")) {
        msg = "This PDF appears to be scanned images with no text — try a text-based PDF or a different file.";
        failedStep = 0; guidance = 'This PDF has no selectable text layer (scanned images). Export the document as a text-based PDF or upload a different file.';
      } else if (raw.includes("PDF_CONTENT_TOO_SHORT")) {
        msg = "Not enough content was extracted. Ensure your files contain sufficient text for question generation.";
        failedStep = 0; guidance = 'Add more text content or try a different file.';
      } else if (raw.includes("PDF_EXTRACTION_TIMEOUT")) {
        msg = "Content extraction timed out. Try smaller or simpler files.";
        failedStep = 0; guidance = 'Use smaller files or split the document.';
      } else if (raw.includes("PDF_EXTRACTION_FAILED")) {
        msg = "Unable to read a file. It may be corrupted or use an unsupported format.";
        failedStep = 0; guidance = 'Try a different file or re-export the PDF.';
      } else if (raw.includes("PDF_ENCRYPTED")) {
        msg = "A PDF is encrypted or password-protected. Please upload unencrypted files.";
        failedStep = 0; guidance = 'Remove the password or export without encryption.';
      } else if (raw.includes("PDF_CORRUPTED")) {
        msg = "A file appears to be corrupted. Please try a different file.";
        failedStep = 0; guidance = 'Re-export or try a different file.';
      } else if (raw.includes("PDF_UNSUPPORTED")) {
        msg = "An unsupported file format was uploaded. Please check the files and try again.";
        failedStep = 0; guidance = 'Upload PDF, DOCX, TXT, MD, or images only.';
      } else if (raw.includes("UNAUTHORIZED")) {
        msg = "Your session has expired. Please log out and log back in.";
        failedStep = 1; guidance = 'Log out and sign back in, then retry.';
      } else if (raw.includes("PDF_TOO_LARGE")) {
        msg = "A file exceeds the maximum size limit on the server.";
        failedStep = 0; guidance = 'Use files under 10MB each.';
      } else if (raw.includes("PDF_FORGE_RATE_LIMITED") || raw.includes("FORGE_RATE_LIMITED")) {
        msg = "Rate limit reached (10 per minute). Please wait before trying again.";
        failedStep = 1; guidance = 'Wait a minute before retrying.';
      } else if (raw.includes("INVALID_PDF_DATA")) {
        msg = "Invalid file data. Please try uploading the file again.";
        failedStep = 0; guidance = 'Re-upload the file.';
      } else if (raw.includes("ALL_GEMINI_KEYS_EXHAUSTED") || raw.includes("GEMINI_QUOTA_EXCEEDED") || raw.includes("quota_exceeded") || raw.includes("quota") || raw.includes("429") || raw.includes("RESOURCE_EXHAUSTED")) {
        // Check for retryAfter in message
        const retryMatch = raw.match(/retry after ~?(\d+)s/i);
        const retryHint = retryMatch ? ` Retry after ~${retryMatch[1]}s.` : '';
        if (raw.includes("ALL_GEMINI_KEYS_EXHAUSTED")) {
          msg = `All AI capacity exhausted — all configured Gemini keys are temporarily quota-limited.${retryHint} Please wait a few minutes before retrying.`;
        } else {
          msg = `AI generation quota temporarily exhausted.${retryHint} Please wait a few minutes before retrying.`;
        }
        failedStep = 2; guidance = 'Wait a few minutes — quota will reset. Adding multiple GEMINI_API_KEYS (one per Google account) increases capacity: each key has its own free-tier quota.';
      } else if (raw.includes("GEMINI_API_KEY_MISSING") || raw.includes("API key")) {
        msg = "AI is not configured — Gemini API key missing. Contact your administrator.";
        failedStep = 1; guidance = 'Ask an admin to set GEMINI_API_KEYS in the environment.';
      } else if (raw.includes("PARSE_FAILED_")) {
        msg = "The AI returned unparseable output. Please retry.";
        failedStep = 3; guidance = 'Retry generation; the AI may succeed on a second attempt.';
      } else if (raw.includes("FORGE_JOB_NOT_FOUND")) {
        msg = "This generation job is no longer available. Please retry.";
        failedStep = 1; guidance = 'Start a new generation.';
      } else if (raw.includes("FORGE_OTHER")) {
        msg = "The AI could not produce questions this round. It will retry automatically — please keep this tab open.";
        failedStep = 2; guidance = 'Leave the tab open; if it still fails, retry with fewer questions.';
      } else if (raw.includes("TIMEOUT:") || raw.includes("timed out") || raw.includes("timed out after") || raw.includes("FORGE_TIMEOUT")) {
        const timeoutMatch = raw.match(/exceeded\s*(\d+)ms/i);
        const secHint = timeoutMatch ? ` after ${Math.round(parseInt(timeoutMatch[1],10)/1000)}s` : '';
        msg = `AI generation timed out${secHint}. Try with fewer questions or smaller files.`;
        failedStep = 2; guidance = 'Try fewer questions or smaller files.';
      }

      setStepError(failedStep);
      setFailedStepInfo({ step: failedStep, guidance });
      // Mark per-file error if extraction failed
      if (failedStep === 0) {
        setFileStatuses(prev => prev.map(s => s.status === 'reading' ? { ...s, status: 'error' as const } : s));
      }

      setError(msg);
      toast({ variant: 'destructive', title: `Failed at: ${PIPELINE_STEPS[failedStep]}`, description: msg });
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
            <CardDescription>Upload documents (PDF, DOCX, TXT, MD, images) to automatically generate quiz questions.</CardDescription>
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
          <Label className="text-lg font-medium">1. Source Material ({files.length > 0 ? `${files.length} file(s)` : ''})</Label>
          {files.length === 0 ? (
            <div className={cn(
              "border-2 border-dashed border-border/30 rounded-lg p-12 transition-all hover:border-primary/30 cursor-pointer flex flex-col items-center justify-center gap-4 text-center relative focus-within:outline-none focus-within:ring-2 focus-within:ring-ring",
              error && !error.includes("API key") && "border-destructive/30 bg-destructive/5"
            )}>
              <input 
                type="file" 
                accept={ACCEPTED_TYPES}
                multiple
                onChange={handleFileChange} 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                disabled={isGenerating}
              />
              <div className="bg-primary/5 p-4 rounded-full">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-lg">Upload document(s)</p>
                <p className="text-sm text-muted-foreground">Max 10MB each. Supports PDF, DOCX, TXT, MD, and images (PNG, JPG, GIF, WebP).</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((f, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-background/50 border border-border/20 rounded-lg">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="bg-primary/5 p-2 rounded-lg">
                      <FileText className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex flex-col truncate">
                      <span className="font-medium truncate">{f.name}</span>
                      <span className="text-xs text-muted-foreground">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => removeFile(idx)} 
                    disabled={isGenerating}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              ))}
              <label className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-border/30 rounded-lg cursor-pointer hover:bg-accent/30 text-sm text-muted-foreground transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-ring">
                <Upload className="w-4 h-4" />
                <span>Add more files</span>
                <input type="file" accept={ACCEPTED_TYPES} multiple onChange={handleFileChange} className="hidden" disabled={isGenerating} />
              </label>
            </div>
          )}
        </div>

        {showCategorySelector && (
          <div className="space-y-4">
            <Label className="text-lg font-medium">Category</Label>
            <Input
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="e.g. General, Physics, History"
              className="max-w-md"
            />
          </div>
        )}

        <div className="space-y-4">
          <Label className="text-lg font-medium">{showCategorySelector ? '3' : '2'}. Difficulty</Label>
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
                aria-pressed={difficulty === d.id}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all duration-300 ease-out text-center min-h-[7.5rem] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                  difficulty === d.id 
                    ? "bg-primary/5 border-primary" 
                    : "bg-background/30 border-border/40 hover:border-primary/30 hover:bg-primary/5"
                )}
              >
                <span className="text-3xl mb-1 transition-transform duration-300 group-hover:scale-110">{d.emoji}</span>
                <span className="font-bold uppercase tracking-widest text-sm">{d.label}</span>
                <span className="text-xs text-muted-foreground leading-tight">{d.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <Label className="text-lg font-medium">{showCategorySelector ? '4' : '3'}. Question Count</Label>
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
            disabled={isGenerating || !files.length || !difficulty}
            size="lg"
            className="w-full h-20 text-xl font-headline"
          >
            {isGenerating ? (
              <div className="flex flex-col items-center">
                <Loader2 className="animate-spin mb-1" />
                <span className="text-xs tracking-widest uppercase">
                  {activeStep >= 0 && activeStep < PIPELINE_STEPS.length ? PIPELINE_STEPS[activeStep] : STAGE_LABELS[stage]}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Sparkles className="w-6 h-6" />
                <span>Generate Questions</span>
              </div>
            )}
          </Button>

          {isGenerating && (
            <div className="mt-4 rounded-xl border bg-background/60 p-4 animate-in space-y-4" role="status" aria-live="polite">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                <p className="text-xs font-semibold text-foreground">Forging questions — {activeStep >= 0 ? PIPELINE_STEPS[activeStep] : STAGE_LABELS[stage]}</p>
                <span className="ml-auto text-[10px] text-muted-foreground">{activeStep >= 0 ? `Step ${activeStep + 1} of ${PIPELINE_STEPS.length}` : ''}</span>
              </div>
              {/* Pipeline steps */}
              <div className="grid grid-cols-4 gap-2">
                {PIPELINE_STEPS.map((label, idx) => {
                  const status: PipelineStepStatus = stepError === idx ? 'error' : idx < activeStep ? 'done' : idx === activeStep ? 'active' : 'pending';
                  return (
                    <div key={label} className={cn('flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition-all', status === 'active' ? 'border-primary bg-primary/5' : status === 'done' ? 'border-success/40 bg-success/5' : status === 'error' ? 'border-destructive bg-destructive/5' : 'border-border/50 bg-muted/20')}>
                      <div className={cn('flex items-center justify-center w-6 h-6 rounded-full text-xs', status === 'done' ? 'bg-success text-success-foreground' : status === 'active' ? 'bg-primary text-primary-foreground' : status === 'error' ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground')}>
                        {status === 'done' ? <Check className="w-3.5 h-3.5" /> : status === 'active' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : status === 'error' ? <AlertCircle className="w-3.5 h-3.5" /> : idx + 1}
                      </div>
                      <span className={cn('text-[10px] font-medium leading-tight', status === 'active' ? 'text-primary' : status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>{label}</span>
                    </div>
                  );
                })}
              </div>
              {/* Per-file extraction status */}
              {fileStatuses.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1"><FileText className="w-3 h-3" /> Files ({fileStatuses.filter(f => f.status === 'done').length}/{fileStatuses.length})</p>
                  {fileStatuses.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-background/50 border border-border/20 rounded px-2 py-1.5">
                      <span className="truncate flex-1">{f.name}</span>
                      {f.status === 'pending' && <span className="flex items-center gap-1 text-muted-foreground text-[10px]"><Clock className="w-3 h-3" /> Waiting</span>}
                      {f.status === 'reading' && <span className="flex items-center gap-1 text-primary text-[10px]"><Loader2 className="w-3 h-3 animate-spin" /> Reading</span>}
                      {f.status === 'done' && <span className="flex items-center gap-1 text-success text-[10px]"><Check className="w-3 h-3" /> Done</span>}
                      {f.status === 'error' && <span className="flex items-center gap-1 text-destructive text-[10px]"><AlertCircle className="w-3 h-3" /> Failed</span>}
                    </div>
                  ))}
                </div>
              )}
              {extractionDetail && (
                <div className="flex items-center gap-1.5 text-[11px] text-primary font-medium">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {extractionDetail}
                </div>
              )}
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                Processing in small batches — you can keep this tab open for live progress.
              </div>
            </div>
          )}

          {error && !error.includes("API key") && (
            <div className="mt-4 flex flex-col gap-3 bg-destructive/5 p-4 rounded-lg border border-destructive/10 animate-in">
              <div className="flex items-center gap-2 text-destructive font-bold text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {failedStepInfo !== null ? `Failed at: ${PIPELINE_STEPS[failedStepInfo.step]}` : 'Generation Failed'}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{error}</p>
              {failedStepInfo && (
                <p className="text-xs bg-background/60 border border-border/20 rounded p-2 leading-relaxed">
                  <span className="font-semibold">What to try: </span>{failedStepInfo.guidance}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating || !files.length || !difficulty} className="w-fit">
                  <RefreshCw className="w-3 h-3 mr-2" /> Retry
                </Button>
                {failedStepInfo?.step === 0 && (
                  <Button variant="ghost" size="sm" onClick={() => { setFiles([]); setFileStatuses([]); setError(null); setFailedStepInfo(null); setStepError(null); setActiveStep(-1); }} className="w-fit text-xs">Try a different PDF</Button>
                )}
                {failedStepInfo?.step !== 0 && questionCount > 5 && (
                  <Button variant="ghost" size="sm" onClick={() => { setQuestionCount(v => Math.max(5, v - 5)); }} className="w-fit text-xs">Reduce to {Math.max(5, questionCount - 5)} questions</Button>
                )}
              </div>
            </div>
          )}

          {truncationNote && (
            <div className="flex items-start gap-2 bg-primary/5 p-3 rounded-lg border border-primary/10 text-xs text-muted-foreground animate-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-primary" />
              <span>{truncationNote}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
