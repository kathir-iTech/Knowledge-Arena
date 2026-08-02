'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { buildHeatmap, type HeatCell } from '@/lib/command-center';
import type { CommandBattle } from '@/lib/command-center';

const CELL_STYLE: Record<HeatCell, string> = {
  answered: 'bg-emerald-500',
  timedout: 'bg-amber-400',
  skipped: 'bg-slate-400',
  none: 'bg-muted/40',
  current: 'bg-primary/70 animate-pulse',
};

const CELL_LEGEND: Array<{ key: HeatCell; label: string }> = [
  { key: 'answered', label: 'Answered' },
  { key: 'timedout', label: 'Timed out' },
  { key: 'skipped', label: 'Skipped' },
  { key: 'current', label: 'Now' },
  { key: 'none', label: 'No answer' },
];

interface Props {
  battle: CommandBattle;
}

export function ActivityHeatmap({ battle }: Props) {
  const { rows, from, to } = buildHeatmap(battle, 12);
  const cols = to - from + 1;

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No participants in this battle yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-[10px] border border-border/50 p-2 overflow-x-auto custom-scrollbar">
        <div className="min-w-[420px]">
          <div className="flex items-center gap-1 mb-1 text-[9px] text-muted-foreground font-mono">
            <div className="w-32 shrink-0" />
            {Array.from({ length: cols }).map((_, i) => (
              <div key={i} className="flex-1 text-center">{from + i + 1}</div>
            ))}
          </div>
          {rows.map(row => (
            <div key={row.uid} className="flex items-center gap-1 py-0.5">
              <div className="w-32 shrink-0 truncate pr-2 text-[10px] text-muted-foreground">
                {row.name || row.uid.slice(0, 8)}
              </div>
              {row.overall.map((cell, i) => (
                <div
                  key={i}
                  className={cn('flex-1 h-3 rounded-[3px]', CELL_STYLE[cell])}
                  title={`Q${from + i + 1}: ${cell}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {CELL_LEGEND.map(legend => (
          <span key={legend.key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className={cn('w-2.5 h-2.5 rounded-[3px]', CELL_STYLE[legend.key])} />
            {legend.label}
          </span>
        ))}
      </div>
    </div>
  );
}