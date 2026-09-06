'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { History, Play, Pause, StepBack, StepForward, RotateCcw, Trophy, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ReplayQuestion {
  id: string;
  text?: string;
  options?: string[];
  correctAnswerIndex?: number | null;
  questionStats?: {
    submittedCount?: number;
    correctCount?: number;
    optionCounts?: number[] | Record<string, number> | null;
  } | null;
}

export interface ReplaySubmission {
  questionId: string | null;
  selectedOption: number | null;
  submittedAt: number | null;
}

export interface ReplayParticipant {
  userId: string;
  name: string | null;
  score?: number;
  submissions?: ReplaySubmission[];
}

export interface ReplayLogEvent {
  id: string;
  event?: string;
  actor?: string | null;
  timestamp?: number | null;
  metadata?: Record<string, unknown>;
}

export interface ReplayEngagement {
  gladiatorId: string;
  name: string;
  progression: number[];
  total: number;
}

interface Props {
  questions: ReplayQuestion[];
  participants: ReplayParticipant[];
  timeline?: ReplayLogEvent[];
  engagement?: ReplayEngagement[] | null;
  startedAt?: number | null;
  endedAt?: number | null;
  title?: string;
}

const TRAJ_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];

function formatTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString();
}

function optionCountAt(stats: ReplayQuestion['questionStats'], idx: number): number {
  if (!stats?.optionCounts) return 0;
  if (Array.isArray(stats.optionCounts)) return stats.optionCounts[idx] ?? 0;
  return (stats.optionCounts as Record<string, number>)[String(idx)] ?? 0;
}

/**
 * Read-only replay engine.
 *
 * State(t) = State(0) + Σ Δe_k · I(t_k <= t)
 *
 * Δe_k are submission deltas (one per gladiator-question submission with a
 * numeric submittedAt). No writes, no live subscriptions — pure derivation
 * from already-fetched battle_logs (timeline) + submissionsByUserId +
 * questionStats aggregates.
 */
export function BattleReplay({ questions, participants, timeline = [], engagement = null, startedAt = null, endedAt = null, title = 'Battle Replay' }: Props) {
  const keyByQuestion = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const q of questions) m.set(q.id, q.correctAnswerIndex ?? null);
    return m;
  }, [questions]);

  // Flattened submission deltas, oldest first. Null-timestamp submissions are
  // final-state only (excluded from time filtering, included at t = max).
  const flatSubs = useMemo(() => {
    const out: Array<{ userId: string; questionId: string; selectedOption: number; submittedAt: number | null; correct: boolean }> = [];
    for (const p of participants) {
      for (const s of p.submissions ?? []) {
        if (!s.questionId || s.selectedOption === null || s.selectedOption === undefined) continue;
        const key = keyByQuestion.get(s.questionId) ?? null;
        out.push({
          userId: p.userId,
          questionId: s.questionId,
          selectedOption: s.selectedOption,
          submittedAt: typeof s.submittedAt === 'number' ? s.submittedAt : null,
          correct: key !== null && key !== undefined && s.selectedOption === key,
        });
      }
    }
    out.sort((a, b) => (a.submittedAt ?? Number.MAX_SAFE_INTEGER) - (b.submittedAt ?? Number.MAX_SAFE_INTEGER));
    return out;
  }, [participants, keyByQuestion]);

  const timedSubs = useMemo(() => flatSubs.filter(s => typeof s.submittedAt === 'number'), [flatSubs]);

  const distinctTimes = useMemo(() => {
    const set = new Set<number>();
    for (const s of timedSubs) set.add(s.submittedAt as number);
    for (const e of timeline) {
      if (typeof e.timestamp === 'number' && e.timestamp > 0) set.add(e.timestamp);
    }
    if (typeof startedAt === 'number' && startedAt > 0) set.add(startedAt);
    if (typeof endedAt === 'number' && endedAt > 0) set.add(endedAt);
    return [...set].sort((a, b) => a - b);
  }, [timedSubs, timeline, startedAt, endedAt]);

  // Question-step fallback when there are no usable timestamps (e.g. commander
  // analysis view which only has per-question aggregates). t then walks the
  // canonical question order instead of wall-clock time.
  const useQuestionSteps = distinctTimes.length < 2 && questions.length > 0;
  const maxIdx = useQuestionSteps ? questions.length : Math.max(0, distinctTimes.length - 1);

  const [tIdx, setTIdx] = useState<number>(maxIdx);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setTIdx(maxIdx);
    setPlaying(false);
  }, [maxIdx]);

  useEffect(() => {
    if (!playing) return;
    if (tIdx >= maxIdx) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => setTIdx(v => Math.min(maxIdx, v + 1)), 800);
    return () => clearTimeout(id);
  }, [playing, tIdx, maxIdx]);

  const t: number | null = useQuestionSteps ? null : (distinctTimes[tIdx] ?? null);
  const prevT: number | null = useQuestionSteps ? null : (tIdx > 0 ? distinctTimes[tIdx - 1] : null);

  // Snapshot State(t): per-participant selections visible at t.
  const snapshot = useMemo(() => {
    const visible = new Map<string, Map<string, { selected: number; correct: boolean; submittedAt: number | null }>>();
    for (const p of participants) visible.set(p.userId, new Map());

    if (useQuestionSteps) {
      const qOrder = questions.slice(0, tIdx).map(q => q.id);
      const qSet = new Set(qOrder);
      for (const s of flatSubs) {
        if (!qSet.has(s.questionId)) continue;
        const m = visible.get(s.userId);
        if (m && !m.has(s.questionId)) m.set(s.questionId, { selected: s.selectedOption, correct: s.correct, submittedAt: s.submittedAt });
      }
    } else if (t !== null) {
      for (const s of timedSubs) {
        if ((s.submittedAt as number) > t) break;
        const m = visible.get(s.userId);
        if (m && !m.has(s.questionId)) m.set(s.questionId, { selected: s.selectedOption, correct: s.correct, submittedAt: s.submittedAt });
      }
      // Null-timestamp submissions only appear at the final tick.
      if (tIdx >= maxIdx) {
        for (const s of flatSubs) {
          if (s.submittedAt !== null) continue;
          const m = visible.get(s.userId);
          if (m && !m.has(s.questionId)) m.set(s.questionId, { selected: s.selectedOption, correct: s.correct, submittedAt: null });
        }
      }
    }

    const rows = participants.map(p => {
      const m = visible.get(p.userId)!;
      let answered = 0;
      let correct = 0;
      m.forEach(v => {
        answered++;
        if (v.correct) correct++;
      });
      return { participant: p, answered, correct, selections: m };
    });
    rows.sort((a, b) => {
      if (b.correct !== a.correct) return b.correct - a.correct;
      if ((b.participant.score ?? 0) !== (a.participant.score ?? 0)) return (b.participant.score ?? 0) - (a.participant.score ?? 0);
      return (a.participant.name || a.participant.userId).localeCompare(b.participant.name || b.participant.userId);
    });
    return rows;
  }, [participants, flatSubs, timedSubs, t, tIdx, maxIdx, useQuestionSteps, questions]);

  // Newly-applied deltas at this tick (diff vs previous tick) for highlighting.
  const newKeys = useMemo(() => {
    const set = new Set<string>();
    if (useQuestionSteps) {
      const q = questions[tIdx - 1];
      if (q) {
        for (const s of flatSubs) {
          if (s.questionId === q.id) set.add(`${s.userId}:${s.questionId}`);
        }
      }
      return set;
    }
    if (t === null) return set;
    for (const s of timedSubs) {
      const ts = s.submittedAt as number;
      if (ts <= t && (prevT === null || ts > prevT)) set.add(`${s.userId}:${s.questionId}`);
    }
    return set;
  }, [flatSubs, timedSubs, t, prevT, useQuestionSteps, questions, tIdx]);

  // Rank trajectories: per-tick correct-count series for the top 8 at final.
  const trajectories = useMemo(() => {
    if (engagement && engagement.length > 0 && useQuestionSteps) {
      const top = [...engagement].sort((a, b) => b.total - a.total).slice(0, 8);
      return top.map((g, i) => ({
        userId: g.gladiatorId,
        name: g.name,
        color: TRAJ_COLORS[i % TRAJ_COLORS.length],
        series: g.progression.slice(0, Math.max(1, tIdx)),
      }));
    }
    const finalCorrect = new Map<string, number>();
    for (const s of flatSubs) {
      if (s.correct) finalCorrect.set(s.userId, (finalCorrect.get(s.userId) ?? 0) + 1);
    }
    const nameById = new Map(participants.map(p => [p.userId, p.name || p.userId.slice(0, 8)]));
    const topIds = [...finalCorrect.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
    // Always include at least the top scorer if no correct answers exist.
    if (topIds.length === 0) {
      const byScore = [...participants].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 4);
      byScore.forEach(p => topIds.push(p.userId));
    }
    const tickCount = useQuestionSteps ? Math.max(1, tIdx) : Math.max(1, distinctTimes.length);
    const sampleIdx: number[] = tickCount <= 60
      ? Array.from({ length: tickCount }, (_, i) => i)
      : Array.from({ length: 60 }, (_, i) => Math.floor((i * (tickCount - 1)) / 59));

    return topIds.map((uid, i) => {
      const series: number[] = [];
      if (useQuestionSteps) {
        const qSlice = questions.slice(0, tIdx).map(q => q.id);
        const correctSet = new Set(flatSubs.filter(s => s.userId === uid && s.correct).map(s => s.questionId));
        let run = 0;
        for (const qid of qSlice) {
          if (correctSet.has(qid)) run++;
          series.push(run);
        }
      } else {
        for (const si of sampleIdx) {
          const tt = distinctTimes[si];
          let run = 0;
          for (const s of timedSubs) {
            if ((s.submittedAt as number) > tt) break;
            if (s.userId === uid && s.correct) run++;
          }
          series.push(run);
        }
      }
      return { userId: uid, name: nameById.get(uid) || uid.slice(0, 8), color: TRAJ_COLORS[i % TRAJ_COLORS.length], series };
    });
  }, [engagement, useQuestionSteps, flatSubs, participants, questions, tIdx, distinctTimes, timedSubs]);

  const maxTraj = Math.max(1, ...trajectories.flatMap(tr => tr.series));
  const logsAtT = useMemo(() => {
    if (useQuestionSteps || t === null) return timeline.slice(0, 10);
    return timeline.filter(e => typeof e.timestamp === 'number' && (e.timestamp as number) <= t).slice(0, 20);
  }, [timeline, t, useQuestionSteps]);

  const perQuestionAtT = useMemo(() => {
    return questions.map(q => {
      let answered = 0;
      let correct = 0;
      for (const row of snapshot) {
        const sel = row.selections.get(q.id);
        if (sel) {
          answered++;
          if (sel.correct) correct++;
        }
      }
      const finalSubmitted = q.questionStats?.submittedCount ?? flatSubs.filter(s => s.questionId === q.id).length;
      return { question: q, answered, correct, finalSubmitted };
    });
  }, [questions, snapshot, flatSubs]);

  if (questions.length === 0 && participants.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">No replay data available.</p>
        </CardContent>
      </Card>
    );
  }

  const totalTicks = maxIdx + 1;
  const progressPct = maxIdx > 0 ? Math.round((tIdx / maxIdx) * 100) : 100;

  return (
    <Card className="card-hover overflow-hidden">
      <CardHeader className="border-b border-border/30 pb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4 text-primary" /> {title}
          </CardTitle>
          <Badge variant="outline" className="text-[10px] font-mono">
            {useQuestionSteps ? `Q ${tIdx}/${questions.length}` : `t ${tIdx + 1}/${totalTicks} · ${formatTime(t)}`}
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1 font-mono">
          State(t) = State(0) + Σ Δe<sub>k</sub>·I(t<sub>k</sub> ≤ t) · read-only, no writes
        </p>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {/* Transport controls */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setTIdx(0)} disabled={tIdx === 0} aria-label="Restart replay">
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setTIdx(v => Math.max(0, v - 1))} disabled={tIdx === 0} aria-label="Previous event">
            <StepBack className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setPlaying(p => !p)} disabled={maxIdx === 0} aria-label={playing ? 'Pause replay' : 'Play replay'}>
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <Button variant="outline" size="icon" onClick={() => setTIdx(v => Math.min(maxIdx, v + 1))} disabled={tIdx >= maxIdx} aria-label="Next event">
            <StepForward className="w-4 h-4" />
          </Button>
          <div className="flex-1 px-2">
            <Slider value={[tIdx]} min={0} max={Math.max(0, maxIdx)} step={1} onValueChange={v => { setPlaying(false); setTIdx(v[0]); }} aria-label="Replay time scrubber" />
          </div>
          <span className="text-[11px] font-mono text-muted-foreground w-12 text-right tabular-nums">{progressPct}%</span>
        </div>

        {/* Rank trajectories */}
        <div className="rounded-[12px] border border-border/50 bg-muted/20 p-3">
          <p className="text-[11px] font-semibold mb-2 flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-warning" /> Rank trajectories {engagement && useQuestionSteps ? '(score progression)' : '(cumulative correct)'}
          </p>
          {trajectories.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No trajectory data.</p>
          ) : (
            <>
              <svg viewBox="0 0 300 110" className="w-full h-28" role="img" aria-label="Rank trajectories chart">
                {[0.25, 0.5, 0.75].map(f => (
                  <line key={f} x1="0" x2="300" y1={110 * f} y2={110 * f} stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
                ))}
                {trajectories.map(tr => {
                  if (tr.series.length === 0) return null;
                  const pts = tr.series.map((v, i) => {
                    const x = tr.series.length === 1 ? 300 : (i / (tr.series.length - 1)) * 300;
                    const y = 105 - (v / maxTraj) * 95;
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  }).join(' ');
                  return <polyline key={tr.userId} points={pts} fill="none" stroke={tr.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />;
                })}
              </svg>
              <div className="flex flex-wrap gap-2 mt-1">
                {trajectories.map(tr => (
                  <span key={tr.userId} className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: tr.color }} />
                    <span className="max-w-[120px] truncate">{tr.name}</span>
                    <span className="font-mono tabular-nums">{tr.series[tr.series.length - 1] ?? 0}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Leaderboard at t */}
        <div>
          <p className="text-[11px] font-semibold mb-1.5">Leaderboard at {useQuestionSteps ? `Q${tIdx}` : formatTime(t)} ({snapshot.length})</p>
          <div className="space-y-1 max-h-56 overflow-y-auto custom-scrollbar">
            {snapshot.slice(0, 20).map((row, idx) => (
              <div key={row.participant.userId} className={cn(
                'flex items-center gap-2.5 p-2 rounded-[10px] text-xs',
                idx === 0 && row.correct > 0 ? 'bg-warning/10 border border-warning/25' : 'bg-muted/30 border border-transparent'
              )}>
                <span className="w-5 text-center font-bold tabular-nums text-muted-foreground">{idx + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{row.participant.name || row.participant.userId.slice(0, 8)}</span>
                <span className="font-mono text-muted-foreground tabular-nums">{row.correct}/{row.answered}</span>
                <span className="font-bold tabular-nums w-10 text-right">{row.participant.score ?? 0}</span>
              </div>
            ))}
            {snapshot.length === 0 && <p className="text-[11px] text-muted-foreground">No participants.</p>}
          </div>
        </div>

        {/* Diff answer matrix at t */}
        <div>
          <p className="text-[11px] font-semibold mb-1.5">
            Answer matrix at {useQuestionSteps ? `Q${tIdx}` : formatTime(t)}
            <span className="ml-2 font-normal text-muted-foreground">highlight = Δ applied at this tick ({newKeys.size} new)</span>
          </p>
          <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
            {perQuestionAtT.map(({ question: q, answered, correct, finalSubmitted }, qi) => (
              <div key={q.id} className="border border-border/50 rounded-[10px] overflow-hidden">
                <div className="px-3 py-2 bg-muted/20 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold text-muted-foreground">Q{qi + 1}</span>
                  <span className="text-xs font-medium truncate flex-1 min-w-0">{q.text || 'Untitled question'}</span>
                  <span className="text-[10px] font-mono text-muted-foreground tabular-nums">{answered}/{finalSubmitted} answered · {correct} correct</span>
                </div>
                <div className="p-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                  {snapshot.slice(0, 24).map(row => {
                    const sel = row.selections.get(q.id);
                    const isNew = newKeys.has(`${row.participant.userId}:${q.id}`);
                    return (
                      <div key={row.participant.userId} className={cn(
                        'flex items-center gap-1.5 p-1.5 rounded-[8px] text-[10px] bg-background border',
                        sel?.correct === true ? 'border-success/40' : sel ? 'border-destructive/40' : 'border-border/40',
                        isNew && 'ring-1 ring-primary'
                      )} title={sel ? `Option ${sel.selected + 1}${sel.correct ? ' (correct)' : ''}` : 'No answer yet'}>
                        {sel?.correct === true
                          ? <CheckCircle2 className="w-3 h-3 text-success shrink-0" />
                          : sel ? <XCircle className="w-3 h-3 text-destructive shrink-0" />
                          : <span className="w-3 h-3 shrink-0 rounded-full bg-muted" />}
                        <span className="truncate flex-1">{row.participant.name || row.participant.userId.slice(0, 8)}</span>
                        <span className="font-mono text-muted-foreground shrink-0">{sel ? sel.selected + 1 : '—'}</span>
                      </div>
                    );
                  })}
                </div>
                {(q.options?.length ?? 0) > 0 && (
                  <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                    {(q.options || []).map((opt, oi) => (
                      <span key={oi} className={cn(
                        'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border',
                        q.correctAnswerIndex === oi ? 'border-success/40 bg-success/10 text-success' : 'border-border/40 text-muted-foreground'
                      )}>
                        {String.fromCharCode(65 + oi)} · {optionCountAt(q.questionStats, oi)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Battle-log context at t */}
        {logsAtT.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold mb-1.5">Battle log ≤ t ({logsAtT.length})</p>
            <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
              {logsAtT.slice(-10).map(e => (
                <div key={e.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">{(e.event || 'event').replace(/_/g, ' ')}</span>
                  {e.actor && <span>by {e.actor}</span>}
                  <span className="ml-auto font-mono shrink-0">{formatTime(e.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
