'use client';

import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Eye, Users, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { invertPermutation } from '@/lib/battle-machine';
import { isOnline, rankParticipants } from '@/lib/command-center';
import type { CommandBattle } from '@/lib/command-center';

interface Props {
  battle: CommandBattle | null;
  now: number;
  open: boolean;
  onClose: () => void;
}

function isValidPerm(perm: unknown, len: number): perm is number[] {
  if (!Array.isArray(perm) || perm.length !== len || len === 0) return false;
  const seen = new Set<number>();
  for (const v of perm) {
    if (typeof v !== 'number' || v < 0 || v >= len || seen.has(v)) return false;
    seen.add(v);
  }
  return true;
}

/**
 * Read-only live spectator drawer.
 *
 * Shows the canonical (un-shuffled) options for the current question plus
 * submission density. Per-glidator shuffled views are mapped back with
 * i_orig = P^{-1}(i_shuffled) via invertPermutation — pure inversion, no
 * battle-server transaction, no RTDB shadow stream, no writes.
 */
export function SpectatorDrawer({ battle, now, open, onClose }: Props) {
  const currentQ = useMemo(() => {
    if (!battle || battle.questions.length === 0) return null;
    return battle.questions.find(q => q.index === battle.current)
      ?? [...battle.questions].sort((a, b) => a.index - b.index)[0]
      ?? null;
  }, [battle]);

  const answeredUids = useMemo(() => {
    if (!battle || !currentQ) return new Set<string>();
    return new Set(battle.participants.filter(p => p.answeredIds.includes(currentQ.id)).map(p => p.uid));
  }, [battle, currentQ]);

  const density = useMemo(() => {
    if (!battle || !currentQ) return { answered: 0, total: 0, pct: 0 };
    const total = battle.participants.filter(p => p.status !== 'blocked').length;
    const answered = [...answeredUids].length;
    return { answered, total, pct: total > 0 ? Math.round((answered / total) * 100) : 0 };
  }, [battle, currentQ, answeredUids]);

  const optionRows = useMemo(() => {
    if (!currentQ?.options || currentQ.options.length === 0) return [];
    const counts = Array.isArray(currentQ.questionStats?.optionCounts)
      ? (currentQ.questionStats!.optionCounts as number[])
      : [];
    const submitted = currentQ.questionStats?.submittedCount ?? density.answered;
    const denom = Math.max(1, submitted, density.total);
    return currentQ.options.map((text, origIdx) => ({
      origIdx,
      text,
      count: counts[origIdx] ?? 0,
      pct: Math.round(((counts[origIdx] ?? 0) / denom) * 100),
      isKey: currentQ.questionStats?.correctOptionIndex === origIdx,
    }));
  }, [currentQ, density]);

  // Demonstrate P^{-1} mapping for up to 3 shuffled spectators.
  const shuffleDemos = useMemo(() => {
    if (!battle || !currentQ || !currentQ.options) return [];
    const len = currentQ.options.length;
    const out: Array<{ uid: string; name: string; perm: number[]; inv: number[] }> = [];
    for (const p of battle.participants) {
      if (out.length >= 3) break;
      const perm = p.optionShuffle?.[currentQ.id];
      if (!isValidPerm(perm, len)) continue;
      // i_orig = P^{-1}(i_shuffled): invert once, index by shuffled position.
      const inv = invertPermutation(perm);
      out.push({ uid: p.uid, name: p.name || p.uid.slice(0, 8), perm: [...perm], inv });
    }
    return out;
  }, [battle, currentQ]);

  const hasShuffle = shuffleDemos.length > 0;
  const leaderboard = battle ? rankParticipants(battle.participants).slice(0, 8) : [];

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto custom-scrollbar">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Eye className="w-4 h-4 text-primary" /> Live Spectator
          </SheetTitle>
          <SheetDescription>
            Read-only view — live via the existing Firestore onSnapshot. No writes.
          </SheetDescription>
        </SheetHeader>

        {!battle || !currentQ ? (
          <p className="text-sm text-muted-foreground mt-6">No active question to spectate.</p>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-headline font-bold truncate flex-1 min-w-0">{battle.title}</p>
                <Badge variant="outline" className="text-[10px] capitalize">{battle.status}</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                Q{(battle.current >= 0 ? battle.current + 1 : 1)}/{battle.questionCount} · {battle.mode.replace(/_/g, ' ')}
              </p>
            </div>

            {/* Submission density */}
            <div className="rounded-[12px] border border-border/50 bg-muted/20 p-3">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                <span className="flex items-center gap-1"><Users className="w-3 h-3" /> Submission density</span>
                <span className="font-mono tabular-nums">{density.answered}/{density.total} · {density.pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full transition-all duration-700" style={{ width: `${density.pct}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Answered = answeredIds contains current question id · live from participants snapshot.
              </p>
            </div>

            {/* Canonical options + per-option density */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold">Canonical options (un-shuffled)</p>
              {optionRows.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Question text is not published to spectators for this arena.</p>
              ) : (
                optionRows.map(row => (
                  <div key={row.origIdx} className={cn(
                    'rounded-[10px] border p-2.5',
                    row.isKey ? 'border-success/40 bg-success/10' : 'border-border/40 bg-background'
                  )}>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={cn(
                        'w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0',
                        row.isKey ? 'bg-success text-background' : 'bg-muted text-muted-foreground'
                      )}>
                        {String.fromCharCode(65 + row.origIdx)}
                      </span>
                      <span className="flex-1 min-w-0 truncate">{row.text}</span>
                      {row.isKey && <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />}
                      <span className="font-mono text-muted-foreground tabular-nums shrink-0">{row.count} · {row.pct}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary/70 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, row.pct)}%` }} />
                    </div>
                  </div>
                ))
              )}
              <p className="text-[10px] text-muted-foreground">
                Counts from questionStats.optionCounts when evaluated; otherwise live answered density above.
              </p>
            </div>

            {/* Shuffle inversion explanation */}
            <div className="rounded-[12px] border border-border/50 bg-muted/20 p-3">
              <p className="text-[11px] font-semibold font-mono">i_orig = P<sup>-1</sup>(i_shuffled)</p>
              {!hasShuffle ? (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Synchronized mode — every gladiator sees canonical order (P = identity), so no inversion is needed.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {shuffleDemos.map(d => (
                    <div key={d.uid} className="text-[11px]">
                      <p className="font-medium truncate">{d.name}</p>
                      <p className="font-mono text-muted-foreground">P = [{d.perm.join(', ')}] → P⁻¹ = [{d.inv.join(', ')}]</p>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground">
                    P is participant.option_shuffle[questionId]; inverted once with invertPermutation for density mapping.
                  </p>
                </div>
              )}
            </div>

            {/* Mini leaderboard with current-question state */}
            <div>
              <p className="text-[11px] font-semibold mb-1.5">Top gladiators (live)</p>
              <div className="space-y-1">
                {leaderboard.map((p, idx) => {
                  const answered = answeredUids.has(p.uid);
                  return (
                    <div key={p.uid} className="flex items-center gap-2 p-2 rounded-[10px] bg-muted/30 text-xs">
                      <span className="w-5 text-center font-bold tabular-nums text-muted-foreground">{idx + 1}</span>
                      <span className="flex-1 min-w-0 truncate font-medium">{p.name || p.uid.slice(0, 8)}</span>
                      <span className={cn('w-2 h-2 rounded-full shrink-0', isOnline(p.lastSeen, now) ? 'bg-success' : 'bg-muted-foreground/30')} />
                      <Badge variant="outline" className={cn('text-[9px] h-4', answered ? 'border-success/40 text-success' : '')}>
                        {answered ? 'answered' : 'waiting'}
                      </Badge>
                      <span className="font-bold tabular-nums w-10 text-right">{p.score}</span>
                    </div>
                  );
                })}
                {leaderboard.length === 0 && <p className="text-[11px] text-muted-foreground">No players yet.</p>}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
