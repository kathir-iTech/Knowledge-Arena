'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExplanationProps {
  quizId: string;
  questionId: string;
  wrongOptionIndex: number;
}

export function WrongAnswerExplanation({ quizId, questionId, wrongOptionIndex }: ExplanationProps) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExplanation = useCallback(async () => {
    if (explanation) {
      setExpanded(!expanded);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { initializeFirebase } = await import('@/firebase');
      const { auth } = initializeFirebase();
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setError('Not authenticated');
        return;
      }
      const res = await fetch('/api/quiz/explanation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ quizId, questionId, wrongOptionIndex }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to get explanation');
        return;
      }
      setExplanation(data.explanation);
      setExpanded(true);
    } catch {
      setError('Failed to load explanation');
    } finally {
      setLoading(false);
    }
  }, [quizId, questionId, wrongOptionIndex, explanation, expanded]);

  return (
    <div className="mt-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={fetchExplanation}
        disabled={loading}
        className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-primary"
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : explanation && expanded ? (
          <ChevronUp className="w-3 h-3" />
        ) : explanation ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <Sparkles className="w-3 h-3" />
        )}
        {explanation ? (expanded ? 'Hide' : 'Show') : 'Explain this'}
      </Button>
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      {explanation && expanded && (
        <div className={cn(
          'mt-2 p-3 rounded-xl bg-primary/5 border border-primary/10 text-sm leading-relaxed text-foreground/80 animate-in',
        )}>
          <div className="flex items-center gap-1.5 mb-2 text-[10px] text-primary/70 font-medium uppercase tracking-wider">
            <Sparkles className="w-3 h-3" />
            Powered by AI
          </div>
          <p className="whitespace-pre-line">{explanation}</p>
        </div>
      )}
    </div>
  );
}
