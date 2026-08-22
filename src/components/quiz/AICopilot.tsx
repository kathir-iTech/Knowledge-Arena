'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';
import { Sparkles, Send, Loader2, Lightbulb, Copy, Check, Wand2, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CopilotQuestion {
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

interface AICopilotProps {
  titleContext?: string;
  questionContext?: string;
  onApplyQuestion?: (q: CopilotQuestion) => void;
  className?: string;
  compact?: boolean;
}

export function AICopilot({ titleContext, questionContext, onApplyQuestion, className, compact }: AICopilotProps) {
  const { auth } = useFirebase();
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ suggestion: string; generatedQuestion: CopilotQuestion | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(!compact);

  const handleAsk = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      toast({ variant: 'warning', title: 'Enter a message', description: 'Ask the Copilot how to improve or generate a question.' });
      return;
    }
    if (!auth.currentUser) {
      toast({ variant: 'destructive', title: 'Not signed in', description: 'Please sign in again.' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userMessage: trimmed,
          questionContext: questionContext || undefined,
          titleContext: titleContext || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Copilot failed');
      setResult({ suggestion: data.suggestion, generatedQuestion: data.generatedQuestion });
      toast({ title: 'Copilot responded', description: data.suggestion?.slice(0, 80) || 'Suggestion ready.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Copilot error', description: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({ title: 'Copied' });
    } catch {
      toast({ variant: 'destructive', title: 'Copy failed' });
    }
  };

  if (compact && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className={cn('group flex items-center gap-2 w-full p-3 rounded-[12px] border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors text-sm font-medium', className)}
      >
        <Sparkles className="w-4 h-4 text-primary" />
        Need help writing a question? Ask the Copilot
        <span className="ml-auto text-xs text-muted-foreground group-hover:text-primary">Open →</span>
      </button>
    );
  }

  return (
    <Card className={cn('border-primary/20 bg-gradient-to-br from-primary/[0.04] to-transparent', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="w-7 h-7 rounded-[8px] bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          AI Copilot
          <Badge variant="outline" className="text-[10px] ml-auto">Gemini 3.6 Flash</Badge>
          {compact && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setExpanded(false)}>
              Minimize
            </Button>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground leading-relaxed">
          You are an expert quiz question writer. Help the Commander improve, rephrase, or generate new questions for their arena.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {questionContext && (
          <div className="p-2.5 rounded-[10px] bg-muted/30 border border-border/40">
            <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3" /> Current question context
            </p>
            <p className="text-xs mt-1 line-clamp-3 text-foreground/80">{questionContext}</p>
          </div>
        )}
        <div className="space-y-2">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="E.g. 'Rephrase this to be more challenging' or 'Generate a question about photosynthesis'"
            className="min-h-[72px] text-sm"
            disabled={loading}
          />
          <div className="flex gap-2">
            <Button onClick={handleAsk} disabled={loading || !message.trim()} size="sm" className="flex-1">
              {loading ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-2" />}
              {loading ? 'Asking Copilot...' : 'Ask Copilot'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMessage('')} disabled={loading || !message}>
              Clear
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['Make it harder', 'Suggest 4 options', 'Simplify wording', 'Add explanation'].map((s) => (
              <button
                key={s}
                onClick={() => setMessage(s)}
                className="text-[11px] px-2 py-1 rounded-full border border-border bg-background hover:bg-muted transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {result && (
          <div className="space-y-3 pt-2 border-t border-border/40">
            <div className="flex items-start gap-2 p-3 rounded-[10px] bg-primary/5 border border-primary/15">
              <Lightbulb className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <p className="text-sm leading-relaxed">{result.suggestion}</p>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleCopy(result.suggestion)}>
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </Button>
            </div>
            {result.generatedQuestion && (
              <div className="p-3 rounded-[10px] bg-background border border-border/50 space-y-2">
                <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                  <Wand2 className="w-3 h-3" /> Suggested Question
                </p>
                <p className="text-sm font-medium leading-relaxed">{result.generatedQuestion.text}</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {result.generatedQuestion.options.map((opt, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] border text-xs',
                        i === result.generatedQuestion!.correctAnswerIndex
                          ? 'bg-success/10 border-success/30 text-success'
                          : 'bg-muted/30 border-border/40'
                      )}
                    >
                      <span className="font-mono font-bold">{String.fromCharCode(65 + i)}</span>
                      <span className="flex-1">{opt}</span>
                      {i === result.generatedQuestion!.correctAnswerIndex && <Badge variant="outline" className="text-[10px] h-4 border-success/40 text-success">Correct</Badge>}
                    </div>
                  ))}
                </div>
                {result.generatedQuestion.explanation && (
                  <p className="text-xs text-muted-foreground italic bg-muted/20 p-2 rounded-[8px]">{result.generatedQuestion.explanation}</p>
                )}
                <div className="flex gap-2">
                  {onApplyQuestion && (
                    <Button size="sm" onClick={() => onApplyQuestion(result.generatedQuestion!)} className="flex-1">
                      <Wand2 className="w-3.5 h-3.5 mr-1.5" /> Use this question
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => handleCopy(JSON.stringify(result.generatedQuestion, null, 2))}>
                    <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy JSON
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TODO if API key missing: show disabled state with docs link — no silent dead UI */}
        {!auth.currentUser && (
          <p className="text-[11px] text-muted-foreground">Sign in as Commander to use the Copilot (Gemini free-tier).</p>
        )}
      </CardContent>
    </Card>
  );
}
