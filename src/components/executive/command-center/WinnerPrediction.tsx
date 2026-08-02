'use client';

import React from 'react';
import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { computeWinnerPrediction } from '@/lib/command-center';
import type { CommandBattle } from '@/lib/command-center';

interface Props {
  battle: CommandBattle;
}

export function WinnerPrediction({ battle }: Props) {
  const rows = computeWinnerPrediction(battle.participants, battle.questionCount, battle.current);

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Insufficient data — predictions appear once players start answering.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.slice(0, 4).map(row => (
        <div key={row.uid} className="space-y-1">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5 min-w-0">
              {row.lead && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
              <span className="truncate font-medium">{row.name || row.uid.slice(0, 8)}</span>
              <span className="text-muted-foreground tabular-nums">({row.score})</span>
            </span>
            <span className="font-semibold tabular-nums shrink-0 w-28 text-right">
              {row.probability}% · {Math.round(row.projected)}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-700 ease-out', row.lead ? 'bg-amber-400' : 'bg-primary/50')}
              style={{ width: `${row.probability}%` }}
            />
          </div>
        </div>
      ))}
      <p className="text-[10px] text-muted-foreground pt-1">
        Projection = current score + remaining questions × rate so far.
      </p>
    </div>
  );
}