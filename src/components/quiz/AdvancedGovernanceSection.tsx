'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, Shield, Eye, EyeOff, Clock, Users, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type RevealTiming = 'after_timer' | 'never_during_battle';
export type AntiCheatStrictness = 'warn_only' | 'auto_flag';

export interface AdvancedGovernanceState {
  revealTiming: RevealTiming;
  showLiveLeaderboard: boolean;
  allowLateJoin: boolean;
  negativeMarking: boolean;
  antiCheatStrictness: AntiCheatStrictness;
}

export const DEFAULT_ADVANCED_GOVERNANCE: AdvancedGovernanceState = {
  revealTiming: 'after_timer',
  showLiveLeaderboard: true,
  allowLateJoin: true,
  negativeMarking: false,
  antiCheatStrictness: 'warn_only',
};

export function toGovernanceConfig(s: AdvancedGovernanceState) {
  return {
    reveal_timing: s.revealTiming,
    show_live_leaderboard: s.showLiveLeaderboard,
    allow_late_join: s.allowLateJoin,
    negative_marking: s.negativeMarking,
    anti_cheat_strictness: s.antiCheatStrictness,
  };
}

export function normalizeGovernanceConfig(raw?: Record<string, unknown> | null): AdvancedGovernanceState {
  if (!raw) return { ...DEFAULT_ADVANCED_GOVERNANCE };
  return {
    revealTiming: raw.reveal_timing === 'never_during_battle' ? 'never_during_battle' : 'after_timer',
    showLiveLeaderboard: typeof raw.show_live_leaderboard === 'boolean' ? raw.show_live_leaderboard : true,
    allowLateJoin: typeof raw.allow_late_join === 'boolean' ? raw.allow_late_join : true,
    negativeMarking: typeof raw.negative_marking === 'boolean' ? raw.negative_marking : false,
    antiCheatStrictness: raw.anti_cheat_strictness === 'auto_flag' ? 'auto_flag' : 'warn_only',
  };
}

interface AdvancedGovernanceSectionProps {
  value: AdvancedGovernanceState;
  onChange: (next: AdvancedGovernanceState) => void;
  className?: string;
}

/**
 * Collapsible "Advanced Governance" control — sibling to AdvancedScoringSection (Phase 106D).
 * Reuses the same collapsible Card pattern, shared across manual QuizCreatorForm and
 * AI Forge QuestionReviewPanel so both creation paths expose the same toggles and
 * persist the same governance_config shape to quizzes/{quizId}/config/settings.
 */
export function AdvancedGovernanceSection({ value, onChange, className }: AdvancedGovernanceSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <Card className={cn('border-primary/20', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/20 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Shield className="w-4 h-4 text-primary" /> Advanced Governance
          <Badge variant="outline" className="text-[10px]">Optional</Badge>
        </span>
        <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <CardContent className="space-y-5 pt-0">
          <p className="text-xs text-muted-foreground">Defaults match current behavior — existing arenas are unaffected.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* reveal_timing */}
            <div className="space-y-1.5 rounded-[10px] border border-border/40 p-3 bg-muted/20">
              <Label className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Reveal Timing</Label>
              <Select value={value.revealTiming} onValueChange={(v) => onChange({ ...value, revealTiming: v as RevealTiming })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="after_timer">After timer</SelectItem>
                  <SelectItem value="never_during_battle">Never during battle</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">When gladiators see correct/incorrect feedback</p>
            </div>

            {/* show_live_leaderboard */}
            <div className="flex flex-row items-center justify-between rounded-[10px] border border-border/40 p-3 bg-muted/20">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-1.5">{value.showLiveLeaderboard ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />} Live Leaderboard</Label>
                <p className="text-xs text-muted-foreground">Show standings during the battle</p>
              </div>
              <Switch
                checked={value.showLiveLeaderboard}
                onCheckedChange={(c) => onChange({ ...value, showLiveLeaderboard: c })}
              />
            </div>

            {/* allow_late_join */}
            <div className="flex flex-row items-center justify-between rounded-[10px] border border-border/40 p-3 bg-muted/20">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Allow Late Join</Label>
                <p className="text-xs text-muted-foreground">Gladiators can join after the battle starts</p>
              </div>
              <Switch
                checked={value.allowLateJoin}
                onCheckedChange={(c) => onChange({ ...value, allowLateJoin: c })}
              />
            </div>

            {/* negative_marking */}
            <div className="flex flex-row items-center justify-between rounded-[10px] border border-border/40 p-3 bg-muted/20">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Negative Marking</Label>
                <p className="text-xs text-muted-foreground">Wrong answers subtract points</p>
              </div>
              <Switch
                checked={value.negativeMarking}
                onCheckedChange={(c) => onChange({ ...value, negativeMarking: c })}
              />
            </div>

            {/* anti_cheat_strictness */}
            <div className="space-y-1.5 rounded-[10px] border border-border/40 p-3 bg-muted/20 md:col-span-2">
              <Label className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Anti-Cheat Strictness</Label>
              <Select value={value.antiCheatStrictness} onValueChange={(v) => onChange({ ...value, antiCheatStrictness: v as AntiCheatStrictness })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="warn_only">Warn only — notify Commander, let gladiator continue</SelectItem>
                  <SelectItem value="auto_flag">Auto-flag — mark participant as flagged for Commander review</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">How repeated focus-loss violations are handled</p>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
