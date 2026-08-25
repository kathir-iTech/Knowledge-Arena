'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ChevronDown, Trophy, Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AdvancedScoringState {
  timeBonus: boolean;
  streakMultiplier: number;
  scoreMax: number;
  scoreMin: number;
}

export const DEFAULT_ADVANCED_SCORING: AdvancedScoringState = {
  timeBonus: true,
  streakMultiplier: 0,
  scoreMax: 1000,
  scoreMin: 100,
};

// Maps the public UI shape to the persisted scoring_config document shape
// (Phase 94: written to quizzes/{quizId}/config/settings, never the parent doc).
export function toScoringConfig(s: AdvancedScoringState) {
  return {
    score_max: s.scoreMax,
    score_min: s.scoreMin,
    time_decay: s.timeBonus,
    streak_multiplier: s.streakMultiplier,
  };
}

interface AdvancedScoringSectionProps {
  value: AdvancedScoringState;
  onChange: (next: AdvancedScoringState) => void;
  className?: string;
}

/**
 * Collapsible "Advanced Scoring" control shared by the manual QuizCreatorForm
 * (Phase 99B) and the AI Forge QuestionReviewPanel (Phase 106, Workstream D) so
 * both creation paths expose the same options and write the same score_max /
 * score_min / time_decay / streak_multiplier shape. Kept framework-agnostic
 * (controlled value/onChange) so it can sit inside either a react-hook-form
 * tree or plain component state without duplication.
 */
export function AdvancedScoringSection({ value, onChange, className }: AdvancedScoringSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <Card className={cn('border-warning/20', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/20 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Trophy className="w-4 h-4 text-warning" /> Advanced Scoring
          <Badge variant="outline" className="text-[10px]">Optional</Badge>
        </span>
        <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <CardContent className="space-y-5 pt-0">
          <p className="text-xs text-muted-foreground">Defaults match current behavior — existing arenas are unaffected.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-row items-center justify-between rounded-[10px] border border-border/40 p-3 bg-muted/20">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-1.5"><Clock3 className="w-3.5 h-3.5" /> Time Bonus</Label>
                <p className="text-xs text-muted-foreground">Faster correct answers earn more points</p>
              </div>
              <Switch
                checked={value.timeBonus}
                onCheckedChange={(c) => onChange({ ...value, timeBonus: c })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" /> Streak Multiplier</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={value.streakMultiplier}
                onChange={(e) => onChange({ ...value, streakMultiplier: Number(e.target.value) || 0 })}
              />
              <p className="text-xs text-muted-foreground">Bonus = streak × multiplier (0 = disabled)</p>
            </div>
            <div className="space-y-1.5">
              <Label>Max Score (fastest)</Label>
              <Input
                type="number"
                value={value.scoreMax}
                onChange={(e) => onChange({ ...value, scoreMax: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Min Score (slowest)</Label>
              <Input
                type="number"
                value={value.scoreMin}
                onChange={(e) => onChange({ ...value, scoreMin: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
