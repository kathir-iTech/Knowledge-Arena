'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle2, XCircle, Eye, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PreviewQuestion {
  text: string;
  options: string[];
  correctAnswerIndex?: number | null;
  timer?: number;
  difficulty?: string;
  tags?: string;
  explanation?: string;
}

interface QuestionPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: PreviewQuestion | null;
  questionIndex?: number;
  totalQuestions?: number;
}

const difficultyColor: Record<string, string> = {
  easy: 'text-success bg-success/5 border-success/20',
  medium: 'text-warning bg-warning/5 border-warning/20',
  moderate: 'text-primary bg-primary/5 border-primary/20',
  hard: 'text-destructive bg-destructive/5 border-destructive/20',
};

export function QuestionPreviewModal({ open, onOpenChange, question, questionIndex = 0, totalQuestions }: QuestionPreviewModalProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [reveal, setReveal] = useState(false);

  React.useEffect(() => {
    if (open) {
      setSelected(null);
      setReveal(false);
    }
  }, [open, question]);

  if (!question) return null;

  const timer = question.timer ?? 30;
  const hasReveal = typeof question.correctAnswerIndex === 'number' && question.correctAnswerIndex >= 0;
  const showReveal = reveal && hasReveal;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-[18px]">
        <div className="p-6 pb-4 border-b border-border/20 bg-gradient-to-b from-primary/5 to-transparent">
          <DialogHeader className="text-left space-y-2">
            <div className="flex items-center gap-2">
              <div className="bg-warning/10 p-2 rounded-lg">
                <Eye className="w-4 h-4 text-warning" />
              </div>
              <Badge variant="outline" className="text-[10px] h-5 uppercase tracking-wider">Preview as Gladiator</Badge>
              {totalQuestions ? (
                <span className="text-xs text-muted-foreground font-medium">
                  Question {questionIndex + 1} / {totalQuestions}
                </span>
              ) : null}
            </div>
            <DialogTitle className="text-lg font-headline leading-tight">
              Live battle preview — exactly as gladiators see it
            </DialogTitle>
            <DialogDescription className="text-sm">
              Styled with the Phase 89 LiveQuiz answer grid (rounded-[14px] border-2). Select an option to test the interaction, then reveal the correct answer.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-5">
          {/* Timer bar — mirrors LiveQuiz CountdownTimer */}
          <div
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-[12px] border transition-colors',
              reveal && hasReveal ? 'bg-success/5 border-success/15' : 'bg-card border-border/50'
            )}
            role="timer"
            aria-live="polite"
          >
            <Clock className={cn('w-4 h-4 shrink-0', reveal && hasReveal ? 'text-success' : 'text-muted-foreground')} />
            <span className={cn('font-mono text-lg font-bold tabular-nums', reveal && hasReveal ? 'text-success' : 'text-foreground')}>{timer}</span>
            <span className="text-sm text-muted-foreground">seconds remaining</span>
            <div className="ml-auto flex items-center gap-1.5">
              {question.difficulty && (
                <Badge variant="outline" className={cn('text-[10px] h-5 capitalize', difficultyColor[question.difficulty] || '')}>
                  {question.difficulty}
                </Badge>
              )}
              <Trophy className="w-3.5 h-3.5 text-warning" />
            </div>
          </div>

          {/* Question text — same as LiveQuiz CardHeader */}
          <div className="text-center py-2">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Question {questionIndex + 1} {totalQuestions ? `/ ${totalQuestions}` : ''}
              </span>
              <div className="flex gap-1" aria-hidden="true">
                {totalQuestions
                  ? Array.from({ length: Math.min(totalQuestions, 10) }).map((_, i) => (
                      <div
                        key={i}
                        className={cn('w-2 h-2 rounded-full', i === questionIndex ? 'bg-primary/60 scale-125' : i < questionIndex ? 'bg-primary' : 'bg-muted-foreground/20')}
                      />
                    ))
                  : null}
              </div>
            </div>
            <h3 className="text-xl sm:text-2xl font-headline leading-snug tracking-tight">{question.text}</h3>
            {question.tags && (
              <p className="text-xs text-muted-foreground mt-2">Tags: {question.tags}</p>
            )}
          </div>

          {/* Answer grid — exact LiveQuiz styling: rounded-[14px] border-2 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {question.options.map((opt, i) => {
              const isSelected = selected === i;
              const isCorrect = hasReveal && question.correctAnswerIndex === i;
              const isWrongPick = showReveal && isSelected && !isCorrect;
              const isRevealedCorrect = showReveal && isCorrect;

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => !showReveal && setSelected(i)}
                  disabled={showReveal}
                  aria-pressed={isSelected}
                  aria-label={`Option ${String.fromCharCode(65 + i)}: ${opt}`}
                  className={cn(
                    'group relative flex flex-col gap-2 p-3 md:p-5 rounded-[14px] border-2 text-left transition-all duration-300 ease-out min-h-14 md:min-h-[5.5rem] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                    isRevealedCorrect
                      ? 'border-success bg-success/10 shadow-elevation-small animate-in'
                      : isWrongPick
                        ? 'border-destructive bg-destructive/10 shadow-elevation-small animate-in'
                        : showReveal
                          ? 'border-border/30 bg-muted/10 opacity-40'
                          : isSelected
                            ? 'border-primary bg-primary/5 shadow-elevation-small ring-1 ring-primary/20'
                            : 'border-border/50 bg-card hover:border-primary/30 hover:bg-primary/5 hover:shadow-elevation-small hover:-translate-y-0.5 cursor-pointer active:scale-[0.98]'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        'shrink-0 flex items-center justify-center w-8 h-8 rounded-[10px] text-sm font-bold font-mono transition-all duration-300',
                        isRevealedCorrect
                          ? 'bg-success text-success-foreground shadow-elevation-small'
                          : isWrongPick
                            ? 'bg-destructive text-destructive-foreground shadow-elevation-small'
                            : isSelected
                              ? 'bg-primary text-primary-foreground shadow-elevation-small'
                              : 'bg-primary/10 text-primary group-hover:bg-primary/20 group-hover:scale-105'
                      )}
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="flex-1 text-sm md:text-base font-medium leading-snug">{opt}</span>
                    {isRevealedCorrect && <CheckCircle2 className="w-5 h-5 text-success shrink-0 animate-in" aria-label="Correct answer" />}
                    {isWrongPick && <XCircle className="w-5 h-5 text-destructive shrink-0 animate-in" aria-label="Your answer was incorrect" />}
                    {!showReveal && isSelected && <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>

          {showReveal && question.explanation && (
            <div className="p-3 rounded-[10px] bg-muted/30 border border-border/50 text-sm">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Explanation</p>
              <p className="text-muted-foreground">{question.explanation}</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="text-xs text-muted-foreground">
              {selected !== null ? (
                <span>
                  Selected: <strong className="text-foreground">{String.fromCharCode(65 + selected)}</strong>
                  {showReveal && hasReveal
                    ? selected === question.correctAnswerIndex
                      ? ' — Correct!'
                      : ` — Correct is ${String.fromCharCode(65 + (question.correctAnswerIndex as number))}`
                    : ' — tap Reveal to see the answer'}
                </span>
              ) : (
                'Pick an option to simulate the gladiator flow.'
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {hasReveal && (
                <Button
                  variant={reveal ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setReveal(v => !v)}
                  aria-pressed={reveal}
                >
                  {reveal ? (
                    <>
                      <XCircle className="w-4 h-4 mr-1.5" /> Hide Answer
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-1.5" /> Reveal Answer
                    </>
                  )}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
